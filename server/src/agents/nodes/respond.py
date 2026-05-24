from __future__ import annotations

from typing import Any

from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime


async def respond_node(state: NPCAgentState) -> dict[str, Any]:
    """Extract the final dialogue text from the last AI message."""
    if not state["messages"]:
        return {"response_text": "...", "pending_actions": state.get("pending_actions", [])}
    last_message = state["messages"][-1]
    dialogue = getattr(last_message, "content", "")
    if not dialogue:
        dialogue = "..."
    return {
        "response_text": dialogue,
        "pending_actions": state.get("pending_actions", []),
    }
