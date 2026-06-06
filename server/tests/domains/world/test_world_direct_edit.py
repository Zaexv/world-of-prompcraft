"""Integration test: manual world_direct_edit persists + broadcasts."""

from __future__ import annotations

from typing import Any

import pytest

from pathlib import Path

from src.world import world_state as world_state_module
from src.world.world_state import WorldState
from src.ws import handler


class _FakeWebSocket:
    pass


class _FakeManager:
    def __init__(self, player_id: str) -> None:
        self._player_id = player_id
        self.broadcasts: list[tuple[dict[str, Any], str | None]] = []

    def get_player_id(self, _ws: Any) -> str:
        return self._player_id

    async def broadcast(self, data: dict[str, Any], exclude: str | None = None) -> None:
        self.broadcasts.append((data, exclude))


@pytest.fixture(autouse=True)
def _reset(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setattr(
        world_state_module, "_world_objects_path", lambda: tmp_path / "world_objects.json"
    )
    WorldState._instance = None
    yield
    WorldState._instance = None
    handler._world_state = None
    handler._manager = None


@pytest.mark.asyncio
async def test_world_direct_edit_spawns_persists_and_broadcasts() -> None:
    ws = WorldState()
    mgr = _FakeManager("alice")
    handler._world_state = ws
    handler._manager = mgr  # type: ignore[assignment]

    msg = {
        "type": "world_direct_edit",
        "action": "spawn",
        "params": {
            "objectId": "wb_test1",
            "objectType": "tower",
            "position": [3.0, 0.0, 4.0],
            "scale": 1.0,
            "label": "tower",
        },
    }
    result = await handler.handle_message(msg, _FakeWebSocket(), mgr)  # type: ignore[arg-type]

    # No direct reply; the spawn is delivered by broadcast.
    assert result is None
    # Stored server-side.
    assert {o["objectId"] for o in ws.get_world_objects()} == {"wb_test1"}
    # Broadcast to everyone (including sender) with the world_spawn action.
    assert len(mgr.broadcasts) == 1
    data, exclude = mgr.broadcasts[0]
    assert data["type"] == "world_objects_update"
    assert exclude is None
    assert data["actions"][0]["kind"] == "world_spawn"
    assert data["actions"][0]["params"]["objectId"] == "wb_test1"
