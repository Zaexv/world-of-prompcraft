from typing import Annotated, TypedDict

from langchain_core.messages import BaseMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from server.agents.tools import tools
from server.core.config import settings


class NPCState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    player_id: str
    npc_id: str
    current_quest: str | None
    reputation: int


# Persona Registry
PERSONAS = {
    "guard_1": "You are Barnaby, a weary but loyal city guard. You take your job seriously but you are always hungry. Mention snacks if the player is friendly.",
    "blacksmith_1": "You are Thorne, a gruff blacksmith. You value strength and well-maintained gear. You don't have time for small talk.",
}


def get_model(config: RunnableConfig = None):
    # This allows us to inject a mock model during testing
    if config and "configurable" in config and "llm" in config["configurable"]:
        return config["configurable"]["llm"]
    return ChatOpenAI(model="gpt-4o-mini", api_key=settings.OPENAI_API_KEY)


def call_model(state: NPCState, config: RunnableConfig):
    model = get_model(config)
    model_with_tools = model.bind_tools(tools)

    persona = PERSONAS.get(state["npc_id"], "You are a helpful NPC in a fantasy world.")
    system_message = SystemMessage(
        content=f"{persona}\n\nContext:\nPlayer ID: {state['player_id']}\nCurrent Quest: {state['current_quest']}\nReputation: {state['reputation']}"
    )

    messages = [system_message] + state["messages"]
    response = model_with_tools.invoke(messages, config)
    return {"messages": [response]}


def should_continue(state: NPCState):
    messages = state["messages"]
    last_message = messages[-1]
    if getattr(last_message, "tool_calls", None):
        return "tools"
    return END


def summarize_conversation(state: NPCState, config: RunnableConfig):
    # This node will be called if messages > 20
    model = get_model(config)

    # Simple summarization prompt
    summary_prompt = f"Summarize the following conversation history between player {state['player_id']} and NPC {state['npc_id']}. Focus on key facts and quest progress."
    messages = state["messages"]

    response = model.invoke([SystemMessage(content=summary_prompt), *messages])

    # Replace all messages with the summary as a SystemMessage
    return {
        "messages": [SystemMessage(content=f"Summary of previous conversation: {response.content}")]
    }


def should_summarize(state: NPCState):
    if len(state["messages"]) > 20:
        return "summarize"
    return END


def create_npc_graph():
    workflow = StateGraph(NPCState)

    workflow.add_node("agent", call_model)
    workflow.add_node("tools", ToolNode(tools))
    workflow.add_node("summarize", summarize_conversation)

    workflow.set_entry_point("agent")

    workflow.add_conditional_edges(
        "agent", should_continue, {"tools": "tools", END: "check_summarize_dummy"}
    )

    workflow.add_node("check_summarize_dummy", lambda x: x)  # Transition node

    workflow.add_conditional_edges(
        "check_summarize_dummy", should_summarize, {"summarize": "summarize", END: END}
    )

    workflow.add_edge("tools", "agent")
    workflow.add_edge("summarize", END)

    # Fixed edges for the summarize logic
    workflow.add_edge("agent", "check_summarize_dummy")

    # Add persistence
    memory = MemorySaver()
    return workflow.compile(checkpointer=memory)


npc_graph = create_npc_graph()
