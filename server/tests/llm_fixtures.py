"""Mock LLM providers and fixtures for fast, offline testing."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from pydantic import Field

if TYPE_CHECKING:
    from collections.abc import Sequence

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage, HumanMessage
from langchain_core.outputs import LLMResult
from langchain_core.outputs.generation import Generation


class MockChatModel(BaseChatModel):
    """Deterministic mock ChatModel for testing without API calls."""

    model_name: str = "mock-gpt-4"
    response_template: str = "Mock response to: {input}"
    tool_calls_data: list[dict[str, Any]] = Field(default_factory=list)
    call_count: int = 0
    last_messages: list[BaseMessage] = Field(default_factory=list)
    bound_tools: list[Any] = Field(default_factory=list)

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Any:
        """Synchronous generate (not used in async context)."""
        raise NotImplementedError("Use async_generate instead")

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        run_manager: Any = None,
        **kwargs: Any,
    ) -> Any:
        """Async generate—returns deterministic response."""
        self.call_count += 1
        self.last_messages = messages

        # Extract last user message for template
        user_input = ""
        for msg in reversed(messages):
            if isinstance(msg, HumanMessage):
                user_input = msg.content or ""
                break

        response_text = self.response_template.format(input=user_input)

        # Return with text field for Generation
        return LLMResult(generations=[[Generation(text=response_text)]])

    def bind_tools(
        self,
        tools: Sequence[Any] | Sequence[dict[str, Any]] | None = None,
        **kwargs: Any,
    ) -> Any:
        """Bind tools to the model. Returns self for chaining."""
        self.bound_tools = list(tools or [])
        return self

    @property
    def _llm_type(self) -> str:
        return self.model_name


@pytest.fixture()
def mock_llm_claude() -> MockChatModel:
    """Mock Claude model for testing."""
    return MockChatModel(
        model_name="mock-claude-sonnet",
        response_template="Claude mock response: {input}",
    )


@pytest.fixture()
def mock_llm_openai() -> MockChatModel:
    """Mock OpenAI model for testing."""
    return MockChatModel(
        model_name="mock-gpt-4",
        response_template="OpenAI mock response: {input}",
    )


@pytest.fixture()
def mock_llm_with_tool_calls() -> MockChatModel:
    """Mock LLM that returns predefined tool calls."""
    tool_calls = [
        {
            "name": "deal_damage",
            "args": {"target_id": "enemy_1", "damage": 25},
            "id": "tool_call_1",
        }
    ]
    model = MockChatModel(
        model_name="mock-gpt-4-tools",
        response_template="Taking action: {input}",
    )
    model.tool_calls_data = tool_calls
    return model


@pytest.fixture()
def mock_settings():
    """Mock Settings with no real API keys."""
    from src.config import Settings

    return Settings(
        llm_provider="openai",
        openai_api_key="mock-key-12345",
        anthropic_api_key="",
        openai_model="gpt-4",
        anthropic_model="claude-sonnet-4-20250514",
        llm_temperature=0.1,
        max_tokens=4096,
        ws_port=8000,
    )


@pytest.fixture()
def patch_llm_provider(mock_llm_openai):
    """Patch the LLM provider factory to return mock."""
    from unittest.mock import patch

    with patch("src.llm.provider.get_llm", return_value=mock_llm_openai):
        yield mock_llm_openai


@pytest.fixture()
def patch_agent_invoke():
    """Patch AgentRegistry.invoke to return mock response."""
    from unittest.mock import AsyncMock, patch

    mock_response = {
        "dialogue": "NPC mock dialogue",
        "actions": [
            {
                "kind": "npc_damage",
                "target_id": "player_1",
                "amount": 10,
            }
        ],
    }

    with patch(
        "src.agents.registry.AgentRegistry.invoke",
        new_callable=AsyncMock,
        return_value=mock_response,
    ) as mock_invoke:
        yield mock_invoke


@pytest.fixture()
def mock_agent_registry():
    """Create a mock AgentRegistry with deterministic responses."""
    from unittest.mock import AsyncMock

    mock_registry = AsyncMock()
    mock_registry.invoke = AsyncMock(
        return_value={
            "dialogue": "Mock NPC response",
            "actions": [],
        }
    )
    return mock_registry
