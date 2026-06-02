"""Tests for combat delivery in the interaction handler.

Combat must feel instant: the player's hit is delivered immediately as an
`npc_actions` message, and the NPC fires back a deterministic, personality-based
reply right away — attacks skip the (slow) LLM entirely.
"""

from __future__ import annotations

from typing import Any

import pytest

from src.world.world_state import NPCData, WorldState
from src.ws import handler


class _FakeWebSocket:
    def __init__(self) -> None:
        self.sent: list[dict[str, Any]] = []

    async def send_json(self, data: dict[str, Any]) -> None:
        self.sent.append(data)


class _FakeManager:
    def __init__(self, player_id: str) -> None:
        self._player_id = player_id

    def get_player_id(self, _websocket: Any) -> str:
        return self._player_id

    async def broadcast_nearby(self, *_args: Any, **_kwargs: Any) -> None:
        return None


class _FakeRegistry:
    """Records whether the LLM was invoked; attacks should never reach it."""

    def __init__(self) -> None:
        self.invoked = False

    async def invoke(self, **_kwargs: Any) -> dict[str, Any]:
        self.invoked = True
        return {"dialogue": "LLM_REPLY", "actions": [], "npcStateUpdate": {}}


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


def _spawn_npc(world: WorldState, archetype: str, hp: int = 200) -> None:
    world.npcs["dragon_01"] = NPCData(
        npc_id="dragon_01",
        name="Ignathar",
        personality="boss",
        hp=hp,
        max_hp=hp,
        position=[0.0, 0.0, 0.0],
        mood="angry",
        archetype=archetype,
    )


async def _interact(
    prompt: str, registry: _FakeRegistry
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manager = _FakeManager("p1")
    handler.init_handler(registry, WorldState(), manager)  # type: ignore[arg-type]
    fake_ws = _FakeWebSocket()
    result = await handler._handle_interaction(
        {"npcId": "dragon_01", "playerId": "p1", "prompt": prompt},
        fake_ws,  # type: ignore[arg-type]
        manager,  # type: ignore[arg-type]
    )
    return result, fake_ws.sent


@pytest.mark.asyncio
async def test_attack_delivers_immediate_hit_then_instant_reply() -> None:
    world = WorldState()
    _spawn_npc(world, archetype="hostile_boss")
    world.get_player("p1")
    registry = _FakeRegistry()

    result, sent = await _interact("I attack the dragon with my sword!", registry)

    # 1. The player's hit is pushed immediately as a self-tagged npc_actions message.
    assert len(sent) == 1
    assert sent[0]["type"] == "npc_actions"
    assert sent[0]["self"] is True
    assert any(a["kind"] == "damage" for a in sent[0]["actions"])

    # 2. The reply is instant and deterministic — the LLM was never invoked.
    assert registry.invoked is False
    assert result["type"] == "agent_response"
    assert result["dialogue"] and result["dialogue"] != "LLM_REPLY"

    # 3. A hostile NPC counterattacks the player.
    counters = [
        a
        for a in result["actions"]
        if a["kind"] == "damage" and a["params"].get("target") == "player"
    ]
    assert len(counters) == 1
    assert counters[0]["params"]["amount"] > 0


@pytest.mark.asyncio
async def test_friendly_npc_does_not_counterattack() -> None:
    world = WorldState()
    _spawn_npc(world, archetype="friendly_merchant")
    world.get_player("p1")
    registry = _FakeRegistry()

    result, _sent = await _interact("I attack the merchant!", registry)

    assert registry.invoked is False
    assert result["dialogue"]  # pleads instead of fighting
    assert not any(a["kind"] == "damage" for a in result["actions"])


@pytest.mark.asyncio
async def test_non_attack_prompt_uses_llm_and_sends_no_immediate_message() -> None:
    world = WorldState()
    _spawn_npc(world, archetype="hostile_boss")
    world.get_player("p1")
    registry = _FakeRegistry()

    result, sent = await _interact("Hello there, friend.", registry)

    assert sent == []
    assert registry.invoked is True
    assert result["dialogue"] == "LLM_REPLY"
