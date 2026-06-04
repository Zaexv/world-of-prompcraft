"""Quest tools for NPC agents."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from ...world.quest_definitions import QUEST_DEFINITIONS


def create_quest_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
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
        completed. Also shows available follow-up quests if a completed quest
        has a chain. Use this to decide whether to offer a new quest or complete
        an existing one."""
        player = world_state.get("player", {})
        active = player.get("active_quests", [])
        completed = player.get("completed_quests", [])
        inventory = player.get("inventory", [])

        from ...world.quest_definitions import QUEST_DEFINITIONS

        follow_ups: list[str] = []
        for cq_id in completed:
            qdef = QUEST_DEFINITIONS.get(cq_id)
            if qdef and qdef.next_quest_id:
                next_id = qdef.next_quest_id
                if next_id not in completed and not any(q["id"] == next_id for q in active):
                    next_def = QUEST_DEFINITIONS.get(next_id)
                    if next_def:
                        follow_ups.append(f"{next_def.name} (id: {next_id})")

        result = (
            f"Active quests: {active}\nCompleted quests: {completed}\nPlayer inventory: {inventory}"
        )
        if follow_ups:
            result += (
                f"\nAvailable follow-up quests: {', '.join(follow_ups)}. "
                "Consider offering one of these to the player if appropriate."
            )
        return result

    return [start_quest, advance_quest_objective, check_player_quests]
