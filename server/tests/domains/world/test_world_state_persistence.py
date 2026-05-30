from __future__ import annotations

import sqlite3

import pytest

from src.config import settings
from src.world.world_state import WorldState


@pytest.mark.asyncio
async def test_player_state_persists_across_worldstate_reinit() -> None:
    ws = WorldState()
    player = ws.get_player("player_persist")
    player.inventory = ["Health Potion", "Iron Sword"]
    player.active_quests = [{"id": "crystal_tear", "name": "The Crystal Tear"}]
    player.completed_quests = ["tutorial_quest"]

    await ws.update_player(
        "player_persist",
        {
            "hp": 77,
            "position": [12.0, 0.0, -3.0],
        },
    )
    await ws.persist_player("player_persist")

    WorldState._instance = None
    restored_world = WorldState()
    restored_player = restored_world.get_player("player_persist")

    assert restored_player.hp == 77
    assert restored_player.position == [12.0, 0.0, -3.0]
    assert restored_player.inventory == ["Health Potion", "Iron Sword"]
    assert restored_player.active_quests == [{"id": "crystal_tear", "name": "The Crystal Tear"}]
    assert restored_player.completed_quests == ["tutorial_quest"]


def test_npc_personality_rows_exist_and_support_per_npc_override() -> None:
    ws = WorldState()
    npc_id = "tutorial_01"
    npc = ws.get_npc(npc_id)
    assert npc is not None

    custom_prompt = "You are Tutorial-Man, now acting as a strict but fair drill sergeant."
    npc.personality = custom_prompt
    ws.register_npc(npc, personality_key="tutorial_custom", archetype="mentor")

    with sqlite3.connect(settings.sqlite_game_db_path) as conn:
        total = conn.execute("SELECT COUNT(*) FROM npc_personalities").fetchone()
        assert total is not None
        assert int(total[0]) >= len(ws.npcs)

        row = conn.execute(
            """
            SELECT personality_key, archetype, system_prompt
            FROM npc_personalities
            WHERE npc_id = ?
            """,
            (npc_id,),
        ).fetchone()
        assert row is not None
        assert row[0] == "tutorial_custom"
        assert row[1] == "mentor"
        assert row[2] == custom_prompt

    WorldState._instance = None
    restored_world = WorldState()
    restored_npc = restored_world.get_npc(npc_id)
    assert restored_npc is not None
    assert restored_npc.personality == custom_prompt


@pytest.mark.asyncio
async def test_world_snapshot_persists_environment_events_and_chat() -> None:
    ws = WorldState()
    await ws.apply_actions([{"kind": "change_weather", "params": {"weather": "storm"}}])
    ws.add_chat_message("player_world", "Anyone here?")
    await ws.flush_dirty_state()

    WorldState._instance = None
    restored_world = WorldState()

    assert restored_world.environment["weather"] == "storm"
    assert "Weather changed to storm" in restored_world.recent_events
    assert any(entry.get("text") == "Anyone here?" for entry in restored_world.chat_history)
