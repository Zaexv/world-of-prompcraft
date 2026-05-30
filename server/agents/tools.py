from typing import Any

from langchain_core.tools import tool

# In a real app, these would query a database
PLAYER_DATA = {
    "player_123": {"level": 5, "inventory": ["Rusty Sword", "Small Potion"], "completed_quests": []}
}


@tool
def get_player_status(player_id: str) -> dict[str, Any]:
    """Get the current status, level, and inventory of a player."""
    return PLAYER_DATA.get(player_id, {"error": "Player not found"})


@tool
def check_quest_eligibility(player_id: str, quest_id: str) -> bool:
    """Check if a player is eligible for a specific quest."""
    player = PLAYER_DATA.get(player_id)
    if not player:
        return False

    if quest_id == "dragon_slayer" and player["level"] >= 10:
        return True
    return bool(quest_id == "find_the_lost_cat" and player["level"] >= 1)


tools = [get_player_status, check_quest_eligibility]
