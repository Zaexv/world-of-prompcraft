from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx
from langchain_anthropic import ChatAnthropic
from langchain_openai import ChatOpenAI

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from ..config import Settings

_HTTP_TIMEOUT = 20.0


def get_llm(settings: Settings) -> BaseChatModel:
    """Factory that returns a chat model based on the configured provider."""
    if settings.llm_provider == "claude":
        if not settings.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY must be set when llm_provider='claude'")
        return ChatAnthropic(
            model=settings.anthropic_model,  # type: ignore[call-arg]
            api_key=settings.anthropic_api_key,  # type: ignore[arg-type]
            http_client=httpx.AsyncClient(timeout=_HTTP_TIMEOUT),
        )
    if settings.llm_provider == "openai":
        if not settings.openai_api_key:
            raise ValueError("OPENAI_API_KEY must be set when llm_provider='openai'")
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,  # type: ignore[arg-type]
            base_url=settings.openai_api_base,
            temperature=settings.llm_temperature,
            max_tokens=settings.max_tokens,  # type: ignore[call-arg]
            request_timeout=_HTTP_TIMEOUT,
        )
    if settings.llm_provider == "ollama":
        # `reasoning_effort` is forwarded to ollama's OpenAI-compatible endpoint to
        # control "thinking" models. Without it, a reasoning model burns the whole
        # token budget on its hidden reasoning block and returns empty content.
        model_kwargs: dict[str, Any] = {}
        if settings.ollama_reasoning_effort:
            model_kwargs["reasoning_effort"] = settings.ollama_reasoning_effort
        return ChatOpenAI(
            model=settings.ollama_model,
            api_key="ollama",  # type: ignore[arg-type]
            base_url=settings.ollama_base_url,
            temperature=settings.llm_temperature,
            max_tokens=settings.response_max_tokens,  # type: ignore[call-arg]
            request_timeout=settings.ollama_request_timeout_seconds,
            max_retries=settings.ollama_max_retries,
            model_kwargs=model_kwargs,
        )
    raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
