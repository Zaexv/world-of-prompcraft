from __future__ import annotations

from ..agent_state import NPCAgentState


async def respond_node(state: NPCAgentState) -> dict:
    """Extract the final dialogue text from the last AI message."""
    last_message = state["messages"][-1]
    dialogue = getattr(last_message, "content", "")
    if not dialogue:
        dialogue = "..."
    return {
        "response_text": dialogue,
        "pending_actions": state.get("pending_actions", []),
    }
