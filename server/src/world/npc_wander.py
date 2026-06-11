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
# Maximum stroll distance per tick.
STEP_DISTANCE = 2.5
# Chance an NPC actually moves on a given tick — pauses look alive.
MOVE_CHANCE = 0.6
# Only NPCs with a player within this range are simulated (and only those
# players are told). Matches the client's NPC full-update radius.
ACTIVE_RADIUS = 150.0
# Seconds between ticks.
TICK_SECONDS = 3.0


def _dist_xz(a: list[float], b: list[float]) -> float:
    dx = a[0] - b[0]
    dz = a[2] - b[2]
    return math.sqrt(dx * dx + dz * dz)


def step_npcs(
    world_state: WorldState,
    homes: dict[str, list[float]],
    rng: random.Random,
) -> list[dict[str, Any]]:
    """Advance every active NPC one wander step; return the position updates.

    An NPC is active when alive and within ACTIVE_RADIUS of any player. Each
    step is a bounded random stroll that never leaves WANDER_RADIUS around the
    NPC's home (its first-seen position, recorded in `homes`).
    """
    player_positions = [list(p.position) for p in world_state.players.values()]
    if not player_positions:
        return []

    updates: list[dict[str, Any]] = []
    for npc in world_state.npcs.values():
        if npc.hp <= 0:
            continue
        if not any(_dist_xz(npc.position, pp) <= ACTIVE_RADIUS for pp in player_positions):
            continue

        home = homes.setdefault(npc.npc_id, list(npc.position))
        if rng.random() > MOVE_CHANCE:
            continue

        angle = rng.uniform(0.0, math.tau)
        step = rng.uniform(STEP_DISTANCE * 0.3, STEP_DISTANCE)
        nx = npc.position[0] + math.cos(angle) * step
        nz = npc.position[2] + math.sin(angle) * step

        # Clamp to the wander disc around home — overshoot walks back inward.
        hx, hz = home[0], home[2]
        dx, dz = nx - hx, nz - hz
        dist = math.sqrt(dx * dx + dz * dz)
        if dist > WANDER_RADIUS:
            scale = WANDER_RADIUS / dist
            nx = hx + dx * scale
            nz = hz + dz * scale

        # y is intentionally left as-is: clients resolve terrain height locally.
        npc.position = [nx, npc.position[1], nz]
        updates.append({"npcId": npc.npc_id, "position": [nx, npc.position[1], nz]})

    return updates


async def npc_wander_loop(world_state: WorldState, manager: ConnectionManager) -> None:
    """Background tick: step active NPCs and notify the players who see them."""
    homes: dict[str, list[float]] = {}
    rng = random.Random()
    while True:
        await asyncio.sleep(TICK_SECONDS)
        try:
            async with world_state._lock:
                updates = step_npcs(world_state, homes, rng)
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
