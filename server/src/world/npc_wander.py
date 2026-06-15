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
    from .world_geometry import WorldGeometry
    from .world_state import NPCData, WorldState

logger = logging.getLogger(__name__)

# How far an NPC may drift from its home (spawn) position.
WANDER_RADIUS = 8.0
# Floor so even small-radius NPCs roam visibly (no near-frozen pacing).
MIN_WANDER_RADIUS = 6.0
# Floor per-tick step so every move clears the client's apply threshold (~0.6m)
# and reads as actual walking, never an imperceptible nudge.
MIN_STEP = 1.0
# Maximum stroll distance per tick.
STEP_DISTANCE = 2.5
# Chance an NPC actually moves on a given tick — pauses look alive.
MOVE_CHANCE = 0.6
# Only NPCs with a player within this range are simulated (and only those
# players are told). Matches the client's NPC full-update radius.
ACTIVE_RADIUS = 150.0
# Seconds between ticks.
TICK_SECONDS = 3.0

# Per movement-style behaviour, so a guard patrols steadily, a sprite drifts,
# an orc stomps in bursts, etc. `move_chance` = odds of moving this tick (pauses
# look alive); `step` = max stroll distance; `turn` = how sharply the heading can
# change when continuing a stroll (radians). Keeping a heading between ticks makes
# NPCs walk a path instead of teleport-jittering in place.
MOVEMENT_PROFILES: dict[str, dict[str, float]] = {
    "stroll": {"move_chance": 0.60, "step": 2.5, "turn": 0.5},
    "patrol": {"move_chance": 0.85, "step": 3.2, "turn": 0.2},
    "prowl": {"move_chance": 0.75, "step": 2.8, "turn": 0.7},
    "float": {"move_chance": 0.45, "step": 1.8, "turn": 0.9},
    "swagger": {"move_chance": 0.50, "step": 2.2, "turn": 0.4},
    "stomp": {"move_chance": 0.55, "step": 2.6, "turn": 0.3},
}
_DEFAULT_PROFILE = MOVEMENT_PROFILES["stroll"]
# Odds of re-picking a fresh random heading instead of continuing the current one.
REPICK_HEADING_CHANCE = 0.2
# After a player summons an NPC (npc_move), the wander loop leaves it alone for
# this long so it stays with the player instead of strolling off. Each summon
# refreshes the window, so it holds for the whole conversation.
SUPPRESS_AFTER_MOVE_SECONDS = 8.0
# Summon: when a player calls an NPC over, the server walks it toward the player a
# bounded amount per tick — small enough that the client renders a walk, never a
# >25m "teleport" jump. ~one tick of NPC walking speed so motion stays continuous.
SUMMON_STEP = 6.0
# Stop this far from the target so a summoned NPC stands beside the player, not on
# top of them.
SUMMON_ARRIVE = 2.5


def step_summon(npc: NPCData) -> bool:
    """Advance a summoned NPC one bounded step toward its summon target.

    Returns True if the NPC moved (so the caller broadcasts the new position).
    Clears the target on arrival so the NPC idles beside the player instead of
    jittering on top of them. y is left untouched — clients resolve terrain height.
    """
    target = npc.summon_target
    if target is None:
        return False
    dx = target[0] - npc.position[0]
    dz = target[2] - npc.position[2]
    dist = math.sqrt(dx * dx + dz * dz)
    if dist <= SUMMON_ARRIVE:
        npc.summon_target = None
        return False
    step = min(SUMMON_STEP, dist - SUMMON_ARRIVE)
    nx = npc.position[0] + dx / dist * step
    nz = npc.position[2] + dz / dist * step
    npc.position = [nx, npc.position[1], nz]
    return True


def _dist_xz(a: list[float], b: list[float]) -> float:
    dx = a[0] - b[0]
    dz = a[2] - b[2]
    return math.sqrt(dx * dx + dz * dz)


# When a step lands inside a structure, try slipping around it at these heading
# offsets (radians) before giving up for the tick. Mix of gentle and hard turns.
_DETOUR_OFFSETS = (0.6, -0.6, 1.2, -1.2, 2.0, -2.0, math.pi)


def step_npcs(
    world_state: WorldState,
    homes: dict[str, list[float]],
    rng: random.Random,
    now: float = 0.0,
    headings: dict[str, float] | None = None,
    geometry: WorldGeometry | None = None,
) -> list[dict[str, Any]]:
    """Advance every active NPC one wander step; return the position updates.

    An NPC is active when alive and within ACTIVE_RADIUS of any player. Each step
    is a bounded stroll that never leaves the NPC's wander radius around its home
    (first-seen position, recorded in `homes`). Per-NPC `headings` persist between
    ticks so movement reads as walking a path, shaped by the NPC's movement_style
    (see MOVEMENT_PROFILES). ``now`` is a monotonic clock for wander suppression.
    """
    player_positions = [list(p.position) for p in world_state.players.values()]
    if not player_positions:
        return []
    if headings is None:
        headings = {}

    updates: list[dict[str, Any]] = []
    for npc in world_state.npcs.values():
        if npc.hp <= 0:
            continue
        # Fixed NPCs hold their authored spot (rooftops, shopkeepers, etc.); a
        # wander_radius of 0 is treated the same way.
        if npc.fixed:
            continue
        # Recently summoned by a player — don't wander. Instead walk toward the
        # summon target (the player) a bounded step, so it approaches on its own
        # legs rather than teleporting. Idles once it arrives.
        if npc.wander_suppressed_until > now:
            if step_summon(npc):
                updates.append({"npcId": npc.npc_id, "position": list(npc.position)})
            continue
        # Every non-fixed NPC roams. Floor the radius so small-radius NPCs still
        # cover visible ground (the user wants all of them moving, not pacing in
        # a tiny circle).
        radius = max(MIN_WANDER_RADIUS, npc.wander_radius or WANDER_RADIUS)
        if not any(_dist_xz(npc.position, pp) <= ACTIVE_RADIUS for pp in player_positions):
            continue

        prof = MOVEMENT_PROFILES.get(npc.movement_style or "", _DEFAULT_PROFILE)
        # No move-chance skip: every active NPC takes a step every tick so none
        # ever look frozen. Style still shapes step length, turn, and path.

        home = homes.setdefault(npc.npc_id, list(npc.position))

        # A footprint is a wall only to NPCs that DON'T live in it. Many NPCs are
        # authored to stand inside a landmark (the Amphitheatre Manolos on their
        # stage, merchants in their shop) — for them the footprint is home, not an
        # obstacle, so enforcing it would trap them. Only block NPCs whose home is
        # in the clear from walking INTO a building.
        enforce_geometry = geometry is not None and not geometry.is_blocked(home[0], home[2])

        # Continue the current heading with a gentle turn (a path), or occasionally
        # strike out in a fresh direction.
        heading = headings.get(npc.npc_id)
        if heading is None or rng.random() < REPICK_HEADING_CHANCE:
            heading = rng.uniform(0.0, math.tau)
        else:
            heading += rng.gauss(0.0, prof["turn"])

        step = rng.uniform(max(MIN_STEP, prof["step"] * 0.5), prof["step"])
        nx = npc.position[0] + math.cos(heading) * step
        nz = npc.position[2] + math.sin(heading) * step

        # Clamp to the wander disc around home; at the boundary, turn back inward
        # so the NPC paces the area instead of pressing against the edge.
        hx, hz = home[0], home[2]
        dx, dz = nx - hx, nz - hz
        dist = math.sqrt(dx * dx + dz * dz)
        if dist > radius:
            scale = radius / dist
            nx = hx + dx * scale
            nz = hz + dz * scale
            heading = math.atan2(hz - nz, hx - nx)  # face home for the next tick

        # Don't step into a structure (authored landmark footprints). Try slipping
        # around it at a few heading offsets, keeping inside the wander disc; if
        # nowhere is clear this tick, hold position and re-aim for the next one.
        if enforce_geometry and geometry is not None and geometry.is_blocked(nx, nz):
            slipped = False
            for off in _DETOUR_OFFSETS:
                ah = heading + off
                ax = npc.position[0] + math.cos(ah) * step
                az = npc.position[2] + math.sin(ah) * step
                if math.sqrt((ax - hx) ** 2 + (az - hz) ** 2) > radius:
                    continue
                if not geometry.is_blocked(ax, az):
                    nx, nz, heading, slipped = ax, az, ah, True
                    break
            if not slipped:
                # Boxed in — stay put, pick a fresh heading to probe next tick.
                headings[npc.npc_id] = rng.uniform(0.0, math.tau)
                continue

        headings[npc.npc_id] = heading
        # y is intentionally left as-is: clients resolve terrain height locally.
        npc.position = [nx, npc.position[1], nz]
        updates.append({"npcId": npc.npc_id, "position": [nx, npc.position[1], nz]})

    return updates


async def npc_wander_loop(world_state: WorldState, manager: ConnectionManager) -> None:
    """Background tick: step active NPCs and notify the players who see them."""
    from .world_geometry import load_world_geometry

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    rng = random.Random()
    # Authored landmark footprints (towns) so wandering NPCs don't clip buildings.
    geometry = load_world_geometry()
    while True:
        await asyncio.sleep(TICK_SECONDS)
        try:
            now = asyncio.get_event_loop().time()
            async with world_state._lock:
                updates = step_npcs(world_state, homes, rng, now, headings, geometry)
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
