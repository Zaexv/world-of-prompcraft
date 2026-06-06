"""Tests for the LLM provider abstraction (server/src/llm/provider.py)."""

from __future__ import annotations

import pytest
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI

from src.config import Settings
from src.llm.provider import (
    PROVIDERS,
    OllamaProvider,
    _ollama_native_base_url,
    get_llm,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://localhost:11434/v1", "http://localhost:11434"),
        ("http://localhost:11434/v1/", "http://localhost:11434"),
        ("http://localhost:11434", "http://localhost:11434"),
        ("http://localhost:11434/", "http://localhost:11434"),
        ("http://host:11434/v1", "http://host:11434"),
    ],
)
def test_ollama_native_base_url(raw: str, expected: str) -> None:
    assert _ollama_native_base_url(raw) == expected


def test_registry_has_all_providers() -> None:
    assert set(PROVIDERS) == {"claude", "openai", "ollama"}


def test_get_llm_ollama_builds_native_chatollama() -> None:
    llm = get_llm(Settings(llm_provider="ollama"))
    assert isinstance(llm, ChatOllama)
    assert llm.base_url == "http://localhost:11434"


def test_get_llm_ollama_disables_reasoning_when_none() -> None:
    llm = get_llm(Settings(llm_provider="ollama", ollama_reasoning_effort="none"))
    assert isinstance(llm, ChatOllama)
    assert llm.reasoning is False


def test_get_llm_ollama_enables_reasoning_when_effort_set() -> None:
    llm = get_llm(Settings(llm_provider="ollama", ollama_reasoning_effort="medium"))
    assert isinstance(llm, ChatOllama)
    assert llm.reasoning is True


def test_get_llm_claude_builds_chatopenai() -> None:
    llm = get_llm(Settings(llm_provider="claude", anthropic_api_key="test-key"))
    assert isinstance(llm, ChatOpenAI)


def test_get_llm_openai_builds_chatopenai() -> None:
    llm = get_llm(Settings(llm_provider="openai", openai_api_key="test-key"))
    assert isinstance(llm, ChatOpenAI)


def test_get_llm_unknown_provider_raises() -> None:
    settings = Settings(llm_provider="ollama")
    object.__setattr__(settings, "llm_provider", "bogus")
    with pytest.raises(ValueError, match="Unknown LLM provider"):
        get_llm(settings)


def test_ollama_falls_back_to_shim_without_langchain_ollama(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When the native client import fails, fall back to the /v1 ChatOpenAI shim."""

    def _raise(self: OllamaProvider, settings: Settings) -> object:
        raise ImportError("langchain-ollama not installed")

    monkeypatch.setattr(OllamaProvider, "_build_native", _raise)
    llm = get_llm(Settings(llm_provider="ollama"))
    assert isinstance(llm, ChatOpenAI)
