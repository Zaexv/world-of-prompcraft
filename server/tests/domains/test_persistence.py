"""Tests for the Django-ORM game store (src/persistence/store.py)."""

from __future__ import annotations

from typing import Any

import pytest

from src.persistence import GameStore
from src.world.world_state import NPCData, WorldState

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


@pytest.fixture
def store() -> Any:
    s = GameStore()
    yield s
    s.close()


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
    assert sorted(doc["inventory"]) == ["Health Potion", "Rusty Sword"]
    assert doc["position"] == [10.0, 2.0, -5.0]


def test_inventory_stacks_collapse_and_expand(store: GameStore) -> None:
    world = WorldState()
    player = world.get_player("zaex")
    player.inventory = ["Health Potion", "Health Potion", "Health Potion", "Iron Sword"]

    store.save_player("zaex", player)

    # Stored as stacked rows.
    from src.persistence.gamedata.models import PlayerInventory

    potion = PlayerInventory.objects.get(player_id="zaex", item_name="Health Potion")
    assert potion.quantity == 3

    # Restored back to the flat list[str] runtime shape (3 potions + 1 sword).
    doc = store.load_player("zaex")
    assert doc is not None
    assert doc["inventory"].count("Health Potion") == 3
    assert doc["inventory"].count("Iron Sword") == 1


def test_equipped_and_quests_roundtrip(store: GameStore) -> None:
    world = WorldState()
    player = world.get_player("zaex")
    player.equipped = {"weapon": "Iron Sword", "shield": None}
    player.completed_quests = ["q_intro", "q_intro", "q_wolves"]  # dup ignored
    player.completed_quest_names = {"q_intro": "The Sacred Flame", "q_wolves": "Wolf Cull"}
    player.active_quests = [{"id": "q_active", "objectives": []}]

    store.save_player("zaex", player)
    doc = store.load_player("zaex")

    assert doc is not None
    assert doc["equipped"] == {"weapon": "Iron Sword", "shield": None}
    assert sorted(doc["completed_quests"]) == ["q_intro", "q_wolves"]
    # Completed-quest titles survive the round-trip so the client shows names.
    assert doc["completed_quest_names"] == {
        "q_intro": "The Sacred Flame",
        "q_wolves": "Wolf Cull",
    }
    assert doc["active_quests"] == [{"id": "q_active", "objectives": []}]

    # Reconstructable into PlayerData without error.
    from src.world.player_state import PlayerData

    restored = PlayerData(**doc)
    assert restored.equipped["weapon"] == "Iron Sword"
    # to_dict feeds the client {id, name} so the title renders after a reload.
    completed = restored.to_dict()["completedQuests"]
    assert {"id": "q_intro", "name": "The Sacred Flame"} in completed


def test_load_unknown_player_returns_none(store: GameStore) -> None:
    assert store.load_player("nobody") is None


def test_world_roundtrip_restores_player_and_npc_state(store: GameStore) -> None:
    world = WorldState()
    player = world.get_player("zaex")
    player.username = "zaex"
    player.hp = 55
    npc_id = next(iter(world.npcs))
    world.npcs[npc_id].hp = 7
    world.npcs[npc_id].position = [123.0, 4.0, -56.0]
    world.npcs[npc_id].mood = "furious"

    store.save_world(world)

    # Simulate restart: fresh WorldState over the same database.
    WorldState._instance = None
    world2 = WorldState()
    restored = store.restore_world(world2)
    assert restored >= 1
    assert world2.npcs[npc_id].hp == 7
    assert world2.npcs[npc_id].position == [123.0, 4.0, -56.0]
    assert world2.npcs[npc_id].mood == "furious"
    assert "zaex" not in world2.players  # Players are lazy-loaded on join
    player_doc = store.load_player("zaex")
    assert player_doc is not None
    assert player_doc["hp"] == 55


def test_dead_procedural_npc_restored_as_corpse(store: GameStore) -> None:
    """A slain procedural NPC must come back dead after a restart."""
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

    WorldState._instance = None
    world2 = WorldState()  # fresh world — procedural NPC unknown
    store.restore_world(world2)
    npc = world2.npcs.get("proc_wolf_3_-2_0")
    assert npc is not None
    assert npc.hp == 0
    assert npc.position == [210.0, 4.0, -130.0]


def test_living_procedural_npc_not_resurrected_into_fresh_world(store: GameStore) -> None:
    """Living procedural NPCs are client-spawned on exploration; only corpses restore."""
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

    WorldState._instance = None
    world2 = WorldState()
    store.restore_world(world2)
    assert "proc_bear_1_1_0" not in world2.npcs


def test_world_object_roundtrip(store: GameStore) -> None:
    store.save_world_objects(
        {
            "wb_1": {"objectId": "wb_1", "objectType": "tower", "position": [1, 0, 2]},
            "wb_2": {"objectId": "wb_2", "objectType": "altar", "position": [3, 0, 4]},
        }
    )
    loaded = store.load_world_objects()
    assert set(loaded.keys()) == {"wb_1", "wb_2"}
    assert loaded["wb_2"]["objectType"] == "altar"

    # Saving a smaller set removes the missing object (mirror semantics).
    store.save_world_objects({"wb_1": loaded["wb_1"]})
    assert set(store.load_world_objects().keys()) == {"wb_1"}


def test_relationship_mirror_roundtrip(store: GameStore) -> None:
    store.save_relationship("npc_sage", "zaex", 42, "friendly")
    store.save_relationship("npc_smith", "zaex", -10, "wary")
    store.save_relationship("npc_sage", "other", 5, "neutral")

    rels = store.load_relationships_for_player("zaex")
    assert rels["npc_sage"]["relationship_score"] == 42
    assert rels["npc_sage"]["mood"] == "friendly"
    assert rels["npc_smith"]["relationship_score"] == -10
    assert "other" not in rels  # filtered by player

    # Upsert updates in place.
    store.save_relationship("npc_sage", "zaex", 50, "trusted")
    rels = store.load_relationships_for_player("zaex")
    assert rels["npc_sage"]["relationship_score"] == 50


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


@pytest.mark.django_db(transaction=True)
async def test_returning_player_restored_on_join(store: GameStore) -> None:
    """A player who left gets their persisted hp/gold/equipped back on next join.

    transaction=True so the row save_player commits is visible to the worker
    thread that join's ``asyncio.to_thread(load_player)`` runs on.
    """
    import asyncio

    from src.ws import handler
    from src.ws.handlers.join import handle_join

    world = WorldState()
    player = world.get_player("zaex")
    player.username = "zaex"
    player.hp = 31
    player.gold = 777
    player.equipped = {"weapon": "Iron Sword"}
    await asyncio.to_thread(store.save_player, "zaex", player)
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
    assert restored.equipped == {"weapon": "Iron Sword"}
    # Equipment cache seeded for combat reads.
    assert ctx.player_equipment["zaex"] == {"weapon": "Iron Sword"}


def test_refresh_npcs_keeps_procedural_npcs() -> None:
    """refresh_npcs must not wipe runtime procedural NPCs (would erase deaths)."""
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
