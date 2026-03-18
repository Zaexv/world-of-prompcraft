from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import MemorySaver

from .agent_state import NPCAgentState
from .nodes.reason import make_reason_node
from .nodes.act import make_act_node
from .nodes.respond import respond_node

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool
    from langgraph.graph.state import CompiledGraph

    from ..world.world_state import WorldState


def _should_act_or_respond(state: NPCAgentState) -> str:
    """Route from reason: if the last message has tool_calls go to act, else respond."""
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", [])
    if tool_calls:
        return "act"
    return "respond"


def create_npc_agent(
    npc_id: str,
    npc_config: dict[str, Any],
    llm: BaseChatModel,
    tools: list[BaseTool],
    shared_pending_actions: list,
    world_state: WorldState,
) -> CompiledGraph:
    """Build and compile a LangGraph agent for a single NPC.

    Args:
        npc_id: Unique NPC identifier.
        npc_config: Dict with 'name' and 'personality' keys.
        llm: The chat model to use for reasoning.
        tools: Pre-built tools (closed over shared mutable state).
        shared_pending_actions: The mutable list tools append actions to.
        world_state: The WorldState instance (for context lookups).
    """
    reason_node = make_reason_node(llm, tools)
    act_node = make_act_node(tools, shared_pending_actions)

    graph = StateGraph(NPCAgentState)
    graph.add_node("reason", reason_node)
    graph.add_node("act", act_node)
    graph.add_node("respond", respond_node)

    graph.add_edge(START, "reason")
    graph.add_conditional_edges(
        "reason",
        _should_act_or_respond,
        {"act": "act", "respond": "respond"},
    )
    graph.add_edge("act", "reason")
    graph.add_edge("respond", END)

    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)
