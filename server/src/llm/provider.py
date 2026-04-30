from __future__ import annotations

from typing import TYPE_CHECKING

from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from ..config import Settings


def get_llm(settings: Settings) -> BaseChatModel:
    """Factory that returns a chat model based on the configured provider."""
    if settings.llm_provider == "claude":
        return ChatAnthropic(
            model=settings.anthropic_model,  # type: ignore[call-arg]
            api_key=settings.anthropic_api_key,  # type: ignore[arg-type]
        )
    if settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,  # type: ignore[arg-type]
            base_url=settings.openai_api_base,
            temperature=settings.llm_temperature,
            max_tokens=settings.max_tokens,  # type: ignore[call-arg]
        )
    raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
