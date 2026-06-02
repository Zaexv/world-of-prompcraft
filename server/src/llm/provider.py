from __future__ import annotations

from typing import TYPE_CHECKING, Any

import httpx
from langchain_openai import ChatOpenAI

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from ..config import Settings


def get_llm(settings: Settings) -> BaseChatModel:
    """Return a ChatOpenAI-compatible model for the configured provider.

    All three providers (claude, openai, ollama) use the ChatOpenAI adapter so
    they share the same interface, configuration surface, and timeout handling.
    Claude is accessed via Anthropic's OpenAI-compatible endpoint; Ollama via
    its built-in /v1 shim; OpenAI natively.
    """
    if settings.llm_provider == "claude":
        model_kwargs: dict[str, Any] = {}
        if settings.anthropic_reasoning_effort:
            model_kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": 1024,
            }
        return ChatOpenAI(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,  # type: ignore[arg-type]
            base_url=settings.anthropic_base_url,
            temperature=settings.llm_temperature,
            max_tokens=settings.response_max_tokens,  # type: ignore[call-arg]
            request_timeout=settings.anthropic_request_timeout_seconds,
            max_retries=settings.anthropic_max_retries,
            http_client=httpx.Client(timeout=settings.anthropic_request_timeout_seconds),
            model_kwargs=model_kwargs if model_kwargs else {},
        )

    if settings.llm_provider == "openai":
        model_kwargs = {}
        if settings.openai_reasoning_effort:
            model_kwargs["reasoning_effort"] = settings.openai_reasoning_effort
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,  # type: ignore[arg-type]
            base_url=settings.openai_api_base,
            temperature=settings.llm_temperature,
            max_tokens=settings.response_max_tokens,  # type: ignore[call-arg]
            request_timeout=settings.openai_request_timeout_seconds,
            max_retries=settings.openai_max_retries,
            model_kwargs=model_kwargs if model_kwargs else {},
        )

    if settings.llm_provider == "ollama":
        model_kwargs = {}
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
