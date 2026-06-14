"""Tests for the adaptive length budget injected into NPC system prompts.

Length is enforced prompt-only (the dialogue is never truncated server-side),
so the budget instruction must always be present and must widen when lore is
injected into the prompt.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from src.agents.nodes import reason

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


def test_full_prompt_uses_tight_budget_without_lore() -> None:
    prompt = reason._build_system_prompt(_state(), player_prompt="")
    assert "a couple of sentences is plenty" in prompt
    assert "World Lore" not in prompt


def test_full_prompt_uses_500_budget_with_lore(monkeypatch: pytest.MonkeyPatch) -> None:
    class _FakeRetriever:
        def retrieve(self, query: str, top_k: int = 3) -> list[dict[str, Any]]:
            return [{"topic": "Teldrassil", "content": "The World Tree of the Night Elves."}]

    monkeypatch.setattr(reason, "get_retriever", lambda: _FakeRetriever())

    prompt = reason._build_system_prompt(_state(), player_prompt="tell me about Teldrassil")
    assert "aim for a few sentences" in prompt
    assert "a couple of sentences is plenty" not in prompt
    assert "World Lore" in prompt
    assert "Teldrassil" in prompt


def test_compact_prompt_caps_at_200() -> None:
    assert "under 200 characters" in reason._build_compact_system_prompt(_state())
