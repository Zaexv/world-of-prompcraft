"""Integration tests for agent system with mocked LLM."""

from __future__ import annotations

from typing import TYPE_CHECKING

import pytest
from langchain_core.messages import HumanMessage

if TYPE_CHECKING:
    from tests.llm_fixtures import MockChatModel


@pytest.mark.asyncio
async def test_mock_llm_generation(mock_llm_openai: MockChatModel) -> None:
    """Test mock LLM generates responses without API calls."""
    messages = [HumanMessage(content="Hello!")]
    result = await mock_llm_openai._agenerate(messages)

    assert result is not None
    assert mock_llm_openai.call_count == 1
    assert mock_llm_openai.last_messages == messages


@pytest.mark.asyncio
async def test_mock_llm_tool_calls(mock_llm_with_tool_calls: MockChatModel) -> None:
    """Test mock LLM can return predefined tool calls."""
    messages = [HumanMessage(content="Fight!")]
    result = await mock_llm_with_tool_calls._agenerate(messages)

    assert result is not None
    assert mock_llm_with_tool_calls.tool_calls_data
    assert len(mock_llm_with_tool_calls.tool_calls_data) > 0


@pytest.mark.asyncio
async def test_mock_llm_template_formatting(mock_llm_claude: MockChatModel) -> None:
    """Test mock LLM formats responses with templates."""
    test_prompt = "What is your name?"
    messages = [HumanMessage(content=test_prompt)]

    result = await mock_llm_claude._agenerate(messages)

    assert result is not None
    assert result.generations[0][0].text is not None
    assert "Claude" in result.generations[0][0].text


@pytest.mark.asyncio
async def test_mock_llm_multiple_calls(mock_llm_openai: MockChatModel) -> None:
    """Test mock LLM tracks multiple invocations."""
    messages1 = [HumanMessage(content="First message")]
    messages2 = [HumanMessage(content="Second message")]

    await mock_llm_openai._agenerate(messages1)
    assert mock_llm_openai.call_count == 1

    await mock_llm_openai._agenerate(messages2)
    assert mock_llm_openai.call_count == 2


@pytest.mark.asyncio
async def test_mock_llm_bind_tools(mock_llm_openai: MockChatModel) -> None:
    """Test mock LLM can bind tools for agent use."""
    tools = []
    result = mock_llm_openai.bind_tools(tools)

    assert result is not None
    assert mock_llm_openai.bound_tools == tools


@pytest.mark.asyncio
async def test_mock_llm_empty_prompt(mock_llm_openai: MockChatModel) -> None:
    """Test mock LLM handles empty prompts gracefully."""
    messages = [HumanMessage(content="")]
    result = await mock_llm_openai._agenerate(messages)

    assert result is not None
    assert result.generations[0][0].text is not None


@pytest.mark.asyncio
async def test_mock_llm_long_prompt(mock_llm_openai: MockChatModel) -> None:
    """Test mock LLM handles very long prompts."""
    long_content = "x" * 10000
    messages = [HumanMessage(content=long_content)]
    result = await mock_llm_openai._agenerate(messages)

    assert result is not None
    assert result.generations[0][0].text is not None


def test_mock_settings_fixture(mock_settings) -> None:
    """Test mock settings fixture."""
    assert mock_settings.llm_provider == "openai"
    assert mock_settings.openai_api_key == "mock-key-12345"
    assert mock_settings.llm_temperature == 0.1
    assert mock_settings.max_tokens == 4096
