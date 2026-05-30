from __future__ import annotations

from typing import Any

from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime
from ..tools.dialogue import extract_leaked_actions


def _merge_actions(
    existing: list[dict[str, Any]], extra: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Append recovered actions, skipping ones already emitted via real tools."""
    seen = {(a.get("kind"), str(a.get("params"))) for a in existing}
    merged = list(existing)
    for action in extra:
        key = (action.get("kind"), str(action.get("params")))
        if key not in seen:
            seen.add(key)
            merged.append(action)
    return merged


async def respond_node(state: NPCAgentState) -> dict[str, Any]:
    """Extract the final dialogue text from the last AI message.

    Also recovers emote/set_skin actions that a non-function-calling model may
    have leaked into its spoken text (e.g. "emote('wave')") and strips that
    syntax so the player never sees it.
    """
    pending = list(state.get("pending_actions", []))
    if not state["messages"]:
        return {"response_text": "...", "pending_actions": pending}

    dialogue = state.get("response_text") or "..."
    for msg in reversed(state["messages"]):
        if getattr(msg, "type", "") == "ai":
            content = getattr(msg, "content", "")
            if content:
                dialogue = content
                break

    cleaned, recovered = extract_leaked_actions(dialogue)
    # Bug 15: If the whole message was just leaked tools (e.g. "emote('wave')"),
    # cleaned will be empty. We should still apply it to hide the syntax.
    if recovered:
        dialogue = cleaned or "..."

    return {
        "response_text": dialogue,
        "pending_actions": _merge_actions(pending, recovered),
    }
