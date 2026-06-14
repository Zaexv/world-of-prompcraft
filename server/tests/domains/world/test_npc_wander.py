"""Tests for server-authoritative NPC roaming intent (src/world/npc_wander.py).

The server assigns roam GOALS (it owns intent); clients navigate to them. Each
``step_npcs`` call returns the goals chosen this tick and advances
``npc.position`` to the goal optimistically. Tests advance ``now`` so the per-NPC
goal schedule (next_goal_at) actually fires across iterations.
"""

from __future__ import annotations

import math
import random
from typing import Any

import pytest

from src.world.npc_wander import ACTIVE_RADIUS, WANDER_RADIUS, step_npcs
from src.world.world_state import NPCData, WorldState


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


def _spawn(world: WorldState, npc_id: str, position: list[float], hp: int = 100) -> NPCData:
    npc = NPCData(
        npc_id=npc_id,
        name="Walker",
        personality="test",
        hp=hp,
        max_hp=100,
        position=position,
    )
    world.npcs[npc_id] = npc
    return npc


def test_no_players_no_movement() -> None:
    world = WorldState()
    _spawn(world, "n1", [10.0, 0.0, 10.0])

    updates = step_npcs(world, {}, random.Random(42))

    assert updates == []
    assert world.npcs["n1"].position == [10.0, 0.0, 10.0]


def test_npc_near_player_roams_within_radius_of_home() -> None:
    world = WorldState()
    _spawn(world, "n1", [10.0, 2.0, 10.0])
    player = world.get_player("p1")
    player.position = [12.0, 0.0, 12.0]

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    sched: dict[str, float] = {}
    rng = random.Random(7)
    for t in range(200):  # many goal legs — drift must stay bounded
        step_npcs(world, homes, rng, float(t), headings, sched)

    assert homes["n1"] == [10.0, 2.0, 10.0], "home anchors at the first-seen position"
    pos = world.npcs["n1"].position
    dist_from_home = math.sqrt((pos[0] - 10.0) ** 2 + (pos[2] - 10.0) ** 2)
    assert dist_from_home <= WANDER_RADIUS + 1e-9
    assert pos[1] == 2.0, "y untouched — clients resolve terrain height"


def test_far_npc_and_dead_npc_do_not_move() -> None:
    world = WorldState()
    _spawn(world, "far", [ACTIVE_RADIUS * 3, 0.0, 0.0])
    _spawn(world, "dead", [5.0, 0.0, 5.0], hp=0)
    player = world.get_player("p1")
    player.position = [0.0, 0.0, 0.0]

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    sched: dict[str, float] = {}
    rng = random.Random(1)
    for t in range(50):
        updates = step_npcs(world, homes, rng, float(t), headings, sched)
        assert all(u["npcId"] not in ("far", "dead") for u in updates)

    assert world.npcs["far"].position == [ACTIVE_RADIUS * 3, 0.0, 0.0]
    assert world.npcs["dead"].position == [5.0, 0.0, 5.0]


def test_fixed_npc_never_moves() -> None:
    world = WorldState()
    npc = _spawn(world, "statue", [5.0, 0.0, 5.0])
    npc.fixed = True
    player = world.get_player("p1")
    player.position = [5.0, 0.0, 5.0]

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    sched: dict[str, float] = {}
    rng = random.Random(9)
    for t in range(100):
        updates = step_npcs(world, homes, rng, float(t), headings, sched)
        assert all(u["npcId"] != "statue" for u in updates)

    assert world.npcs["statue"].position == [5.0, 0.0, 5.0]


def test_every_non_fixed_npc_roams() -> None:
    # Only `fixed` makes an NPC static — every other active NPC gets roam goals,
    # even with wander_radius 0 (floored to MIN_WANDER_RADIUS).
    world = WorldState()
    _spawn(world, "a", [5.0, 0.0, 5.0])
    rooted = _spawn(world, "b", [6.0, 0.0, 6.0])
    rooted.wander_radius = 0
    player = world.get_player("p1")
    player.position = [5.0, 0.0, 5.0]

    rng = random.Random(11)
    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    sched: dict[str, float] = {}
    moved = {"a": False, "b": False}
    for t in range(40):
        for u in step_npcs(world, homes, rng, float(t), headings, sched):
            moved[u["npcId"]] = True
    assert moved["a"] and moved["b"], "every active non-fixed NPC must get roam goals"


def test_summoned_npc_is_left_alone_until_suppression_expires() -> None:
    world = WorldState()
    npc = _spawn(world, "summoned", [5.0, 0.0, 5.0])
    npc.wander_suppressed_until = 100.0  # suppressed until t=100
    player = world.get_player("p1")
    player.position = [5.0, 0.0, 5.0]

    rng = random.Random(13)
    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    sched: dict[str, float] = {}

    # Before expiry: never assigned a goal no matter how many ticks.
    for t in range(50):
        updates = step_npcs(world, homes, rng, float(t), headings, sched)
        assert all(u["npcId"] != "summoned" for u in updates)
    assert world.npcs["summoned"].position == [5.0, 0.0, 5.0]

    # After expiry: free to roam again.
    moved = False
    for t in range(101, 200):
        if any(
            u["npcId"] == "summoned"
            for u in step_npcs(world, homes, rng, float(t), headings, sched)
        ):
            moved = True
            break
    assert moved, "roaming resumes once suppression expires"


def test_per_npc_wander_radius_overrides_default() -> None:
    world = WorldState()
    npc = _spawn(world, "rover", [10.0, 0.0, 10.0])
    npc.wander_radius = 20.0  # wider than the default WANDER_RADIUS
    player = world.get_player("p1")
    player.position = [10.0, 0.0, 10.0]

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    sched: dict[str, float] = {}
    rng = random.Random(5)
    max_dist = 0.0
    for t in range(400):
        step_npcs(world, homes, rng, float(t), headings, sched)
        pos = world.npcs["rover"].position
        max_dist = max(max_dist, math.sqrt((pos[0] - 10.0) ** 2 + (pos[2] - 10.0) ** 2))

    assert max_dist <= 20.0 + 1e-9
    assert max_dist > WANDER_RADIUS, "the wider per-NPC radius is actually used"


def test_updates_carry_npc_id_and_goal_position() -> None:
    world = WorldState()
    # Far from the origin so the world's built-in starter NPCs stay inactive.
    _spawn(world, "n1", [1000.0, 0.0, 1000.0])
    player = world.get_player("p1")
    player.position = [1000.0, 0.0, 1000.0]

    homes: dict[str, list[float]] = {}
    headings: dict[str, float] = {}
    sched: dict[str, float] = {}
    rng = random.Random(3)
    updates: list[dict[str, Any]] = []
    for t in range(40):
        updates.extend(step_npcs(world, homes, rng, float(t), headings, sched))
    assert updates, "an adjacent NPC must get a goal within the window"
    for u in updates:
        assert u["npcId"] == "n1"
        assert len(u["position"]) == 3
    # The last reported goal is the NPC's authoritative position.
    assert updates[-1]["position"] == world.npcs["n1"].position
