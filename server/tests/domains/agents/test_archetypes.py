"""Tests for the archetype registry and the tool limits it enforces."""

from __future__ import annotations

from src.agents.personalities.archetypes import ARCHETYPES, get_archetype
from src.agents.personalities.templates import NPC_PERSONALITIES
from src.agents.tools import get_tools_for


def _tool_names(archetype_key: str) -> set[str]:
    arch = get_archetype(archetype_key)
    assert arch is not None
    return {t.name for t in get_tools_for(list(arch.allowed_tools))}


def test_every_personality_archetype_is_registered() -> None:
    # No personality may reference an archetype the registry doesn't know.
    for key, p in NPC_PERSONALITIES.items():
        archetype = p.get("archetype", "")
        assert archetype in ARCHETYPES, f"{key} -> unknown archetype {archetype!r}"


def test_merchant_cannot_attack() -> None:
    names = _tool_names("friendly_merchant")
    assert "offer_item" in names
    assert "deal_damage" not in names


def test_healer_heals_but_cannot_attack() -> None:
    names = _tool_names("friendly_healer")
    assert "heal_target" in names
    assert "deal_damage" not in names


def test_monster_cannot_trade() -> None:
    names = _tool_names("hostile_monster")
    assert "deal_damage" in names
    assert "complete_purchase" not in names
    assert "heal_target" not in names


def test_only_boss_and_monster_are_hostile() -> None:
    hostile = {k for k, a in ARCHETYPES.items() if a.hostile}
    assert hostile == {"hostile_boss", "hostile_monster"}


def test_tool_rules_only_mention_allowed_categories() -> None:
    merchant = get_archetype("friendly_merchant")
    assert merchant is not None
    rules = merchant.tool_rules
    assert "offer_item" in rules
    assert "deal_damage" not in rules
