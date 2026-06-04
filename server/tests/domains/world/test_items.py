"""Tests for the item catalog + metadata resolution."""

from __future__ import annotations

from src.world.items import resolve, stacked_inventory


def test_resolve_known_item() -> None:
    item = resolve("health potion")
    assert item.name == "Health Potion"
    assert item.rarity == "common"
    assert item.stackable is True


def test_resolve_unknown_uses_heuristics() -> None:
    item = resolve("Flaming Greatsword")
    assert item.rarity == "uncommon"
    assert item.stackable is False
    assert item.icon == "🗡️"


def test_resolve_fallback_common() -> None:
    item = resolve("Strange Pebble")
    assert item.rarity == "common"
    assert item.icon == "📦"


def test_stacked_inventory_collapses_stackables() -> None:
    inv = stacked_inventory(["Health Potion", "Health Potion", "Bread"])
    by_name = {entry["name"]: entry for entry in inv}
    assert by_name["Health Potion"]["quantity"] == 2
    assert by_name["Bread"]["quantity"] == 1


def test_stacked_inventory_keeps_non_stackables_separate() -> None:
    inv = stacked_inventory(["Iron Sword", "Iron Sword"])
    assert len(inv) == 2
    assert all(entry["quantity"] == 1 for entry in inv)
