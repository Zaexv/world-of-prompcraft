import pytest
from langchain_core.messages import AIMessage, HumanMessage
from server.agents.npc_graph import npc_graph
from server.tests.llm_fixtures import MockChatModel


@pytest.mark.asyncio
async def test_npc_persona_and_logic():
    # Setup mock with a deterministic response
    mock_llm = MockChatModel(
        responses={"Who are you?": "I am Barnaby, the guard. Do you have any snacks?"}
    )

    state = {
        "messages": [HumanMessage(content="Who are you?")],
        "player_id": "player_123",
        "npc_id": "guard_1",
        "current_quest": None,
        "reputation": 0,
    }

    # Run agent logic with mock injected via config
    config = {"configurable": {"llm": mock_llm, "thread_id": "test_thread_1"}}
    result = await npc_graph.ainvoke(state, config=config)

    # Assertions
    last_message = result["messages"][-1]
    assert isinstance(last_message, AIMessage)
    assert "Barnaby" in last_message.content
    assert "snacks" in last_message.content


@pytest.mark.asyncio
async def test_npc_missing_persona_fallback():
    mock_llm = MockChatModel(responses={"Hello": "I am a generic NPC."})

    state = {
        "messages": [HumanMessage(content="Hello")],
        "player_id": "player_999",
        "npc_id": "unknown_npc",
        "current_quest": None,
        "reputation": 0,
    }

    config = {"configurable": {"llm": mock_llm, "thread_id": "test_thread"}}
    result = await npc_graph.ainvoke(state, config=config)

    assert "generic NPC" in result["messages"][-1].content


@pytest.mark.asyncio
async def test_npc_tool_calling():
    tool_call = {"name": "get_player_status", "args": {"player_id": "player_123"}, "id": "call_1"}

    mock_llm = MockChatModel(
        responses={
            "What is my status?": AIMessage(content="", tool_calls=[tool_call]),
        },
        default_response="You are level 5 and have a Rusty Sword.",
    )

    state = {
        "messages": [HumanMessage(content="What is my status?")],
        "player_id": "player_123",
        "npc_id": "guard_1",
        "current_quest": None,
        "reputation": 0,
    }

    config = {"configurable": {"llm": mock_llm, "thread_id": "test_thread"}}
    result = await npc_graph.ainvoke(state, config=config)

    assert len(result["messages"]) >= 3
    assert "Rusty Sword" in result["messages"][-1].content
