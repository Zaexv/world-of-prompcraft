"""Archetype registry — the single source of truth for what an NPC can DO.

An archetype bundles the **tool categories** an NPC may call (a hard limit
enforced before the LLM runs, not prompt prose), behaviour flags, and the
prompt rules describing those tools. NPCs reference an archetype by key; their
flavour/personality stays per-NPC.
"""

from __future__ import annotations

from dataclasses import dataclass

# ── Per-category tool rules ───────────────────────────────────────────────
# One snippet per tool category. An archetype's prompt rules are composed from
# only the categories it is allowed, so the rules always match the bound tools.
CATEGORY_RULES: dict[str, str] = {
    "offense": (
        "- When attacking: ALWAYS call deal_damage with a specific amount and "
        "damage_type. Pair it with one short spoken line."
    ),
    "defense": (
        "- To protect yourself, call defend(stance). To disengage when "
        "outmatched, call flee(direction)."
    ),
    "support": ("- When healing: ALWAYS call heal_target with a positive amount."),
    "dialogue": (
        "- When greeting, use emote('wave') or emote('bow'). When angry, use "
        "emote('threaten'). Never call a tool just to chat."
    ),
    "trade": (
        "- To give a free gift, call offer_item(item, 0). To sell, call "
        "offer_item(item, price) to PROPOSE, then complete_purchase(item, price) "
        "once the player agrees (it fails if they lack gold — then do not give "
        "the item). To buy from the player, call buy_item_from_player(item)."
    ),
    "quest": (
        "- To offer a known quest call offer_quest(quest_id), or "
        "offer_custom_quest(...) to invent one. When all objectives are done call "
        "complete_quest(quest_id). Only call advance_quest_objective for "
        "'report back' steps you alone can confirm."
    ),
    "environment": ("- To change the scene, call spawn_effect(type) or weather/time tools."),
    "music": ("- To play music, call the music tool with a mood or track."),
    "world_query": (
        "- Use the world-query tools to look up nearby entities or your own "
        "state before acting; never invent facts about the world."
    ),
}


@dataclass(frozen=True)
class Archetype:
    """A reusable NPC role: its tool budget, defaults, and prompt rules."""

    key: str
    allowed_tools: tuple[str, ...]
    default_hp: int
    hostile: bool

    @property
    def tool_rules(self) -> str:
        """Prompt rules for exactly the tool categories this archetype allows."""
        lines = [CATEGORY_RULES[c] for c in self.allowed_tools if c in CATEGORY_RULES]
        if not lines:
            return ""
        header = "TOOL USAGE RULES (you may ONLY use the tools below; you have no others):\n"
        brevity = (
            "\n- Pair ONE short spoken line with your action(s); let the action "
            "do the talking. Never narrate your tool calls."
        )
        return header + "\n".join(lines) + brevity


def _a(key: str, tools: tuple[str, ...], hp: int, hostile: bool) -> Archetype:
    return Archetype(key=key, allowed_tools=tools, default_hp=hp, hostile=hostile)


ARCHETYPES: dict[str, Archetype] = {
    "hostile_boss": _a(
        "hostile_boss", ("offense", "defense", "environment", "dialogue"), 500, True
    ),
    "hostile_monster": _a("hostile_monster", ("offense", "defense", "dialogue"), 60, True),
    "friendly_merchant": _a(
        "friendly_merchant", ("dialogue", "trade", "world_query", "quest"), 100, False
    ),
    "quest_giver": _a("quest_giver", ("dialogue", "quest", "world_query"), 100, False),
    "neutral_guard": _a(
        "neutral_guard", ("dialogue", "offense", "defense", "world_query"), 150, False
    ),
    "friendly_healer": _a(
        "friendly_healer", ("dialogue", "support", "defense", "world_query"), 100, False
    ),
    "friendly_stoner": _a("friendly_stoner", ("dialogue", "world_query", "music"), 100, False),
    "eccentric_archmage": _a(
        "eccentric_archmage",
        ("dialogue", "environment", "offense", "defense", "world_query"),
        120,
        False,
    ),
    "volatile_pyromancer": _a(
        "volatile_pyromancer",
        ("dialogue", "environment", "offense", "defense", "world_query"),
        120,
        False,
    ),
    "mysterious_cryomancer": _a(
        "mysterious_cryomancer",
        ("dialogue", "environment", "offense", "defense", "world_query"),
        120,
        False,
    ),
    "friendly_guide": _a("friendly_guide", ("dialogue", "quest", "world_query"), 100, False),
    "neutral_wanderer": _a(
        "neutral_wanderer",
        ("dialogue", "quest", "offense", "defense", "world_query"),
        150,
        False,
    ),
}


def get_archetype(key: str) -> Archetype | None:
    """Return the archetype for ``key``, or ``None`` if unknown."""
    return ARCHETYPES.get(key)
