from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_core.messages import ToolMessage

if TYPE_CHECKING:
    from langchain_core.tools import BaseTool

    from ..agent_state import NPCAgentState


def make_act_node(tools: list[BaseTool], shared_pending_actions: list):
    """Return an act node function closed over the available tools.

    Args:
        tools: List of LangChain tools (already closed over shared state).
        shared_pending_actions: The same mutable list the tools append to,
            so the node can harvest accumulated actions after each call.
    """
    tool_map = {t.name: t for t in tools}

    async def act_node(state: NPCAgentState) -> dict:
        last_message = state["messages"][-1]
        tool_calls = getattr(last_message, "tool_calls", [])

        tool_messages: list[ToolMessage] = []
        # Start with whatever pending actions already exist in graph state
        pending_actions = list(state.get("pending_actions", []))

        # Clear the shared list so we only capture new actions from this round
        shared_pending_actions.clear()

        for call in tool_calls:
            tool_name = call["name"]
            tool_args = call["args"]

            if tool_name in tool_map:
                try:
                    result = await tool_map[tool_name].ainvoke(tool_args)
                    result_str = str(result)
                except Exception as exc:
                    result_str = f"Tool error: {exc}"
            else:
                result_str = f"Unknown tool: {tool_name}"

            tool_messages.append(ToolMessage(content=result_str, tool_call_id=call["id"]))

        # Harvest any actions the tools appended to the shared list
        pending_actions.extend(shared_pending_actions)
        shared_pending_actions.clear()

        return {"messages": tool_messages, "pending_actions": pending_actions}

    return act_node
