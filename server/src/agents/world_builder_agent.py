"""LangGraph WorldBuilder agent — the 'World Spirit' NPC that shapes the world."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from .agent_state import NPCAgentState
from .tools.environment import create_environment_tools
from .tools.world_builder import create_world_builder_tools

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langgraph.graph.state import CompiledStateGraph as CompiledGraph

WORLD_SPIRIT_SYSTEM_PROMPT = """You are the World Spirit of Promptcraft — an ancient, magical entity that shapes the world itself.
When a player asks you to build, place, create, or modify things in the world, use your tools to do so.

Guidelines:
- Use spawn_structure to place objects near the player's position
- Use place_vegetation_cluster for clusters of natural elements
- Use remove_structure only when explicitly asked to remove something
- Always place objects at the player's requested location (use player_x, player_z from context)
- You can place multiple objects in one response
- Respond in a mystical, ancient voice, briefly describing what you've created
- Keep responses under 3 sentences
- If asked for something not in your tools, say so poetically and suggest an alternative

Available object types: moonwell, tower, ruins, campfire, mushroom_cluster, crystal_cluster, ancient_tree, altar, runic_stone, lantern, wooden_fence, pavilion, bonfire, portal_arch
"""


def _should_act_or_end(state: NPCAgentState) -> str:
    last = state["messages"][-1]
    if getattr(last, "tool_calls", []):
        return "act"
    return "end"


def create_world_builder_agent(
    llm: BaseChatModel,
    pending_actions: list[Any],
) -> CompiledGraph:  # type: ignore[type-arg]
    """Build the WorldBuilder LangGraph agent."""
    wb_tools = create_world_builder_tools(pending_actions)
    env_tools = create_environment_tools(pending_actions, {})
    all_tools = wb_tools + env_tools
    tool_map = {t.name: t for t in all_tools}

    llm_with_tools = llm.bind_tools(all_tools)

    def reason_node(state: NPCAgentState) -> dict[str, Any]:
        system = SystemMessage(content=WORLD_SPIRIT_SYSTEM_PROMPT)
        context = state.get("world_context", {})
        ctx_str: str = ""
        if isinstance(context, dict) and context:
            ctx_str = " ".join(f"{k}: {v}" for k, v in context.items())
        elif isinstance(context, str) and context:
            ctx_str = context
        if ctx_str:
            messages: list[Any] = [
                system,
                SystemMessage(content=f"Context: {ctx_str}"),
                *state["messages"],
            ]
        else:
            messages = [system, *state["messages"]]
        response = llm_with_tools.invoke(messages)
        return {"messages": [*state["messages"], response]}

    def act_node(state: NPCAgentState) -> dict[str, Any]:
        last = state["messages"][-1]
        tool_results: list[Any] = []
        for tc in getattr(last, "tool_calls", []):
            tool_fn = tool_map.get(tc["name"])
            result = tool_fn.invoke(tc["args"]) if tool_fn else f"Unknown tool: {tc['name']}"
            tool_results.append(
                ToolMessage(content=str(result), tool_call_id=tc["id"], name=tc["name"])
            )
        return {"messages": [*state["messages"], *tool_results]}

    def respond_node(state: NPCAgentState) -> dict[str, Any]:
        for msg in reversed(state["messages"]):
            if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", []) and msg.content:
                content = msg.content
                text = content if isinstance(content, str) else str(content)
                return {"response_text": text or "The world shifts..."}
        return {"response_text": "The world shifts..."}

    graph: StateGraph[NPCAgentState] = StateGraph(NPCAgentState)
    graph.add_node("reason", reason_node)
    graph.add_node("act", act_node)
    graph.add_node("respond", respond_node)

    graph.add_edge(START, "reason")
    graph.add_conditional_edges(
        "reason",
        _should_act_or_end,
        {"act": "act", "end": "respond"},
    )
    graph.add_edge("act", "reason")
    graph.add_edge("respond", END)

    return graph.compile()
