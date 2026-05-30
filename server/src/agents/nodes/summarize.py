from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from langchain_core.messages import SystemMessage

from ...llm.concurrency import ainvoke_with_semaphore
from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from ..prompts import SUMMARIZE_SYSTEM_PROMPT

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

logger = logging.getLogger(__name__)

_DEFAULT_SUMMARIZE_THRESHOLD = 12
_DEFAULT_SUMMARIZE_INTERVAL = 6


def _should_summarize(state: NPCAgentState) -> str:
    """Conditional edge: summarize only when enough messages have accumulated."""
    fast_intent = (state.get("fast_intent") or "").lower()
    if fast_intent in {"attack", "trade"}:
        return "end"

    messages = state.get("messages", [])
    human_count = sum(
        1
        for m in messages
        if (hasattr(m, "type") and m.type == "human")
        or (isinstance(m, dict) and m.get("role") == "human")
    )

    summarize_threshold = _DEFAULT_SUMMARIZE_THRESHOLD
    summarize_interval = _DEFAULT_SUMMARIZE_INTERVAL
    try:
        from ...config import settings

        summarize_threshold = max(1, settings.summarize_threshold_turns)
        summarize_interval = max(1, settings.summarize_every_n_turns)
    except Exception:
        summarize_threshold = _DEFAULT_SUMMARIZE_THRESHOLD
        summarize_interval = _DEFAULT_SUMMARIZE_INTERVAL

    if human_count >= summarize_threshold and human_count % summarize_interval == 0:
        return "summarize"
    return "end"


def make_summarize_node(llm: BaseChatModel) -> Any:
    """Return a summarize node function closed over the given LLM."""

    async def summarize_node(state: NPCAgentState) -> dict[str, Any]:
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
        prompt = SUMMARIZE_SYSTEM_PROMPT.format(
            previous_summary=previous_summary or "(none)",
            conversation=conversation_text,
        )

        try:
            result = await ainvoke_with_semaphore(llm, [SystemMessage(content=prompt)])
            summary = getattr(result, "content", "")
            if summary:
                # Cap at 500 chars to avoid prompt bloat
                return {"conversation_summary": summary[:500]}
        except Exception:
            logger.warning("Summarize node failed; keeping existing summary", exc_info=True)

        return {}

    return summarize_node
