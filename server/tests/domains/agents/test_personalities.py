"""Tests for NPC personality templates."""

from __future__ import annotations

from src.agents.personalities.templates import NPC_PERSONALITIES


def test_all_personalities_have_required_fields() -> None:
    required = {"name", "archetype", "initial_hp", "position", "system_prompt"}
    for npc_id, config in NPC_PERSONALITIES.items():
        missing = required - set(config.keys())
        assert not missing, f"{npc_id} missing fields: {missing}"


def test_personality_data_no_longer_embeds_generic_tool_preamble() -> None:
    # Tool rules now come from the archetype at runtime, not from the per-NPC
    # data — so the generic all-tools preamble must be gone from every record.
    for npc_id, config in NPC_PERSONALITIES.items():
        assert "TOOL USAGE RULES" not in config["system_prompt"], (
            f"{npc_id} still embeds the generic tool preamble in its data"
        )


def test_archetype_supplies_tool_rules() -> None:
    from src.agents.personalities.archetypes import get_archetype

    for npc_id, config in NPC_PERSONALITIES.items():
        arch = get_archetype(config["archetype"])
        assert arch is not None, f"{npc_id} has unregistered archetype"
        assert "TOOL USAGE RULES" in arch.tool_rules


def test_dragon_has_fire_rules() -> None:
    dragon = NPC_PERSONALITIES["dragon_01"]
    assert "fire" in dragon["system_prompt"].lower()
    assert dragon["initial_hp"] == 500


def test_eltito_has_wednesday() -> None:
    tito = NPC_PERSONALITIES["eltito_01"]
    assert "wednesday" in tito["system_prompt"].lower()
    assert tito["initial_hp"] == 420
