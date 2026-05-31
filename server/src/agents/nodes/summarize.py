from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage

from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

_SUMMARIZE_THRESHOLD = 10
_SUMMARIZE_INTERVAL = 3
_SUMMARY_WINDOW_SIZE = 12
_SUMMARY_MAX_CHARS = 500

_SUMMARIZE_PROMPT = (
    "You are a memory summarizer for an NPC in a fantasy game. "
    "Given the conversation history below, produce a concise 2-3 sentence summary "
    "of the key events, promises made, items exchanged, quests discussed, and the "
    "overall tone of the interaction. Focus on what the NPC should remember for "
    "future conversations with this player.\n\n"
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


def make_summarize_node(llm: BaseChatModel) -> Any:
    """Return a summarize node function closed over the given LLM."""

    async def summarize_node(state: NPCAgentState) -> dict[str, Any]:
        """Generate a rolling conversation summary using the LLM."""
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
            if summary:
                return {"conversation_summary": summary[:_SUMMARY_MAX_CHARS]}
        except Exception:
            logger.warning("Summarize node failed; keeping existing summary", exc_info=True)

        return {}

    return summarize_node
