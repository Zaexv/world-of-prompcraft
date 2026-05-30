"""Tests for WorldState and NPCData."""

from __future__ import annotations

import pytest

from src.world.world_state import NPCData, WorldState


@pytest.fixture(autouse=True)
def _reset_world_state() -> None:
    """Reset the WorldState singleton before each test."""
    WorldState._instance = None


def test_npc_data_to_dict() -> None:
    npc = NPCData(
        npc_id="npc_1",
        name="Tester",
        personality="test",
        hp=75,
        max_hp=100,
        position=[1.0, 2.0, 3.0],
        mood="angry",
    )
    d = npc.to_dict()
    assert d["npc_id"] == "npc_1"
    assert d["hp"] == 75
    assert d["maxHp"] == 100
    assert d["mood"] == "angry"
    assert d["position"] == [1.0, 2.0, 3.0]


def test_world_state_singleton() -> None:
    ws1 = WorldState()
    ws2 = WorldState()
    assert ws1 is ws2


def test_world_state_loads_default_npcs() -> None:
    ws = WorldState()
    assert len(ws.npcs) >= 1
    assert "tutorial_01" in ws.npcs


def test_get_player_creates_default() -> None:
    ws = WorldState()
    player = ws.get_player("new_player")
    assert player.hp == 100
    assert "new_player" in ws.players


def test_get_npc_config() -> None:
    ws = WorldState()
    config = ws.get_npc_config("tutorial_01")
    assert config["name"] == "Tutorial-Man"
    assert "personality" in config

    unknown = ws.get_npc_config("nonexistent")
    assert unknown["name"] == "Unknown"


@pytest.mark.asyncio
async def test_apply_damage_player() -> None:
    ws = WorldState()
    player = ws.get_player("p1")
    player.hp = 100
    await ws.apply_actions(
        [
            {"kind": "damage", "params": {"target": "player", "player_id": "p1", "amount": 30}},
        ]
    )
    assert player.hp == 70


@pytest.mark.asyncio
async def test_apply_heal_player() -> None:
    ws = WorldState()
    player = ws.get_player("p1")
    player.hp = 50
    await ws.apply_actions(
        [
            {"kind": "heal", "params": {"target": "player", "player_id": "p1", "amount": 30}},
        ]
    )
    assert player.hp == 80


@pytest.mark.asyncio
async def test_apply_heal_does_not_exceed_max() -> None:
    ws = WorldState()
    player = ws.get_player("p1")
    player.hp = 90
    await ws.apply_actions(
        [
            {"kind": "heal", "params": {"target": "player", "player_id": "p1", "amount": 50}},
        ]
    )
    assert player.hp == player.max_hp


@pytest.mark.asyncio
async def test_apply_damage_npc() -> None:
    ws = WorldState()
    npc = ws.npcs["tutorial_01"]
    original_hp = npc.hp
    await ws.apply_actions(
        [
            {"kind": "damage_npc", "params": {"npc_id": "tutorial_01", "amount": 100}},
        ]
    )
    assert npc.hp == original_hp - 100


@pytest.mark.asyncio
async def test_apply_damage_npc_floor_zero() -> None:
    ws = WorldState()
    npc = ws.npcs["tutorial_01"]
    await ws.apply_actions(
        [
            {"kind": "damage_npc", "params": {"npc_id": "tutorial_01", "amount": 9999}},
        ]
    )
    assert npc.hp == 0


@pytest.mark.asyncio
async def test_apply_give_item() -> None:
    ws = WorldState()
    await ws.apply_actions(
        [
            {"kind": "give_item", "params": {"player_id": "p1", "item": "Health Potion"}},
        ]
    )
    player = ws.get_player("p1")
    assert "Health Potion" in player.inventory


@pytest.mark.asyncio
async def test_apply_remove_item() -> None:
    ws = WorldState()
    player = ws.get_player("p1")
    player.inventory = ["Sword", "Shield"]
    await ws.apply_actions(
        [
            {"kind": "remove_item", "params": {"player_id": "p1", "item": "Sword"}},
        ]
    )
    assert player.inventory == ["Shield"]


@pytest.mark.asyncio
async def test_apply_change_weather() -> None:
    ws = WorldState()
    await ws.apply_actions(
        [
            {"kind": "change_weather", "params": {"weather": "storm"}},
        ]
    )
    assert ws.environment["weather"] == "storm"


def test_get_context_for_npc() -> None:
    ws = WorldState()
    ctx = ws.get_context_for_npc("tutorial_01", "p1")
    assert ctx["npc_id"] == "tutorial_01"
    assert "zone" in ctx
    assert "weather" in ctx
    assert "nearby_entities" in ctx
    assert isinstance(ctx["nearby_entities"], list)
    assert "player_active_quests" in ctx


def test_get_nearby_npcs_returns_nearest_with_limit() -> None:
    ws = WorldState()
    ws.npcs = {
        "npc_close": NPCData(
            npc_id="npc_close", name="Close", personality="p", position=[1.0, 0.0, 0.0]
        ),
        "npc_mid": NPCData(npc_id="npc_mid", name="Mid", personality="p", position=[3.0, 0.0, 0.0]),
        "npc_far": NPCData(npc_id="npc_far", name="Far", personality="p", position=[8.0, 0.0, 0.0]),
        "npc_dead": NPCData(
            npc_id="npc_dead",
            name="Dead",
            personality="p",
            position=[0.5, 0.0, 0.0],
            hp=0,
            max_hp=100,
        ),
    }

    nearby = ws.get_nearby_npcs([0.0, 0.0, 0.0], 10.0, limit=2)
    assert [npc.npc_id for npc in nearby] == ["npc_close", "npc_mid"]


def test_get_nearby_npcs_zero_limit_returns_empty() -> None:
    ws = WorldState()
    assert ws.get_nearby_npcs([0.0, 0.0, 0.0], 100.0, limit=0) == []


@pytest.mark.asyncio
async def test_apply_actions_accepts_quest_aliases_and_moves_without_y() -> None:
    ws = WorldState()
    npc = ws.npcs["tutorial_01"]
    npc.position = [10.0, 4.0, 10.0]

    await ws.apply_actions(
        [
            {
                "kind": "start_quest",
                "params": {"questId": "sacred_flame"},
            },
            {
                "kind": "complete_quest",
                "params": {"questId": "sacred_flame"},
            },
            {
                "kind": "move_npc",
                "params": {"npc_id": "tutorial_01", "position": [15.0, None, 20.0]},
            },
        ]
    )

    player = ws.get_player("default")
    assert player.has_completed_quest("sacred_flame")
    assert npc.position == [15.0, 4.0, 20.0]
