"""Tests for HP riding on player_move (keeps server hp fresh between interactions)."""

from __future__ import annotations

from typing import Any

import pytest

from src.world.world_state import WorldState
from src.ws import handler
from src.ws.handlers import movement


class _FakeWebSocket:
    async def send_json(self, data: dict[str, Any]) -> None:
        return None


class _FakeManager:
    def __init__(self, player_id: str) -> None:
        self._player_id = player_id

    def get_player_id(self, _websocket: Any) -> str:
        return self._player_id

    async def send_to(self, _player_id: str, _data: dict[str, Any]) -> None:
        return None

    async def broadcast_nearby(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class _FakeRegistry:
    async def invoke(self, **_kwargs: Any) -> dict[str, Any]:
        return {"dialogue": "", "actions": [], "npcStateUpdate": {}}


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


async def _move(world: WorldState, manager: _FakeManager, data: dict[str, Any]) -> None:
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]
    ctx = handler._sync_context()
    await movement.handle_player_move(ctx, data, _FakeWebSocket(), manager)  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_player_move_syncs_hp() -> None:
    world = WorldState()
    player = world.get_player("p1")
    assert player.hp == 100

    manager = _FakeManager("p1")
    await _move(
        world, manager, {"type": "player_move", "position": [1.0, 0.0, 1.0], "yaw": 0.0, "hp": 37}
    )

    assert world.get_player("p1").hp == 37


@pytest.mark.asyncio
async def test_player_move_hp_is_clamped() -> None:
    world = WorldState()
    world.get_player("p1")
    manager = _FakeManager("p1")

    await _move(
        world,
        manager,
        {"type": "player_move", "position": [0.0, 0.0, 0.0], "yaw": 0.0, "hp": 99999},
    )
    assert world.get_player("p1").hp == world.get_player("p1").max_hp

    await _move(
        world, manager, {"type": "player_move", "position": [0.0, 0.0, 0.0], "yaw": 0.0, "hp": -50}
    )
    assert world.get_player("p1").hp == 0


@pytest.mark.asyncio
async def test_player_move_without_hp_leaves_hp_untouched() -> None:
    world = WorldState()
    player = world.get_player("p1")
    player.hp = 64
    manager = _FakeManager("p1")

    await _move(world, manager, {"type": "player_move", "position": [2.0, 0.0, 2.0], "yaw": 1.0})

    assert world.get_player("p1").hp == 64
