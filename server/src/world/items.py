"""Item catalog + metadata resolution.

Inventory is stored as a flat list of item *names* (``list[str]``). This module
turns a bare name into full metadata (description, rarity, icon) at the moment
it is serialized to the client or attached to a ``give_item`` action, so NPC
agents can keep inventing free-form item names while the UI still gets a
description, rarity color, and icon for every item.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Rarity tiers, ordered low → high. Mirrored by the client palette.
RARITIES = ("common", "uncommon", "rare", "epic", "legendary")


@dataclass(frozen=True)
class ItemDef:
    """Static definition of an item."""

    name: str
    description: str
    rarity: str = "common"
    icon: str = "📦"
    stackable: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "rarity": self.rarity,
            "icon": self.icon,
            "stackable": self.stackable,
        }


# Known items keyed by lowercased name.
CATALOG: dict[str, ItemDef] = {
    "health potion": ItemDef(
        "Health Potion", "Restores a chunk of health when consumed.", "common", "🧪"
    ),
    "mana potion": ItemDef("Mana Potion", "Restores magical energy when consumed.", "common", "🧴"),
    "iron sword": ItemDef(
        "Iron Sword", "A sturdy, well-balanced blade.", "uncommon", "🗡️", stackable=False
    ),
    "steel shield": ItemDef(
        "Steel Shield", "A heavy shield that turns aside blows.", "uncommon", "🛡️", stackable=False
    ),
    "dragon scale": ItemDef("Dragon Scale", "An iridescent scale, hot to the touch.", "epic", "🐲"),
    "ancient relic": ItemDef(
        "Ancient Relic",
        "A mysterious artifact humming with power.",
        "legendary",
        "🏺",
        stackable=False,
    ),
    "gold coin": ItemDef("Gold Coin", "Shiny currency of the realm.", "common", "🪙"),
    "bread": ItemDef("Bread", "A simple loaf. Filling, if plain.", "common", "🍞"),
    "magic ring": ItemDef(
        "Magic Ring", "A band etched with faintly glowing runes.", "rare", "💍", stackable=False
    ),
    "wooden bow": ItemDef(
        "Wooden Bow", "A flexible hunting bow.", "uncommon", "🏹", stackable=False
    ),
}


# Keyword → (rarity, icon, stackable) heuristics for unknown, LLM-invented names.
_HEURISTICS: tuple[tuple[tuple[str, ...], str, str, bool], ...] = (
    (("legendary", "ancient", "relic", "artifact"), "legendary", "🏺", False),
    (("dragon", "epic", "enchanted"), "epic", "✨", False),
    (("magic", "rune", "ring", "amulet", "crystal", "gem"), "rare", "💎", False),
    (("sword", "blade", "dagger", "axe", "mace", "spear"), "uncommon", "🗡️", False),
    (("bow", "crossbow"), "uncommon", "🏹", False),
    (("shield", "armor", "armour", "plate", "helm", "helmet"), "uncommon", "🛡️", False),
    (("potion", "elixir", "tonic", "brew"), "common", "🧪", True),
    (("scroll", "tome", "book", "map"), "uncommon", "📜", True),
    (("coin", "gold", "silver"), "common", "🪙", True),
    (("food", "bread", "meat", "apple", "fruit"), "common", "🍖", True),
    (("key",), "uncommon", "🗝️", False),
)


def resolve(name: str) -> ItemDef:
    """Return the full :class:`ItemDef` for an item name.

    Falls back to keyword heuristics, then a generic common item, so an
    unknown LLM-invented name still gets sane metadata.
    """
    key = name.strip().lower()
    if key in CATALOG:
        return CATALOG[key]

    for keywords, rarity, icon, stackable in _HEURISTICS:
        if any(kw in key for kw in keywords):
            return ItemDef(
                name=name,
                description=f"A {rarity} {name.lower()}.",
                rarity=rarity,
                icon=icon,
                stackable=stackable,
            )

    return ItemDef(
        name=name, description=f"An ordinary {name.lower()}.", rarity="common", icon="📦"
    )


def stacked_inventory(names: list[str]) -> list[dict[str, Any]]:
    """Resolve + stack a flat list of item names into client item dicts.

    Stackable items collapse into one entry with ``quantity``; non-stackable
    items stay as separate entries (quantity 1). Insertion order is preserved.
    """
    result: list[dict[str, Any]] = []
    index_by_name: dict[str, int] = {}
    for name in names:
        item = resolve(name)
        if item.stackable and item.name in index_by_name:
            result[index_by_name[item.name]]["quantity"] += 1
            continue
        entry = item.to_dict()
        entry["quantity"] = 1
        if item.stackable:
            index_by_name[item.name] = len(result)
        result.append(entry)
    return result
