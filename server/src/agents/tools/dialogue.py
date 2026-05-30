"""Dialogue and social interaction tools for NPC agents."""

from __future__ import annotations

import re
from typing import Any

from langchain_core.tools import tool

# Must match the animations the client NPCAnimator can render distinctly
# (see client/src/entities/NPCAnimator.ts).
VALID_ANIMATIONS = frozenset(["wave", "nod", "cheer", "dance", "bow", "laugh", "cry", "threaten"])

# Must match the procedural skins in client/src/entities/NPCModels.ts.
VALID_SKINS = frozenset(
    [
        "civilian",
        "merchant",
        "guard",
        "healer",
        "sage",
        "mage",
        "pyromancer",
        "cryomancer",
        "dragon",
        "monster",
        "orc",
        "undead",
        "oracle",
    ]
)

# Local / non-function-calling models (e.g. Ollama) frequently emit the tool
# call as literal text in their reply instead of a structured tool call, e.g.
# "Hello there! emote('wave')" or "set_skin(style='dragon')". These regexes let
# us recover the intent from the spoken text and strip the leaked syntax.
_EMOTE_CALL_RE = re.compile(
    r"""emote\s*\(\s*(?:animation\s*=\s*)?['"]?(\w+)['"]?\s*\)""",
    re.IGNORECASE,
)
_SKIN_CALL_RE = re.compile(
    r"""set_skin\s*\(\s*(?:style\s*=\s*)?['"]?(\w+)['"]?\s*\)""",
    re.IGNORECASE,
)


def extract_leaked_actions(text: str) -> tuple[str, list[dict[str, Any]]]:
    """Recover emote/set_skin actions a model leaked into its spoken text.

    Returns the cleaned dialogue (with the leaked call syntax removed) and the
    list of recovered actions. Only valid animations/skins are recovered;
    anything else is left untouched in the text.
    """
    actions: list[dict[str, Any]] = []
    seen_emotes: set[str] = set()
    seen_skins: set[str] = set()

    def _emote_sub(match: re.Match[str]) -> str:
        # Always strip the leaked call syntax — it is never valid prose — but
        # only emit an action when the animation is one we can render.
        anim = match.group(1).lower()
        if anim in VALID_ANIMATIONS and anim not in seen_emotes:
            seen_emotes.add(anim)
            actions.append({"kind": "emote", "params": {"animation": anim}})
        return ""

    def _skin_sub(match: re.Match[str]) -> str:
        style = match.group(1).lower()
        if style in VALID_SKINS and style not in seen_skins:
            seen_skins.add(style)
            actions.append({"kind": "set_skin", "params": {"style": style}})
        return ""

    cleaned = _EMOTE_CALL_RE.sub(_emote_sub, text)
    cleaned = _SKIN_CALL_RE.sub(_skin_sub, cleaned)
    # Tidy up any double spaces / dangling whitespace left by the removals.
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned).strip()
    return cleaned, actions


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

    @tool
    def set_skin(style: str) -> str:
        """Transform the NPC's physical appearance into a different skin. Use for
        dramatic reveals (e.g. a hooded stranger revealing they are a 'dragon').

        Args:
            style: The skin to change into. Must be one of: "civilian",
                   "merchant", "guard", "healer", "sage", "mage", "pyromancer",
                   "cryomancer", "dragon", "monster", "orc", "undead", "oracle".
        """
        normalized = style.strip().lower()
        if normalized not in VALID_SKINS:
            return f"Invalid skin '{style}'. Choose from: {', '.join(sorted(VALID_SKINS))}"
        pending_actions.append(
            {
                "kind": "set_skin",
                "params": {"style": normalized},
            }
        )
        return f"Transformed appearance into {normalized}"

    return [emote, give_quest, complete_quest, set_skin]
