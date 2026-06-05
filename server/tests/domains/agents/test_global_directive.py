"""Tests for the world-wide NPC directive injected into every prompt.

A single config switch (``settings.npc_global_directive`` / env
``NPC_GLOBAL_DIRECTIVE``) must reach all three prompt builders — the full and
compact reasoning prompts and the speaking prompt — and disable cleanly when
emptied. Default behaviour is to mirror the player's language.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from src.agents.nodes import prompt_parts, reason, respond

if TYPE_CHECKING:
    import pytest


def _state() -> dict[str, Any]:
    return {
        "npc_name": "Aurelia",
        "npc_personality": "A warm Spanish merchant.",
        "world_context": {"zone": "Market", "weather": "clear"},
        "player_state": {"hp": 100, "max_hp": 100},
        "conversation_summary": "",
        "mood": "happy",
        "relationship_score": 0,
        "personality_notes": "",
    }


def test_default_directive_mentions_language() -> None:
    directive = prompt_parts.global_npc_directive()
    assert "language" in directive.lower()


def test_directive_present_in_all_three_prompts() -> None:
    directive = prompt_parts.global_npc_directive()
    assert directive  # default is non-empty
    assert directive in reason._build_system_prompt(_state(), player_prompt="")
    assert directive in reason._build_compact_system_prompt(_state())
    assert directive in respond.build_speak_prompt(_state())


def test_custom_directive_is_injected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(prompt_parts.settings, "npc_global_directive", "ALWAYS RHYME.")
    assert "ALWAYS RHYME." in reason._build_system_prompt(_state(), player_prompt="")
    assert "ALWAYS RHYME." in respond.build_speak_prompt(_state())


def test_empty_directive_disables_section(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(prompt_parts.settings, "npc_global_directive", "")
    assert prompt_parts.global_directive_section() == []
    assert "Global Rules" not in reason._build_system_prompt(_state(), player_prompt="")
    assert "Global Rules" not in respond.build_speak_prompt(_state())
