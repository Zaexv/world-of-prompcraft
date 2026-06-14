"""The NPC prompt must carry the player's name so NPCs can address them by it."""

from __future__ import annotations

from typing import Any

from src.agents.nodes import reason


def _state(username: str | None) -> dict[str, Any]:
    player: dict[str, Any] = {"hp": 100, "max_hp": 100}
    if username is not None:
        player["username"] = username
    return {
        "npc_name": "Aurelia",
        "npc_personality": "A warm Spanish merchant.",
        "world_context": {"zone": "Market", "weather": "clear"},
        "player_state": player,
        "conversation_summary": "",
        "mood": "happy",
        "relationship_score": 0,
        "personality_notes": "",
    }


def test_full_prompt_includes_player_name() -> None:
    prompt = reason._build_system_prompt(_state("Zaex"), player_prompt="hello there friend")
    assert "Zaex" in prompt
    assert "Name: Zaex" in prompt


def test_full_prompt_falls_back_without_username() -> None:
    prompt = reason._build_system_prompt(_state(None), player_prompt="hello there friend")
    assert "the adventurer" in prompt


def test_compact_prompt_includes_player_name() -> None:
    # Short social prompts (<=18 chars, no action intent) use the compact builder.
    prompt = reason._build_compact_system_prompt(_state("Zaex"))
    assert "Zaex" in prompt
