from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import RemoveMessage, SystemMessage

from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

_SUMMARIZE_THRESHOLD = 10
_SUMMARIZE_INTERVAL = 3
_SUMMARY_WINDOW_SIZE = 12
_SUMMARY_MAX_CHARS = 500
# After folding older turns into the summary, keep only this many recent messages
# in the checkpointed channel so per-NPC memory stays bounded over long chats.
_KEEP_RECENT_MESSAGES = 6

_SUMMARIZE_PROMPT = (
    "You are a memory summarizer for an NPC in a fantasy game. "
    "Given the conversation history below, produce a concise 2-3 sentence summary "
    "of the key events, promises made, items exchanged, quests discussed, the "
    "player's long-term goals, and the overall tone of the interaction. Focus on "
    "what the NPC should remember for future conversations with this player. "
    "Preserve stable facts about the player instead of dropping them when the "
    "conversation moves on.\n\n"
    "Previous summary (if any): {previous_summary}\n\n"
    "Recent conversation:\n{conversation}\n\n"
    "Write ONLY the updated summary (2-3 sentences):"
)


def route_after_reflect(state: NPCAgentState) -> str:
    """Conditional edge for reflect: summarize only when memory needs compaction."""
    messages = state.get("messages", [])
    human_count = sum(
        1
        for m in messages
        if (hasattr(m, "type") and m.type == "human")
        or (isinstance(m, dict) and m.get("role") == "human")
    )
    if human_count >= _SUMMARIZE_THRESHOLD and human_count % _SUMMARIZE_INTERVAL == 0:
        return "summarize"
    return "end"


def _build_recent_conversation(state: NPCAgentState) -> str:
    """Build a compact transcript from the most recent human/AI messages."""
    lines: list[str] = []
    for msg in state.get("messages", [])[-_SUMMARY_WINDOW_SIZE:]:
        if hasattr(msg, "type"):
            role = msg.type
            content = getattr(msg, "content", "")
        elif isinstance(msg, dict):
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
        else:
            continue
        if content and role in ("human", "ai"):
            speaker = "Player" if role == "human" else state.get("npc_name", "NPC")
            lines.append(f"{speaker}: {content[:200]}")
    return "\n".join(lines)


def _prune_messages(messages: list[Any]) -> list[Any]:
    """RemoveMessage entries trimming the channel to the most recent tail.

    Only messages carrying a stable ``id`` can be deleted via the add_messages
    reducer; any without one are left in place.
    """
    if len(messages) <= _KEEP_RECENT_MESSAGES:
        return []
    removals: list[Any] = []
    for msg in messages[:-_KEEP_RECENT_MESSAGES]:
        mid = getattr(msg, "id", None)
        if mid:
            removals.append(RemoveMessage(id=mid))
    return removals


def make_summarize_node(llm: BaseChatModel) -> Any:
    """Return a summarize node function closed over the given LLM."""

    async def summarize_node(state: NPCAgentState) -> dict[str, Any]:
        """Fold older turns into a rolling summary, then prune the transcript."""
        previous_summary = state.get("conversation_summary", "") or ""
        conversation_text = _build_recent_conversation(state)
        if not conversation_text:
            return {}

        prompt = _SUMMARIZE_PROMPT.format(
            previous_summary=previous_summary or "(none)",
            conversation=conversation_text,
        )

        try:
            result = await llm.ainvoke([SystemMessage(content=prompt)])
            summary = getattr(result, "content", "")
        except Exception:
            logger.warning("Summarize node failed; keeping existing summary", exc_info=True)
            return {}

        if not summary:
            return {}

        # Only prune once the older turns are safely captured in the summary.
        out: dict[str, Any] = {"conversation_summary": summary[:_SUMMARY_MAX_CHARS]}
        removals = _prune_messages(state.get("messages", []))
        if removals:
            out["messages"] = removals
        return out

    return summarize_node
