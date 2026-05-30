"""AI integration tests for the formal interaction flow (ws -> service -> registry)."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from typing import Any

import pytest

from src.agents.registry import AgentRegistry
from src.llm.errors import LLMProviderUnavailableError
from src.world.world_state import WorldState
from src.ws import handler as ws_handler
from src.ws.connection_manager import ConnectionManager


class _DummyWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sent.append(data)

    async def accept(self) -> None:
        return None

    async def close(self, code: int = 1000, reason: str = "") -> None:
        return None


@dataclass(slots=True)
class _FormalFlowHarness:
    manager: ConnectionManager
    websocket: _DummyWebSocket
    world_state: WorldState
    registry: AgentRegistry
    npc_id: str
    player_id: str


async def _build_harness(mock_llm_openai: Any, player_id: str | None = None) -> _FormalFlowHarness:
    world_state = WorldState()
    world_state.refresh_npcs()
    registry = AgentRegistry(mock_llm_openai, world_state)
    manager = ConnectionManager()
    websocket = _DummyWebSocket()
    ws_handler.init_handler(registry, world_state, manager)
    resolved_player_id = player_id or f"integration_player_{uuid.uuid4().hex[:8]}"
    await manager.register(websocket, resolved_player_id)
    world_state.get_player(resolved_player_id)
    npc_id = next(iter(world_state.npcs.keys()))
    return _FormalFlowHarness(
        manager=manager,
        websocket=websocket,
        world_state=world_state,
        registry=registry,
        npc_id=npc_id,
        player_id=resolved_player_id,
    )


async def _send_interaction(
    harness: _FormalFlowHarness,
    prompt: str,
    *,
    hp: int = 100,
    inventory: list[str] | None = None,
) -> dict[str, Any]:
    payload = {
        "type": "interaction",
        "npcId": harness.npc_id,
        "prompt": prompt,
        "playerState": {
            "position": [0.0, 0.0, 0.0],
            "hp": hp,
            "inventory": inventory or [],
        },
    }
    response = await ws_handler.handle_message(payload, harness.websocket, harness.manager)
    assert response is not None
    return response


@pytest.mark.asyncio
async def test_formal_flow_all_core_use_cases_under_three_seconds(mock_llm_openai) -> None:
    harness = await _build_harness(mock_llm_openai)
    started = time.perf_counter()

    direct_cases = [
        ("attack now", "I strike back immediately.", "damage"),
        ("trade", "Here, take this potion.", "give_item"),
        ("defend", "I hold my guard.", "emote"),
        ("retreat now", "I am retreating!", "move_npc"),
    ]

    for prompt, expected_dialogue, expected_action in direct_cases:
        response = await _send_interaction(harness, prompt)
        assert response["type"] == "agent_response"
        assert response["dialogue"] == expected_dialogue
        assert response["dialogue"].strip() not in {"", "..."}
        assert any(action.get("kind") == expected_action for action in response["actions"])

    social = await _send_interaction(harness, "hello")
    assert social["dialogue"] == "*waves* Well met, traveler. What do you need?"
    assert social["dialogue"].strip() not in {"", "..."}

    story_prompt = "Tell me in detail what happened in this town over the last few weeks and why."
    first_story = await _send_interaction(harness, story_prompt)
    llm_calls_after_first_story = mock_llm_openai.call_count
    second_story = await _send_interaction(harness, story_prompt)

    assert first_story["type"] == "agent_response"
    assert second_story["type"] == "agent_response"
    assert first_story["dialogue"].strip() not in {"", "..."}
    assert second_story["dialogue"] == first_story["dialogue"]
    assert mock_llm_openai.call_count == llm_calls_after_first_story

    elapsed = time.perf_counter() - started
    assert elapsed < 3.0


@pytest.mark.asyncio
async def test_formal_flow_returns_fallback_dialogue_when_llm_unavailable(
    mock_llm_openai,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = await _build_harness(mock_llm_openai)
    npc_graph = harness.registry._agents[harness.npc_id]

    async def _raise_unavailable(*args: Any, **kwargs: Any) -> Any:
        raise LLMProviderUnavailableError("LLM provider is unavailable.")

    monkeypatch.setattr(npc_graph, "ainvoke", _raise_unavailable)
    response = await _send_interaction(
        harness,
        "Could you explain what has been happening around this village over recent days?",
    )

    assert response["type"] == "agent_response"
    assert response["dialogue"] == "The winds are strange today. Speak again in a moment."
    assert response["actions"] == []


@pytest.mark.asyncio
async def test_formal_flow_dead_player_still_gets_immediate_response(mock_llm_openai) -> None:
    harness = await _build_harness(mock_llm_openai)
    player = harness.world_state.get_player(harness.player_id)
    player.hp = 0

    response = await _send_interaction(harness, "attack now", hp=0)

    assert response["type"] == "agent_response"
    assert response["dialogue"] == "You are too weak to speak..."
    assert response["actions"] == []


@pytest.mark.asyncio
async def test_formal_flow_coerces_empty_dialogue_to_safe_fallback(
    mock_llm_openai,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    harness = await _build_harness(mock_llm_openai)
    npc_graph = harness.registry._agents[harness.npc_id]

    async def _return_empty(*args: Any, **kwargs: Any) -> dict[str, Any]:
        return {"response_text": "", "pending_actions": []}

    monkeypatch.setattr(npc_graph, "ainvoke", _return_empty)
    response = await _send_interaction(
        harness,
        "Please describe in detail the events that happened in this region this week.",
    )

    assert response["type"] == "agent_response"
    assert response["dialogue"] == "..."
    assert response["actions"] == []
