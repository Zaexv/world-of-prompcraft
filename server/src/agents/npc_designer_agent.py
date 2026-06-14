"""LangGraph NPC Designer agent — the 'Architect' that creates NPCs from chat.

Mirrors the WorldBuilder agent's 3-node shape (reason → act loop → respond) but
is bound ONLY to the NPC-designer tools, so it can create/edit NPCs and nothing
else.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from langchain_core.messages import AIMessage, SystemMessage, ToolMessage
from langgraph.graph import END, START, StateGraph

from .agent_state import NPCAgentState
from .tools.npc_designer import create_npc_designer_tools

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel
    from langgraph.graph.state import CompiledStateGraph as CompiledGraph

ARCHITECT_SYSTEM_PROMPT = """You are the Architect of Promptcraft — a creator spirit who breathes life into new characters.
When a player asks you to make, create, add, or design an NPC, use your tools to do so.

Guidelines:
- Call create_npc with a name, an archetype, and a flavor_prompt (the character's voice/personality).
- The ARCHETYPE decides what the NPC can do. If unsure which fits, call list_archetypes first. Pick the closest role to the request (e.g. a shopkeeper -> friendly_merchant, a doctor -> friendly_healer, a beast -> hostile_monster).
- Do NOT put tool instructions in flavor_prompt — the archetype supplies those automatically. flavor_prompt is pure character: who they are, how they speak, what they care about.
- To change an existing NPC, call edit_npc.
- Respond briefly in a warm, creator's voice describing who you brought to life.
- Keep responses under 3 sentences.
"""


def _should_act_or_end(state: NPCAgentState) -> str:
    last = state["messages"][-1]
    if getattr(last, "tool_calls", []):
        return "act"
    return "end"


def create_npc_designer_agent(
    llm: BaseChatModel,
    pending_actions: list[Any],
) -> CompiledGraph:  # type: ignore[type-arg]
    """Build the NPC Designer LangGraph agent."""
    tools = create_npc_designer_tools(pending_actions)
    tool_map = {t.name: t for t in tools}
    llm_with_tools = llm.bind_tools(tools)

    def reason_node(state: NPCAgentState) -> dict[str, Any]:
        system = SystemMessage(content=ARCHITECT_SYSTEM_PROMPT)
        context = state.get("world_context", {})
        ctx_str = ""
        if isinstance(context, dict) and context:
            ctx_str = " ".join(f"{k}: {v}" for k, v in context.items())
        elif isinstance(context, str):
            ctx_str = context
        msgs: list[Any] = [system]
        if ctx_str:
            msgs.append(SystemMessage(content=f"Context: {ctx_str}"))
        msgs.extend(state["messages"])
        response = llm_with_tools.invoke(msgs)
        return {"messages": [*state["messages"], response]}

    def act_node(state: NPCAgentState) -> dict[str, Any]:
        last = state["messages"][-1]
        results: list[Any] = []
        for tc in getattr(last, "tool_calls", []):
            fn = tool_map.get(tc["name"])
            if fn is None:
                out: Any = f"Unknown tool: {tc['name']}"
            else:
                try:
                    out = fn.invoke(tc["args"])
                except Exception as exc:
                    out = f"Tool {tc['name']} failed: {exc}"
            results.append(ToolMessage(content=str(out), tool_call_id=tc["id"]))
        return {"messages": [*state["messages"], *results]}

    def respond_node(state: NPCAgentState) -> dict[str, Any]:
        for msg in reversed(state["messages"]):
            if isinstance(msg, AIMessage) and not getattr(msg, "tool_calls", []) and msg.content:
                content = msg.content
                return {"response_text": content if isinstance(content, str) else str(content)}
        return {"response_text": "A new soul stirs into being..."}

    graph: StateGraph[NPCAgentState] = StateGraph(NPCAgentState)
    graph.add_node("reason", reason_node)
    graph.add_node("act", act_node)
    graph.add_node("respond", respond_node)
    graph.add_edge(START, "reason")
    graph.add_conditional_edges("reason", _should_act_or_end, {"act": "act", "end": "respond"})
    graph.add_edge("act", "reason")
    graph.add_edge("respond", END)
    return graph.compile()
