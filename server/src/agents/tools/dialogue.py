"""Dialogue and social interaction tools for NPC agents."""

from __future__ import annotations

from langchain_core.tools import tool

VALID_ANIMATIONS = frozenset(["bow", "laugh", "wave", "threaten", "dance", "cry", "cheer"])


def create_dialogue_tools(pending_actions: list, world_state: dict) -> list:
    """Create dialogue-related tools closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def emote(animation: str) -> str:
        """Perform a visible emote animation to express emotion or reaction.

        Args:
            animation: The animation to play. Must be one of:
                       "bow", "laugh", "wave", "threaten", "dance", "cry", "cheer".
        """
        if animation not in VALID_ANIMATIONS:
            return (
                f"Invalid animation '{animation}'. "
                f"Choose from: {', '.join(sorted(VALID_ANIMATIONS))}"
            )
        pending_actions.append(
            {
                "kind": "emote",
                "params": {"animation": animation},
            }
        )
        return f"Performed {animation} emote"

    @tool
    def give_quest(quest_name: str, description: str) -> str:
        """Offer a dynamic or improvised quest to the player. Use ONLY for
        spontaneous, NPC-created quests that are NOT in the predefined quest
        definitions. For predefined quests, use start_quest from the quest tools
        instead.

        Args:
            quest_name: A short, memorable name for the quest.
            description: A description of the quest objectives and context.
        """
        pending_actions.append(
            {
                "kind": "start_quest",
                "params": {"questName": quest_name, "description": description},
            }
        )
        return f"Offered quest: {quest_name}"

    @tool
    def complete_quest(quest_id: str, reward: str) -> str:
        """Mark a quest as completed and give the player their reward. Use when
        the player has fulfilled the quest requirements.

        Args:
            quest_id: The identifier of the quest being completed (matches the
                      quest_id used in start_quest).
            reward: The item or reward to grant the player.
        """
        pending_actions.append(
            {
                "kind": "complete_quest",
                "params": {"questId": quest_id, "reward": reward},
            }
        )
        pending_actions.append(
            {
                "kind": "give_item",
                "params": {"item": reward},
            }
        )
        return f"Completed quest: {quest_id}, rewarded: {reward}"

    return [emote, give_quest, complete_quest]
