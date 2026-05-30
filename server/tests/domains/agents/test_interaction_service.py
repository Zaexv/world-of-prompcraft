from __future__ import annotations

import asyncio

import httpx
import pytest
from openai import APIConnectionError

from src.agents.application import (
    InteractionRequest,
    InteractionService,
    build_state_fingerprint,
)
from src.llm.concurrency import ainvoke_with_semaphore
from src.llm.errors import LLMProviderUnavailableError


class _FakeAgentPort:
    def __init__(self, result: dict):
        self.result = result
        self.calls = 0

    async def invoke(self, npc_id: str, player_id: str, prompt: str, player_state: dict) -> dict:
        self.calls += 1
        return self.result


class _MemoryCache:
    def __init__(self) -> None:
        self.data: dict[str, dict] = {}

    def get(self, key: str) -> dict | None:
        return self.data.get(key)

    def set(self, key: str, value: dict) -> None:
        self.data[key] = value


class _FailingRunnable:
    async def ainvoke(self, payload: object) -> object:
        raise APIConnectionError(
            request=httpx.Request("POST", "https://example.com/v1/chat/completions"),
            message="Connection error.",
        )


class _SlowRunnable:
    async def ainvoke(self, payload: object) -> object:
        await asyncio.sleep(0.05)
        return {"ok": True}


@pytest.mark.asyncio
async def test_interaction_service_caches_non_action_responses() -> None:
    agent = _FakeAgentPort({"dialogue": "hello", "actions": []})
    cache = _MemoryCache()
    service = InteractionService(agent_port=agent, cache_port=cache)

    request = InteractionRequest(
        npc_id="guard_1",
        player_id="player_1",
        prompt="hello",
        player_state={"hp": 100, "inventory": []},
        state_fingerprint="fp1",
    )

    first = await service.run(request)
    second = await service.run(request)

    assert first["dialogue"] == "hello"
    assert second["dialogue"] == "hello"
    assert agent.calls == 1


@pytest.mark.asyncio
async def test_interaction_service_does_not_cache_action_responses() -> None:
    agent = _FakeAgentPort({"dialogue": "take this", "actions": [{"kind": "give_item"}]})
    cache = _MemoryCache()
    service = InteractionService(agent_port=agent, cache_port=cache)

    request = InteractionRequest(
        npc_id="merchant_1",
        player_id="player_1",
        prompt="sell",
        player_state={"hp": 100, "inventory": ["coin"]},
        state_fingerprint="fp2",
    )

    await service.run(request)
    await service.run(request)

    assert agent.calls == 2


def test_build_state_fingerprint_changes_with_world_state() -> None:
    player_state = {
        "hp": 100,
        "level": 5,
        "inventory": ["Potion"],
        "active_quests": [{"id": "quest-1"}],
    }
    world_a = {
        "zone": "Village",
        "time_of_day": "day",
        "weather": "clear",
        "recent_events": ["met guard"],
        "npc_mood": "neutral",
    }
    world_b = {
        "zone": "Village",
        "time_of_day": "night",
        "weather": "clear",
        "recent_events": ["met guard"],
        "npc_mood": "neutral",
    }

    assert build_state_fingerprint(player_state, world_a) != build_state_fingerprint(
        player_state, world_b
    )


def test_build_state_fingerprint_changes_with_npc_state() -> None:
    player_state = {"hp": 100, "level": 5, "inventory": ["Potion"]}
    world_a = {
        "zone": "Village",
        "time_of_day": "day",
        "weather": "clear",
        "recent_events": ["met guard"],
        "npc_mood": "neutral",
    }
    world_b = {
        "zone": "Village",
        "time_of_day": "day",
        "weather": "clear",
        "recent_events": ["met guard"],
        "npc_mood": "angry",
    }

    assert build_state_fingerprint(player_state, world_a) != build_state_fingerprint(
        player_state, world_b
    )


@pytest.mark.asyncio
async def test_ainvoke_with_semaphore_wraps_provider_connection_errors() -> None:
    with pytest.raises(LLMProviderUnavailableError, match="LLM provider is unavailable"):
        await ainvoke_with_semaphore(_FailingRunnable(), payload={})


@pytest.mark.asyncio
async def test_ainvoke_with_semaphore_wraps_timeouts(monkeypatch: pytest.MonkeyPatch) -> None:
    from src.config import settings

    monkeypatch.setattr(settings, "llm_request_timeout_seconds", 0.01)
    with pytest.raises(LLMProviderUnavailableError, match="LLM request timed out"):
        await ainvoke_with_semaphore(_SlowRunnable(), payload={})
