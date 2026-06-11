"""Tests for server-authoritative NPC wandering (src/world/npc_wander.py)."""

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


def test_npc_near_player_wanders_within_radius_of_home() -> None:
    world = WorldState()
    _spawn(world, "n1", [10.0, 2.0, 10.0])
    player = world.get_player("p1")
    player.position = [12.0, 0.0, 12.0]

    homes: dict[str, list[float]] = {}
    rng = random.Random(7)
    for _ in range(200):  # many ticks — drift must stay bounded
        step_npcs(world, homes, rng)

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

    rng = random.Random(1)
    for _ in range(50):
        updates = step_npcs(world, {}, rng)
        assert all(u["npcId"] not in ("far", "dead") for u in updates)

    assert world.npcs["far"].position == [ACTIVE_RADIUS * 3, 0.0, 0.0]
    assert world.npcs["dead"].position == [5.0, 0.0, 5.0]


def test_updates_carry_npc_id_and_new_position() -> None:
    world = WorldState()
    # Far from the origin so the world's built-in starter NPCs stay inactive.
    _spawn(world, "n1", [1000.0, 0.0, 1000.0])
    player = world.get_player("p1")
    player.position = [1000.0, 0.0, 1000.0]

    rng = random.Random(3)
    updates: list[dict[str, Any]] = []
    for _ in range(20):
        updates.extend(step_npcs(world, {}, rng))
    assert updates, "an adjacent NPC must move within 20 ticks"
    for u in updates:
        assert u["npcId"] == "n1"
        assert len(u["position"]) == 3
    # The last reported position is the NPC's authoritative position.
    assert updates[-1]["position"] == world.npcs["n1"].position
