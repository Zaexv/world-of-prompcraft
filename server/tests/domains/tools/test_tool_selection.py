"""Tests for the per-NPC tool-selection seam (get_tools_for / get_all_tools)."""

from __future__ import annotations

import pytest

from src.agents.tools import _CATEGORY_FACTORIES, get_all_tools, get_tools_for


def test_get_tools_for_single_category() -> None:
    tools = get_tools_for(["dialogue"])
    names = {t.name for t in tools}
    # Only dialogue tools — no combat tool like deal_damage leaks in.
    assert names, "expected at least one dialogue tool"
    assert "deal_damage" not in names


def test_get_tools_for_multiple_categories_is_union() -> None:
    combined = {t.name for t in get_tools_for(["dialogue", "trade"])}
    dialogue = {t.name for t in get_tools_for(["dialogue"])}
    trade = {t.name for t in get_tools_for(["trade"])}
    assert combined == dialogue | trade


def test_get_tools_for_unknown_category_raises() -> None:
    with pytest.raises(KeyError):
        get_tools_for(["nonsense"])


def test_get_all_tools_equals_all_categories() -> None:
    all_names = {t.name for t in get_all_tools()}
    union = {t.name for t in get_tools_for(list(_CATEGORY_FACTORIES))}
    assert all_names == union


def test_combat_split_offense_support_disjoint() -> None:
    offense = {t.name for t in get_tools_for(["offense"])}
    support = {t.name for t in get_tools_for(["support"])}
    defense = {t.name for t in get_tools_for(["defense"])}
    assert offense == {"deal_damage"}
    assert support == {"heal_target"}
    assert defense == {"defend", "flee"}


def test_healer_loadout_has_heal_no_attack() -> None:
    # The case impossible before the split: heal without attack.
    names = {t.name for t in get_tools_for(["support", "defense", "dialogue"])}
    assert "heal_target" in names
    assert "deal_damage" not in names


def test_create_combat_tools_alias_preserves_order() -> None:
    from src.agents.tools.combat import create_combat_tools

    tools = create_combat_tools([], {})
    assert [t.name for t in tools] == ["deal_damage", "defend", "flee", "heal_target"]
