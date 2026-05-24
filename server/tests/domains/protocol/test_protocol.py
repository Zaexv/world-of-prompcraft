"""Tests for WebSocket protocol models."""

from __future__ import annotations

from src.ws.protocol import Action, AgentResponse, PlayerInteraction, PlayerMove


def test_player_interaction_alias() -> None:
    data = {
        "type": "interaction",
        "npcId": "dragon_01",
        "prompt": "Hello dragon!",
        "playerId": "p1",
        "playerState": {"hp": 100},
    }
    msg = PlayerInteraction(**data)
    assert msg.npc_id == "dragon_01"
    assert msg.player_id == "p1"
    assert msg.prompt == "Hello dragon!"


def test_player_interaction_defaults() -> None:
    msg = PlayerInteraction(npcId="npc_1", prompt="hi")
    assert msg.player_id == "default"
    assert msg.player_state == {}


def test_player_move() -> None:
    msg = PlayerMove(playerId="p1", position=[1.0, 2.0, 3.0])
    assert msg.player_id == "p1"
    assert msg.position == [1.0, 2.0, 3.0]


def test_agent_response_serialization() -> None:
    resp = AgentResponse(
        npcId="dragon_01",
        dialogue="You dare approach me?!",
        actions=[Action(kind="damage", params={"target": "player", "amount": 25})],
        playerStateUpdate={"hp": 75},
        npcStateUpdate={"hp": 480, "maxHp": 500},
    )
    d = resp.model_dump(by_alias=True)
    assert d["npcId"] == "dragon_01"
    assert d["dialogue"] == "You dare approach me?!"
    assert len(d["actions"]) == 1
    assert d["playerStateUpdate"]["hp"] == 75
    assert d["npcStateUpdate"]["hp"] == 480
