"""Dialogue and social interaction tools for NPC agents."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

VALID_ANIMATIONS = frozenset(["bow", "laugh", "wave", "threaten", "dance", "cry", "cheer"])


def create_dialogue_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
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

    return [emote]
