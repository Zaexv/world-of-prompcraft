from __future__ import annotations

from typing import Any

from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from .constants import EMPTY_DIALOGUE
from .dialogue_fallback import fallback_line


async def fallback_node(state: NPCAgentState) -> dict[str, Any]:
    """Replace empty/ellipsis dialogue with an action-derived in-character line."""
    text = state.get("response_text", EMPTY_DIALOGUE)
    if not text or text == EMPTY_DIALOGUE:
        text = fallback_line(state.get("pending_actions", [])) or EMPTY_DIALOGUE
    return {"response_text": text}
