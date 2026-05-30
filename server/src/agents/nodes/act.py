from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from langchain_core.messages import ToolMessage

from ..agent_state import NPCAgentState  # noqa: TC001 - LangGraph introspects at runtime

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

    from ..action_sink import PendingActionSink


_ATTACK_TOOL_NAMES = {"deal_damage"}
_TRADE_TOOL_NAMES = {"offer_item"}
_DETERMINISTIC_HINTS = {
    "attack": "I strike back immediately.",
    "trade": "Here is what I can offer.",
}


def _infer_fast_intent_from_tools(tool_names: list[str]) -> str | None:
    if not tool_names:
        return None
    names = set(tool_names)
    if names.issubset(_ATTACK_TOOL_NAMES):
        return "attack"
    if names.issubset(_TRADE_TOOL_NAMES):
        return "trade"
    return None


def make_act_node(tools: list[BaseTool], pending_action_sink: PendingActionSink) -> Any:
    """Return an act node function closed over the available tools.

    Args:
        tools: List of LangChain tools (already closed over shared state).
        pending_action_sink: Context-aware action sink shared by tool closures.
    """
    tool_map = {t.name: t for t in tools}

    async def act_node(state: NPCAgentState) -> dict[str, Any]:
        if not state["messages"]:
            return {}
        last_message = state["messages"][-1]
        tool_calls = getattr(last_message, "tool_calls", [])

        tool_messages: list[ToolMessage] = []
        executed_tool_names: list[str] = []
        # Start with whatever pending actions already exist in graph state
        pending_actions = list(state.get("pending_actions", []))
        capture_id = uuid.uuid4().hex
        capture_token = pending_action_sink.start_capture(capture_id)

        try:
            for call in tool_calls:
                tool_name = call["name"]
                tool_args = call["args"]
                executed_tool_names.append(tool_name)

                if tool_name in tool_map:
                    try:
                        result = await tool_map[tool_name].ainvoke(tool_args)
                        result_str = str(result)
                    except Exception as exc:
                        result_str = f"Tool error: {exc}"
                else:
                    result_str = f"Unknown tool: {tool_name}"

                tool_messages.append(ToolMessage(content=result_str, tool_call_id=call["id"]))
        finally:
            pending_action_sink.end_capture(capture_token)

        # Harvest only actions emitted in this invocation context.
        pending_actions.extend(pending_action_sink.drain(capture_id))

        node_output: dict[str, Any] = {
            "messages": tool_messages,
            "pending_actions": pending_actions,
            "last_tool_names": executed_tool_names,
        }

        fast_intent = (state.get("fast_intent") or "").lower()
        inferred_intent = _infer_fast_intent_from_tools(executed_tool_names)
        if not fast_intent and inferred_intent:
            node_output["fast_intent"] = inferred_intent
            node_output["response_text"] = _DETERMINISTIC_HINTS[inferred_intent]

        return node_output

    return act_node
