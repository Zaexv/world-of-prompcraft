"""Tests that the system prompt is composed with archetype-gated tool rules."""

from __future__ import annotations

from typing import Any

from src.agents.nodes import reason


def _state(archetype: str) -> dict[str, Any]:
    return {
        "npc_name": "Test NPC",
        "npc_personality": "A test character.",
        "world_context": {"zone": "Market", "npc_archetype": archetype},
        "player_state": {"hp": 100, "max_hp": 100},
        "conversation_summary": "",
        "mood": "neutral",
        "relationship_score": 0,
        "personality_notes": "",
    }


def test_merchant_prompt_has_trade_rules_not_attack() -> None:
    prompt = reason._build_system_prompt(_state("friendly_merchant"), player_prompt="")
    assert "## Tool Rules" in prompt
    assert "offer_item" in prompt
    assert "deal_damage" not in prompt


def test_healer_prompt_has_heal_not_attack() -> None:
    prompt = reason._build_system_prompt(_state("friendly_healer"), player_prompt="")
    assert "heal_target" in prompt
    assert "deal_damage" not in prompt


def test_monster_prompt_has_attack_not_trade() -> None:
    prompt = reason._build_system_prompt(_state("hostile_monster"), player_prompt="")
    assert "deal_damage" in prompt
    assert "offer_item" not in prompt


def test_unknown_archetype_omits_tool_rules_section() -> None:
    prompt = reason._build_system_prompt(_state("nonexistent"), player_prompt="")
    assert "## Tool Rules" not in prompt
