from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from ..agent_state import NPCAgentState

logger = logging.getLogger(__name__)

# Only summarize when the conversation exceeds this many messages
_SUMMARIZE_THRESHOLD = 10

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


def _should_summarize(state: NPCAgentState) -> str:
    """Conditional edge: summarize only when enough messages have accumulated."""
    messages = state.get("messages", [])
    human_count = sum(
        1 for m in messages
        if (hasattr(m, "type") and m.type == "human")
        or (isinstance(m, dict) and m.get("role") == "human")
    )
    if human_count >= _SUMMARIZE_THRESHOLD and human_count % 3 == 0:
        return "summarize"
    return "end"


def make_summarize_node(llm: BaseChatModel) -> Any:
    """Return a summarize node function closed over the given LLM."""

    async def summarize_node(state: NPCAgentState) -> dict:
        """Generate a rolling conversation summary using the LLM."""
        previous_summary = state.get("conversation_summary", "") or ""
        messages = state.get("messages", [])

        # Build a compact conversation transcript from recent messages
        lines: list[str] = []
        for msg in messages[-12:]:
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

        if not lines:
            return {}

        conversation_text = "\n".join(lines)
        prompt = _SUMMARIZE_PROMPT.format(
            previous_summary=previous_summary or "(none)",
            conversation=conversation_text,
        )

        try:
            result = await llm.ainvoke([SystemMessage(content=prompt)])
            summary = getattr(result, "content", "")
            if summary:
                # Cap at 500 chars to avoid prompt bloat
                return {"conversation_summary": summary[:500]}
        except Exception:
            logger.warning("Summarize node failed; keeping existing summary", exc_info=True)

        return {}

    return summarize_node
