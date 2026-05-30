from unittest.mock import AsyncMock, MagicMock

import pytest
from langchain_core.messages import AIMessage, HumanMessage

from src.agents.nodes.episodic_memory import make_episodic_memory_node
from src.agents.nodes.pre_check import make_pre_check_node


@pytest.mark.asyncio
async def test_fast_path_attack():
    mock_llm = MagicMock()
    node = make_pre_check_node(mock_llm)
    state = {"messages": [HumanMessage(content="attack the guard")], "npc_name": "Guard"}
    result = await node(state)
    assert result["fast_intent"] == "attack"
    assert "defend" in result["messages"][0].content.lower()


@pytest.mark.asyncio
async def test_fast_path_trade():
    mock_llm = MagicMock()
    node = make_pre_check_node(mock_llm)
    state = {"messages": [HumanMessage(content="I want to trade")], "npc_name": "Merchant"}
    result = await node(state)
    assert result["fast_intent"] == "trade"
    assert "exchange" in result["messages"][0].content.lower()


@pytest.mark.asyncio
async def test_fast_path_no_match():
    mock_llm = MagicMock()
    node = make_pre_check_node(mock_llm)
    state = {"messages": [HumanMessage(content="Hello there")], "npc_name": "Villager"}
    result = await node(state)
    # Greetings handled by fast_social_reply (id starts with fast_reply)
    assert "fast_reply" in result["messages"][0].id


@pytest.mark.asyncio
async def test_episodic_memory_extraction():
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(
        return_value=MagicMock(content="The player likes apples.\nThe player is from Stormwind.")
    )

    node = make_episodic_memory_node(mock_llm)
    state = {
        "messages": [
            HumanMessage(content="I love eating apples, and I just arrived from Stormwind."),
            AIMessage(content="Welcome! I have many apples here."),
        ],
        "episodic_memories": [],
    }

    result = await node(state)
    assert "The player likes apples." in result["episodic_memories"]
    assert "The player is from Stormwind." in result["episodic_memories"]
    assert len(result["episodic_memories"]) == 2


@pytest.mark.asyncio
async def test_episodic_memory_none():
    mock_llm = MagicMock()
    mock_llm.ainvoke = AsyncMock(return_value=MagicMock(content="NONE"))

    node = make_episodic_memory_node(mock_llm)
    state = {
        "messages": [HumanMessage(content="Hi"), AIMessage(content="Hello")],
        "episodic_memories": ["Existing fact"],
    }

    result = await node(state)
    assert result == {}
