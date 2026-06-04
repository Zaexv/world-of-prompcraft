"""LLM-driven loot generation.

When an NPC is defeated, :func:`generate_loot` makes a single structured LLM
call to invent a bespoke item that fits the slain NPC — a Fire Mage drops
something fiery, a Frost Wraith something cold. The model is forced into the
:class:`LootItem` schema so the result drops straight into the item pipeline
with the same shape as a static :class:`~src.world.items.ItemDef`.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field

from ..world.items import RARITIES, resolve

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

# Allowed structured effect keys, mirrored by _handle_use_item on the server
# and the inventory tooltip on the client.
_EFFECT_KEYS = ("heal_hp", "restore_mana", "max_hp", "level")


class LootItem(BaseModel):
    """Structured schema the loot LLM call must return."""

    name: str = Field(description="Short, evocative item name (2-4 words).")
    description: str = Field(description="One vivid sentence describing the item.")
    rarity: str = Field(description=f"One of: {', '.join(RARITIES)}.")
    icon: str = Field(description="A single emoji representing the item.")
    heal_hp: int = Field(default=0, description="HP restored on use (0 if none).")
    restore_mana: int = Field(default=0, description="Mana restored on use (0 if none).")
    max_hp: int = Field(default=0, description="Permanent max-HP bonus on use (0 if none).")
    level: int = Field(default=0, description="Levels granted on use (0 if none).")

    def to_item_params(self) -> dict[str, Any]:
        """Convert to give_item action params (matches ItemDef.to_dict shape)."""
        rarity = self.rarity.strip().lower()
        if rarity not in RARITIES:
            rarity = "common"
        effects: dict[str, int] = {}
        for key in _EFFECT_KEYS:
            value = int(getattr(self, key, 0) or 0)
            if value:
                effects[key] = value
        return {
            "item": self.name.strip() or "Mysterious Trinket",
            "description": self.description.strip(),
            "rarity": rarity,
            "icon": (self.icon.strip() or "📦")[:4],
            "effects": effects,
        }


def _fallback_loot(npc_name: str) -> dict[str, Any]:
    """Deterministic loot when the LLM is unavailable, via the item heuristics."""
    item_def = resolve(f"{npc_name} Trophy")
    params = item_def.to_dict()
    params["item"] = params.pop("name")
    params.pop("stackable", None)
    return params


async def generate_loot(
    llm: BaseChatModel,
    npc_name: str,
    npc_archetype: str,
) -> dict[str, Any]:
    """Generate a contextual loot item for a defeated NPC.

    Returns give_item action params (``item``, ``description``, ``rarity``,
    ``icon``, ``effects``). Falls back to heuristic loot on any failure so a
    kill always drops something.
    """
    system = (
        "You generate a single fantasy RPG loot item dropped by a defeated "
        "enemy. The item must thematically fit the enemy. Pick a rarity that "
        "matches the enemy's threat. Only set an effect value when it makes "
        "sense (potions heal, mana items restore mana, rare relics grant a "
        "level or max-HP). Most drops should have modest or zero effects."
    )
    user = f"Defeated enemy: {npc_name} (archetype: {npc_archetype or 'unknown'}). Invent its loot drop."

    try:
        from langchain_core.messages import HumanMessage, SystemMessage

        structured = llm.with_structured_output(LootItem)
        result = await structured.ainvoke(
            [SystemMessage(content=system), HumanMessage(content=user)]
        )
        if isinstance(result, LootItem):
            return result.to_item_params()
        logger.warning("Loot generation returned unexpected type for %s", npc_name)
    except Exception:
        logger.warning("Loot generation failed for %s — using fallback", npc_name)

    return _fallback_loot(npc_name)
