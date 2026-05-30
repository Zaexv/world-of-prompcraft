from __future__ import annotations


def get_relationship_tier(score: int) -> str:
    """Map a numerical relationship score to a descriptive tier."""
    if score <= -50:
        return "ENEMY — This player is your sworn foe. Be hostile and guarded."
    if score <= -10:
        return "DISTRUSTFUL — You distrust this player. Be wary and curt."
    if score <= 10:
        return "STRANGER — You have no strong feelings. Be polite but reserved."
    if score <= 50:
        return "FRIEND — You like this player. Be warm and helpful."
    return "TRUSTED ALLY — This player is your trusted companion. Share secrets, offer rare items and quests."
