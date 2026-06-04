from __future__ import annotations

from typing import Any

from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from .constants import EMPTY_DIALOGUE


async def respond_node(state: NPCAgentState) -> dict[str, Any]:
    """Extract the final dialogue text from the last AI message."""
    pending = state.get("pending_actions", [])
    if not state["messages"]:
        return {"response_text": EMPTY_DIALOGUE, "pending_actions": pending}
    last_message = state["messages"][-1]
    dialogue = getattr(last_message, "content", "") or EMPTY_DIALOGUE
    return {"response_text": dialogue, "pending_actions": pending}
