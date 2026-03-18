"""Tests for NPC personality templates."""

from __future__ import annotations

from src.agents.personalities.templates import NPC_PERSONALITIES


def test_all_personalities_have_required_fields() -> None:
    required = {"name", "archetype", "initial_hp", "position", "system_prompt"}
    for npc_id, config in NPC_PERSONALITIES.items():
        missing = required - set(config.keys())
        assert not missing, f"{npc_id} missing fields: {missing}"


def test_all_personalities_have_tool_rules() -> None:
    for npc_id, config in NPC_PERSONALITIES.items():
        assert "TOOL USAGE RULES" in config["system_prompt"], (
            f"{npc_id} missing TOOL USAGE RULES in system prompt"
        )


def test_dragon_has_fire_rules() -> None:
    dragon = NPC_PERSONALITIES["dragon_01"]
    assert "fire" in dragon["system_prompt"].lower()
    assert dragon["initial_hp"] == 500


def test_eltito_has_wednesday() -> None:
    tito = NPC_PERSONALITIES["eltito_01"]
    assert "wednesday" in tito["system_prompt"].lower()
    assert tito["initial_hp"] == 420
