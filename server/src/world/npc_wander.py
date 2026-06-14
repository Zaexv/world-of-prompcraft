"""Server-authoritative NPC wandering.

The server is the single source of truth for NPC positions: a background tick
randomly strolls every living NPC that has a player nearby, then pushes the new
positions to the players who can see them. Clients render the motion (walking
the NPC toward the target, resolving terrain height locally) but never decide
it — so every player sees each NPC in the same place.

The stepping logic is pure (`step_npcs`) and separated from the asyncio loop
(`npc_wander_loop`) so it can be unit-tested deterministically with a seeded
RNG.
"""

from __future__ import annotations

import asyncio
import logging
import math
import random
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ..ws.connection_manager import ConnectionManager
    from .world_state import WorldState

logger = logging.getLogger(__name__)

# How far an NPC may drift from its home (spawn) position.
WANDER_RADIUS = 8.0
# Floor so even small-radius NPCs roam visibly (no near-frozen pacing).
MIN_WANDER_RADIUS = 6.0
# Only NPCs with a player within this range are simulated (and only those
# players are told). Matches the client's NPC full-update radius.
ACTIVE_RADIUS = 150.0
# Seconds between ticks. Short so the client gets a fresh target often and walks
# continuously (no synchronized walk-then-idle rhythm).
TICK_SECONDS = 1.0

# Per movement-style behaviour, so a guard patrols steadily, a sprite drifts,
# an orc stomps, etc. `step` = distance covered per tick (its pace); `turn` = how
# sharply it can change direction at a waypoint (radians); `pause` = how long it
# may rest on arriving at a waypoint (seconds, max). Each NPC walks its OWN path
# of waypoints at its OWN pace and rests on its OWN schedule, so they never move
# in lockstep.
MOVEMENT_PROFILES: dict[str, dict[str, float]] = {
    "stroll": {"step": 1.4, "turn": 0.6, "pause": 4.0},
    "patrol": {"step": 1.9, "turn": 0.3, "pause": 1.5},
    "prowl": {"step": 2.1, "turn": 0.9, "pause": 2.0},
    "float": {"step": 1.0, "turn": 1.1, "pause": 5.0},
    "swagger": {"step": 1.2, "turn": 0.5, "pause": 4.5},
    "stomp": {"step": 1.6, "turn": 0.4, "pause": 3.0},
}
_DEFAULT_PROFILE = MOVEMENT_PROFILES["stroll"]
# Odds of striking out in a fresh random direction instead of continuing roughly
# straight when choosing the next waypoint.
REPICK_HEADING_CHANCE = 0.25
# Nominal client navigation speed (m/s), used to estimate how long an NPC will
# spend walking a goal leg so the server schedules the next goal afterwards.
NAV_SPEED = 1.5
# Odds of resting on arrival at a goal (rest length is the style `pause`).
ARRIVE_PAUSE_CHANCE = 0.35
# After a player summons an NPC (npc_move), the wander loop leaves it alone for
# this long so it stays with the player instead of strolling off. Each summon
# refreshes the window, so it holds for the whole conversation.
SUPPRESS_AFTER_MOVE_SECONDS = 8.0


def _dist_xz(a: list[float], b: list[float]) -> float:
    dx = a[0] - b[0]
    dz = a[2] - b[2]
    return math.sqrt(dx * dx + dz * dz)


def step_npcs(
    world_state: WorldState,
    homes: dict[str, list[float]],
    rng: random.Random,
    now: float = 0.0,
    headings: dict[str, float] | None = None,
    next_goal_at: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Assign each active NPC its next roam GOAL; return the goal updates.

    Server owns INTENT, not motion: it hands each NPC a destination within its
    wander radius of home (`homes[id]`), using a persistent `headings[id]` for
    coherent paths, then schedules the next goal after the estimated walk time
    plus an optional rest (`next_goal_at[id]`). The client navigates to the goal
    with real terrain + collision. Independent leg lengths, paces and rests mean
    NPCs never move in lockstep. ``now`` is a monotonic clock.

    An NPC is active when alive and within ACTIVE_RADIUS of any player. Each
    returned update is ``{"npcId", "position": [x, y, z]}`` where the position is
    the goal; `npc.position` is advanced to the goal optimistically (authoritative
    + persisted), the client smooths the actual walk.
    """
    player_positions = [list(p.position) for p in world_state.players.values()]
    if not player_positions:
        return []
    if headings is None:
        headings = {}
    if next_goal_at is None:
        next_goal_at = {}

    updates: list[dict[str, Any]] = []
    for npc in world_state.npcs.values():
        if npc.hp <= 0:
            continue
        # Fixed NPCs hold their authored spot (rooftops, shopkeepers, etc.).
        if npc.fixed:
            continue
        # Recently summoned by a player — hold (the follow target owns it).
        if npc.wander_suppressed_until > now:
            continue
        # Still walking the current goal leg (or resting) — its own schedule.
        if now < next_goal_at.get(npc.npc_id, 0.0):
            continue
        # Every non-fixed NPC roams. Floor the radius so small-radius NPCs still
        # cover visible ground.
        radius = max(MIN_WANDER_RADIUS, npc.wander_radius or WANDER_RADIUS)
        if not any(_dist_xz(npc.position, pp) <= ACTIVE_RADIUS for pp in player_positions):
            continue

        prof = MOVEMENT_PROFILES.get(npc.movement_style or "", _DEFAULT_PROFILE)
        home = homes.setdefault(npc.npc_id, list(npc.position))
        cx, cz = npc.position[0], npc.position[2]

        # Pick the next goal: continue roughly straight (coherent path) or strike
        # out fresh, a leg of random length within the wander disc around home.
        heading = headings.get(npc.npc_id)
        if heading is None or rng.random() < REPICK_HEADING_CHANCE:
            heading = rng.uniform(0.0, math.tau)
        else:
            heading += rng.gauss(0.0, prof["turn"])
        leg = rng.uniform(radius * 0.4, radius)
        tx = cx + math.cos(heading) * leg
        tz = cz + math.sin(heading) * leg
        dx, dz = tx - home[0], tz - home[2]
        d = math.hypot(dx, dz)
        if d > radius:
            tx = home[0] + dx / d * radius
            tz = home[2] + dz / d * radius
        headings[npc.npc_id] = heading

        # Schedule the next goal after the estimated walk + an optional rest, so
        # each NPC retargets on its own clock (no lockstep).
        travel = math.hypot(tx - cx, tz - cz) / NAV_SPEED
        rest = rng.uniform(1.0, prof["pause"]) if rng.random() < ARRIVE_PAUSE_CHANCE else 0.0
        next_goal_at[npc.npc_id] = now + travel + rest

        # y left as-is: the client resolves terrain height while navigating.
        npc.position = [tx, npc.position[1], tz]
        updates.append({"npcId": npc.npc_id, "position": [tx, npc.position[1], tz]})

    return updates


async def npc_wander_loop(world_state: WorldState, manager: ConnectionManager) -> None:
    """Background tick: step active NPCs and notify the players who see them."""
    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    next_goal_at: dict[str, float] = {}
    rng = random.Random()
    while True:
        await asyncio.sleep(TICK_SECONDS)
        try:
            now = asyncio.get_event_loop().time()
            async with world_state._lock:
                updates = step_npcs(world_state, homes, rng, now, headings, next_goal_at)
            if not updates:
                continue
            # Each player receives only the NPCs near them.
            for player_id, player in list(world_state.players.items()):
                ppos = list(player.position)
                subset = [
                    u for u in updates if _dist_xz(list(u["position"]), ppos) <= ACTIVE_RADIUS
                ]
                if subset:
                    await manager.send_to(player_id, {"type": "npc_positions", "updates": subset})
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("NPC wander tick failed")
