"""Tests for the player-built world-object store + persistence."""

from __future__ import annotations

import pytest

from src.world.world_state import WorldState


@pytest.fixture(autouse=True)
def _reset_world_state() -> None:
    """Reset the singleton between tests."""
    WorldState._instance = None


def _spawn(object_id: str, object_type: str = "tower") -> dict[str, object]:
    return {
        "kind": "world_spawn",
        "params": {
            "objectId": object_id,
            "objectType": object_type,
            "position": [1.0, 0.0, 2.0],
            "scale": 1.0,
            "label": object_type,
        },
    }


def test_add_and_get_world_object() -> None:
    ws = WorldState()
    ws.add_world_object({"objectId": "wb_1", "objectType": "tower"})
    objects = ws.get_world_objects()
    assert len(objects) == 1
    assert objects[0]["objectId"] == "wb_1"


def test_add_replaces_by_id() -> None:
    ws = WorldState()
    ws.add_world_object({"objectId": "wb_1", "objectType": "tower"})
    ws.add_world_object({"objectId": "wb_1", "objectType": "altar"})
    objects = ws.get_world_objects()
    assert len(objects) == 1
    assert objects[0]["objectType"] == "altar"


def test_remove_world_object() -> None:
    ws = WorldState()
    ws.add_world_object({"objectId": "wb_1", "objectType": "tower"})
    ws.remove_world_object("wb_1")
    assert ws.get_world_objects() == []


def test_apply_world_action_spawn_and_remove() -> None:
    ws = WorldState()
    ws.apply_world_action(_spawn("wb_1"))
    assert len(ws.get_world_objects()) == 1
    ws.apply_world_action({"kind": "world_remove", "params": {"objectId": "wb_1"}})
    assert ws.get_world_objects() == []


@pytest.mark.django_db
def test_persistence_round_trip() -> None:
    """World objects persist through the GameStore (ORM), not the WorldState."""
    from src.persistence import GameStore

    store = GameStore()
    ws = WorldState()
    ws.add_world_object({"objectId": "wb_1", "objectType": "tower"})
    ws.add_world_object({"objectId": "wb_2", "objectType": "altar"})
    store.save_world_objects(ws.world_objects_map())

    # Fresh state loads what the store persisted.
    WorldState._instance = None
    ws2 = WorldState()
    ws2.world_objects.update(store.load_world_objects())
    ids = {o["objectId"] for o in ws2.get_world_objects()}
    assert ids == {"wb_1", "wb_2"}
