"""Tests for the SQLite game store (src/persistence/store.py)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest

if TYPE_CHECKING:
    from pathlib import Path

from src.persistence import GameStore
from src.world.world_state import NPCData, WorldState


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


@pytest.fixture
def store(tmp_path: Path) -> Any:
    s = GameStore(tmp_path / "world.db")
    yield s
    s.close()


def _fresh_store(tmp_path: Path) -> GameStore:
    """Reopen the same database file — simulates a server restart."""
    return GameStore(tmp_path / "world.db")


def test_player_roundtrip(store: GameStore) -> None:
    world = WorldState()
    player = world.get_player("zaex")
    player.username = "zaex"
    player.hp = 42
    player.gold = 999
    player.inventory = ["Health Potion", "Rusty Sword"]
    player.position = [10.0, 2.0, -5.0]

    store.save_player("zaex", player)
    doc = store.load_player("zaex")

    assert doc is not None
    assert doc["hp"] == 42
    assert doc["gold"] == 999
    assert doc["inventory"] == ["Health Potion", "Rusty Sword"]
    assert doc["position"] == [10.0, 2.0, -5.0]


def test_load_unknown_player_returns_none(store: GameStore) -> None:
    assert store.load_player("nobody") is None


def test_world_roundtrip_restores_player_and_npc_state(tmp_path: Path, store: GameStore) -> None:
    world = WorldState()
    player = world.get_player("zaex")
    player.username = "zaex"
    player.hp = 55
    npc_id = next(iter(world.npcs))
    world.npcs[npc_id].hp = 7
    world.npcs[npc_id].position = [123.0, 4.0, -56.0]

    store.save_world(world)
    store.close()

    # Simulate restart: fresh WorldState + fresh store over the same file.
    WorldState._instance = None
    world2 = WorldState()
    store2 = _fresh_store(tmp_path)
    try:
        restored = store2.restore_world(world2)
        assert restored >= 2
        assert world2.npcs[npc_id].hp == 7
        assert world2.npcs[npc_id].position == [123.0, 4.0, -56.0]
        assert world2.players["zaex"].hp == 55
    finally:
        store2.close()


def test_dead_procedural_npc_restored_as_corpse(tmp_path: Path, store: GameStore) -> None:
    """A slain procedural NPC must come back dead after a restart, so join_ok
    reports hp=0 and clients refuse to respawn it."""
    world = WorldState()
    world.npcs["proc_wolf_3_-2_0"] = NPCData(
        npc_id="proc_wolf_3_-2_0",
        name="Dire Wolf",
        personality="hostile",
        hp=0,
        max_hp=80,
        position=[210.0, 4.0, -130.0],
    )
    store.save_world(world)
    store.close()

    WorldState._instance = None
    world2 = WorldState()  # fresh world — procedural NPC unknown
    store2 = _fresh_store(tmp_path)
    try:
        store2.restore_world(world2)
        npc = world2.npcs.get("proc_wolf_3_-2_0")
        assert npc is not None
        assert npc.hp == 0
        assert npc.position == [210.0, 4.0, -130.0]
    finally:
        store2.close()


def test_living_procedural_npc_not_resurrected_into_fresh_world(
    tmp_path: Path, store: GameStore
) -> None:
    """Living procedural NPCs are client-spawned on exploration — restoring them
    into a fresh world would duplicate them. Only corpses are recreated."""
    world = WorldState()
    world.npcs["proc_bear_1_1_0"] = NPCData(
        npc_id="proc_bear_1_1_0",
        name="Bear",
        personality="hostile",
        hp=80,
        max_hp=80,
        position=[64.0, 0.0, 64.0],
    )
    store.save_world(world)
    store.close()

    WorldState._instance = None
    world2 = WorldState()
    store2 = _fresh_store(tmp_path)
    try:
        store2.restore_world(world2)
        assert "proc_bear_1_1_0" not in world2.npcs
    finally:
        store2.close()


class _FakeWebSocket:
    async def send_json(self, data: dict[str, Any]) -> None:
        return None


class _FakeManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, Any] = {}

    def get_player_id(self, _websocket: Any) -> str | None:
        return None

    def is_username_taken(self, _username: str) -> bool:
        return False

    async def register(self, _websocket: Any, _username: str) -> None:
        return None

    async def broadcast(self, *_args: Any, **_kwargs: Any) -> None:
        return None

    async def broadcast_nearby(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class _FakeRegistry:
    def refresh_agents(self) -> None:
        return None


@pytest.mark.asyncio
async def test_returning_player_restored_on_join(store: GameStore) -> None:
    """A player who left (popped from memory on disconnect) gets their persisted
    hp/gold/inventory back on the next join — even without a server restart."""
    from src.ws import handler
    from src.ws.handlers.join import handle_join

    world = WorldState()
    player = world.get_player("zaex")
    player.username = "zaex"
    player.hp = 31
    player.gold = 777
    store.save_player("zaex", player)
    world.players.pop("zaex")  # disconnect removes the in-memory player

    manager = _FakeManager()
    handler.init_handler(_FakeRegistry(), world, manager, store=store)  # type: ignore[arg-type]
    ctx = handler._sync_context()

    result = await handle_join(
        ctx,
        {"type": "join", "username": "zaex", "race": "human", "faction": "alliance"},
        _FakeWebSocket(),  # type: ignore[arg-type]
        manager,  # type: ignore[arg-type]
    )

    assert result["type"] == "join_ok"
    restored = world.get_player("zaex")
    assert restored.hp == 31
    assert restored.gold == 777


def test_refresh_npcs_keeps_procedural_npcs() -> None:
    """refresh_npcs (run on every join) must not wipe runtime procedural NPCs —
    that would erase deaths the store just restored."""
    world = WorldState()
    world.npcs["proc_wolf_9_9_0"] = NPCData(
        npc_id="proc_wolf_9_9_0",
        name="Dire Wolf",
        personality="hostile",
        hp=0,
        max_hp=80,
        position=[5.0, 0.0, 5.0],
    )

    world.refresh_npcs()

    assert "proc_wolf_9_9_0" in world.npcs
    assert world.npcs["proc_wolf_9_9_0"].hp == 0
