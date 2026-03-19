from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from .agent_state import NPCAgentState
from .nodes.act import make_act_node
from .nodes.reason import make_reason_node
from .nodes.reflect import reflect_node
from .nodes.respond import respond_node
from .nodes.summarize import _should_summarize, make_summarize_node

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langchain_core.tools import BaseTool
    from langgraph.graph.state import CompiledStateGraph as CompiledGraph

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

    Graph flow:
        START → reason → [act loop] → respond → reflect → [summarize?] → END

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
    summarize_node = make_summarize_node(llm)

    graph = StateGraph(NPCAgentState)
    graph.add_node("reason", reason_node)
    graph.add_node("act", act_node)
    graph.add_node("respond", respond_node)
    graph.add_node("reflect", reflect_node)
    graph.add_node("summarize", summarize_node)

    graph.add_edge(START, "reason")
    graph.add_conditional_edges(
        "reason",
        _should_act_or_respond,
        {"act": "act", "respond": "respond"},
    )
    graph.add_edge("act", "reason")
    graph.add_edge("respond", "reflect")
    graph.add_conditional_edges(
        "reflect",
        _should_summarize,
        {"summarize": "summarize", "end": END},
    )
    graph.add_edge("summarize", END)

    checkpointer = MemorySaver()
    return graph.compile(checkpointer=checkpointer)
