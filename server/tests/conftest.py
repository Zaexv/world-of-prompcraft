"""Shared fixtures for server tests."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest

from src.config import settings
from src.world.player_state import PlayerData
from src.world.world_state import NPCData, WorldState

if TYPE_CHECKING:
    from pathlib import Path


@pytest.fixture()
def player_data() -> PlayerData:
    """Fresh PlayerData with defaults."""
    return PlayerData()


@pytest.fixture()
def npc_data() -> NPCData:
    """A test NPC."""
    return NPCData(
        npc_id="test_npc",
        name="Test NPC",
        personality="You are a test NPC.",
        hp=100,
        max_hp=100,
        position=[10.0, 0.0, 20.0],
    )


@pytest.fixture(autouse=True)
def _isolate_sqlite_game_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    """Use an isolated sqlite DB per test and reset WorldState singleton boundaries."""
    db_path = tmp_path / "game_state_test.db"
    monkeypatch.setattr(settings, "sqlite_game_db_path", str(db_path))
    WorldState._instance = None
    yield
    WorldState._instance = None


# Import LLM fixtures
pytest_plugins = ["tests.llm_fixtures"]
