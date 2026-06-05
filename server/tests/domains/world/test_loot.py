"""Tests for LLM loot generation schema + fallback."""

from __future__ import annotations

import pytest

from src.combat.loot import LootItem, _fallback_loot, generate_loot
from src.world.items import ItemDef, resolve


def test_sell_value_defaults_by_rarity() -> None:
    assert ItemDef("X", "d", rarity="common").sell_value == 5
    assert ItemDef("X", "d", rarity="legendary").sell_value == 250
    # Explicit value overrides the rarity default.
    assert ItemDef("X", "d", rarity="common", value=99).sell_value == 99


def test_resolved_item_to_dict_has_value() -> None:
    d = resolve("Health Potion").to_dict()
    assert d["value"] >= 1


def test_loot_item_to_params_filters_zero_effects() -> None:
    item = LootItem(
        name="Ember Fang",
        description="A tooth wreathed in flame.",
        rarity="rare",
        icon="🦷",
        heal_hp=20,
        restore_mana=0,
        max_hp=0,
        level=0,
    )
    params = item.to_item_params()
    assert params["item"] == "Ember Fang"
    assert params["rarity"] == "rare"
    assert params["effects"] == {"heal_hp": 20}


def test_loot_item_invalid_rarity_falls_back_to_common() -> None:
    item = LootItem(name="X", description="d", rarity="ultra-mega", icon="📦")
    assert item.to_item_params()["rarity"] == "common"


def test_fallback_loot_has_item_shape() -> None:
    params = _fallback_loot("Lava Hound")
    assert "item" in params
    assert "rarity" in params
    assert "effects" in params
    assert "stackable" not in params


@pytest.mark.asyncio
async def test_generate_loot_uses_fallback_on_llm_error() -> None:
    class _BoomLLM:
        def with_structured_output(self, _schema: object) -> object:
            raise RuntimeError("no llm")

    params = await generate_loot(_BoomLLM(), "Forest Wraith", "hostile_monster")  # type: ignore[arg-type]
    assert params["item"]
    assert "effects" in params


@pytest.mark.asyncio
async def test_generate_loot_returns_structured_item() -> None:
    loot = LootItem(
        name="Frost Sigil", description="Cold to the touch.", rarity="epic", icon="❄️", max_hp=15
    )

    class _Structured:
        async def ainvoke(self, _messages: object) -> LootItem:
            return loot

    class _LLM:
        def with_structured_output(self, _schema: object) -> _Structured:
            return _Structured()

    params = await generate_loot(_LLM(), "Frostweaver Nyx", "mysterious_cryomancer")  # type: ignore[arg-type]
    assert params["item"] == "Frost Sigil"
    assert params["effects"] == {"max_hp": 15}
