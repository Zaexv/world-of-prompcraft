"""Quest tools for NPC agents."""

from __future__ import annotations

from langchain_core.tools import tool

from ...world.quest_definitions import QUEST_DEFINITIONS


def create_quest_tools(pending_actions: list, world_state: dict) -> list:
    """Create quest-related tools closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def start_quest(quest_id: str) -> str:
        """Offer a quest to the player. Use when the player asks about adventures,
        quests, or tasks. Only use quest IDs from: sacred_flame, crystal_tear,
        village_patrol.

        Args:
            quest_id: The quest identifier to start.
        """
        qdef = QUEST_DEFINITIONS.get(quest_id)
        if not qdef:
            return f"Unknown quest: {quest_id}"
        pending_actions.append(
            {
                "kind": "start_quest",
                "params": {"questId": quest_id, "quest": qdef.name},
            }
        )
        return f"Started quest: {qdef.name}"

    @tool
    def advance_quest_objective(quest_id: str, objective_id: str) -> str:
        """Mark a quest objective as completed. Use when the player has fulfilled
        a requirement (returned with an item, reported back, etc.).

        Args:
            quest_id: The quest identifier.
            objective_id: The specific objective to advance.
        """
        pending_actions.append(
            {
                "kind": "advance_objective",
                "params": {"questId": quest_id, "objectiveId": objective_id},
            }
        )
        return f"Advanced objective: {objective_id} in quest: {quest_id}"

    @tool
    def check_player_quests() -> str:
        """Check which quests the player currently has active and which are
        completed. Use this to decide whether to offer a new quest or complete
        an existing one."""
        player = world_state.get("player", {})
        active = player.get("active_quests", [])
        completed = player.get("completed_quests", [])
        inventory = player.get("inventory", [])
        return (
            f"Active quests: {active}\nCompleted quests: {completed}\nPlayer inventory: {inventory}"
        )

    return [start_quest, advance_quest_objective, check_player_quests]
