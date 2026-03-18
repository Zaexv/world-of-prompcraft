"""Shared fixtures for server tests."""

from __future__ import annotations

import pytest

from src.world.player_state import PlayerData
from src.world.world_state import NPCData


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
