"""Shared prompt fragments used by both the reasoning and speaking channels.

Factored out so the two prompts cannot drift: the relationship tiers and the
length budget are defined once here and imported by ``reason`` and ``respond``.
"""

from __future__ import annotations

from ...config import settings


def global_npc_directive() -> str:
    """World-wide rules applied to every NPC, on top of its own personality.

    Sourced from ``settings.npc_global_directive`` (env: ``NPC_GLOBAL_DIRECTIVE``)
    so a single switch governs all characters. Returns ``""`` when disabled.
    """
    return (settings.npc_global_directive or "").strip()


def global_directive_section() -> list[str]:
    """The global directive as prompt lines (a ``## Global Rules`` block), or []."""
    directive = global_npc_directive()
    if not directive:
        return []
    return ["", "## Global Rules (apply to every NPC)", directive]


def relationship_tier(score: int) -> str:
    """Return the relationship-tier instruction line for a cumulative score."""
    if score <= -50:
        return (
            "ENEMY — This player is your sworn foe. Attack on sight. "
            "NEVER trade, give items, or help them in any way."
        )
    if score <= -20:
        return (
            "HOSTILE — This player has attacked you. Be aggressive and defensive. "
            "REFUSE all trade and quest requests. Do not offer items."
        )
    if score <= -10:
        return "DISTRUSTFUL — You distrust this player. Be wary and curt."
    if score <= 10:
        return "STRANGER — You have no strong feelings. Be polite but reserved."
    if score <= 50:
        return "FRIEND — You like this player. Be warm and helpful."
    return (
        "TRUSTED ALLY — This player is your trusted companion. "
        "Share secrets, offer rare items and quests."
    )


def length_budget_instruction(lore_used: bool) -> str:
    """Hard character budget for the spoken reply, tighter when there is no lore.

    Prompt-only enforcement: the dialogue is never truncated server-side, so the
    instruction must be explicit. Lore-bearing replies earn extra room to share it.
    """
    if lore_used:
        return (
            "LENGTH: Share the lore fully — aim for a few sentences. "
            "Stay on point: only the lore that answers the prompt, no rambling."
        )
    return (
        "LENGTH: Reply naturally — a couple of sentences is plenty. "
        "Be vivid but don't pad with filler or lists."
    )
