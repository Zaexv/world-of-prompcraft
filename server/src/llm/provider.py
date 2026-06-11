"""Provider abstraction for building the NPC chat model.

Each supported backend is a small :class:`LLMProvider` strategy that owns its own
client construction and option mapping, so the differences between hosted APIs and
local models stay isolated behind one uniform ``build()`` returning a LangChain
``BaseChatModel``. ``get_llm`` dispatches on ``settings.llm_provider`` via the
:data:`PROVIDERS` registry.

* **claude** / **openai** — hosted, reached through the ``ChatOpenAI`` adapter
  (Claude via Anthropic's OpenAI-compatible endpoint).
* **ollama** — local. Prefers the native ``ChatOllama`` client, which returns
  first-class structured ``tool_calls`` for tool-capable models (Qwen, Llama 3.x),
  avoiding the plain-text tool-call leakage seen through the OpenAI-compatible /v1
  shim. Falls back to that shim when ``langchain-ollama`` is unavailable.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import TYPE_CHECKING, Any

import httpx
from langchain_openai import ChatOpenAI

if TYPE_CHECKING:
    from langchain_core.language_models import BaseChatModel

    from ..config import Settings

logger = logging.getLogger(__name__)


def _ollama_native_base_url(url: str) -> str:
    """Map the OpenAI-shim base URL to the native Ollama base URL.

    The shim lives at ``http://host:11434/v1``; the native ``/api`` client wants
    ``http://host:11434``. Strips a trailing ``/v1`` (and any trailing slash).
    """
    cleaned = url.rstrip("/")
    if cleaned.endswith("/v1"):
        cleaned = cleaned[:-3]
    return cleaned.rstrip("/")


class LLMProvider(ABC):
    """Strategy that builds a chat model for one configured provider."""

    name: str

    @abstractmethod
    def build(self, settings: Settings) -> BaseChatModel:
        """Return a configured ``BaseChatModel`` for this provider."""


class ClaudeProvider(LLMProvider):
    """Anthropic Claude via its OpenAI-compatible endpoint."""

    name = "claude"

    def build(self, settings: Settings) -> BaseChatModel:
        model_kwargs: dict[str, Any] = {}
        if settings.anthropic_reasoning_effort:
            model_kwargs["thinking"] = {"type": "enabled", "budget_tokens": 1024}
        return ChatOpenAI(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,  # type: ignore[arg-type]
            base_url=settings.anthropic_base_url,
            temperature=settings.llm_temperature,
            max_tokens=settings.response_max_tokens,  # type: ignore[call-arg]
            request_timeout=settings.anthropic_request_timeout_seconds,
            max_retries=settings.anthropic_max_retries,
            http_client=httpx.Client(timeout=settings.anthropic_request_timeout_seconds),
            model_kwargs=model_kwargs,
        )


class OpenAIProvider(LLMProvider):
    """OpenAI, natively."""

    name = "openai"

    def build(self, settings: Settings) -> BaseChatModel:
        model_kwargs: dict[str, Any] = {}
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
            model_kwargs=model_kwargs,
        )


class OllamaProvider(LLMProvider):
    """Local models served by Ollama.

    Uses the native ``ChatOllama`` client for real structured tool calling, with a
    graceful fallback to the OpenAI-compatible /v1 shim when ``langchain-ollama``
    is not installed.
    """

    name = "ollama"

    def build(self, settings: Settings) -> BaseChatModel:
        try:
            return self._build_native(settings)
        except ImportError:
            logger.warning(
                "langchain-ollama not installed; falling back to the OpenAI-compatible "
                "/v1 shim. Tool calls may leak into dialogue as plain text. Install "
                "langchain-ollama for native structured tool calling.",
            )
            return self._build_openai_shim(settings)

    def _build_native(self, settings: Settings) -> BaseChatModel:
        from langchain_ollama import ChatOllama

        kwargs: dict[str, Any] = {
            "model": settings.ollama_model,
            "base_url": _ollama_native_base_url(settings.ollama_base_url),
            "temperature": settings.llm_temperature,
            "num_predict": settings.response_max_tokens,
            "keep_alive": settings.ollama_keep_alive,
            "client_kwargs": {"timeout": settings.ollama_request_timeout_seconds},
        }
        # Many local models (e.g. Qwen3) emit a hidden reasoning block. "none"
        # disables thinking so the short token budget is spent on the answer;
        # "low"/"medium"/"high" re-enable it; "" leaves the model default.
        effort = settings.ollama_reasoning_effort
        if effort == "none":
            kwargs["reasoning"] = False
        elif effort:
            kwargs["reasoning"] = True
        return ChatOllama(**kwargs)

    def _build_openai_shim(self, settings: Settings) -> BaseChatModel:
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


PROVIDERS: dict[str, LLMProvider] = {
    provider.name: provider for provider in (ClaudeProvider(), OpenAIProvider(), OllamaProvider())
}


def get_llm(settings: Settings) -> BaseChatModel:
    """Build the chat model for the configured provider."""
    try:
        provider = PROVIDERS[settings.llm_provider]
    except KeyError:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}") from None
    return provider.build(settings)
