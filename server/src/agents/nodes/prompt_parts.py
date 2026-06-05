"""Shared prompt fragments used by both the reasoning and speaking channels.

Factored out so the two prompts cannot drift: the relationship tiers and the
length budget are defined once here and imported by ``reason`` and ``respond``.
"""

from __future__ import annotations


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
            "LENGTH: Keep your reply under 500 characters since you are sharing lore. "
            "Stay tight — only the lore that answers the prompt, no rambling."
        )
    return (
        "LENGTH: Keep your reply under 200 characters. One or two punchy sentences. "
        "No exposition, no lists, no lore dumps."
    )
