"""Tests for combat delivery in the interaction handler.

Combat must feel instant: the player's hit is delivered immediately as an
`npc_actions` message, and the agent's dialogue follows in the final
`agent_response` — without re-applying the player's damage.
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
    """Stand-in agent registry whose dialogue carries no damage action."""

    async def invoke(self, **_kwargs: Any) -> dict[str, Any]:
        return {
            "dialogue": "You dare strike me?!",
            "actions": [{"kind": "emote", "params": {"animation": "threaten"}}],
            "npcStateUpdate": {},
        }


@pytest.fixture(autouse=True)
def _reset_world_state() -> Any:
    WorldState._instance = None
    yield
    WorldState._instance = None


@pytest.mark.asyncio
async def test_attack_delivers_immediate_hit_then_dialogue() -> None:
    world = WorldState()
    world.npcs["dragon_01"] = NPCData(
        npc_id="dragon_01",
        name="Ignathar",
        personality="boss",
        hp=200,
        max_hp=200,
        position=[0.0, 0.0, 0.0],
        mood="angry",
    )
    world.get_player("p1")  # auto-creates a live player

    manager = _FakeManager("p1")
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]

    fake_ws = _FakeWebSocket()
    result = await handler._handle_interaction(
        {"npcId": "dragon_01", "playerId": "p1", "prompt": "I attack the dragon with my sword!"},
        fake_ws,  # type: ignore[arg-type]
        manager,  # type: ignore[arg-type]
    )

    # The hit is pushed immediately as an npc_actions message (no dialogue),
    # so the client resolves combat without waiting for the LLM.
    assert len(fake_ws.sent) == 1
    immediate = fake_ws.sent[0]
    assert immediate["type"] == "npc_actions"
    assert any(a["kind"] == "damage" for a in immediate["actions"])

    # The agent's answer arrives in the final response and does NOT repeat the
    # player's damage (already applied + delivered).
    assert result["type"] == "agent_response"
    assert result["dialogue"] == "You dare strike me?!"
    assert not any(
        a["kind"] == "damage" and a.get("params", {}).get("target") == "dragon_01"
        for a in result["actions"]
    )


@pytest.mark.asyncio
async def test_non_attack_prompt_sends_no_immediate_message() -> None:
    world = WorldState()
    world.npcs["dragon_01"] = NPCData(
        npc_id="dragon_01",
        name="Ignathar",
        personality="boss",
        hp=200,
        max_hp=200,
        position=[0.0, 0.0, 0.0],
        mood="neutral",
    )
    world.get_player("p1")

    manager = _FakeManager("p1")
    handler.init_handler(_FakeRegistry(), world, manager)  # type: ignore[arg-type]

    fake_ws = _FakeWebSocket()
    result = await handler._handle_interaction(
        {"npcId": "dragon_01", "playerId": "p1", "prompt": "Hello there, friend."},
        fake_ws,  # type: ignore[arg-type]
        manager,  # type: ignore[arg-type]
    )

    # No attack → no immediate hit; only the normal agent_response is returned.
    assert fake_ws.sent == []
    assert result["type"] == "agent_response"
