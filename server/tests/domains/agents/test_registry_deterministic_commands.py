"""Tests for deterministic direct-command fast path in AgentRegistry."""

from __future__ import annotations

import pytest

from src.agents.registry import AgentRegistry
from src.world.world_state import WorldState


def _pick_npc_id(world_state: WorldState) -> str:
    if not world_state.npcs:
        world_state.refresh_npcs()
    return next(iter(world_state.npcs.keys()))


@pytest.mark.asyncio
async def test_attack_command_bypasses_llm_and_applies_damage(mock_llm_openai) -> None:
    world_state = WorldState()
    npc_id = _pick_npc_id(world_state)
    player_id = "fast_attack_player"
    player = world_state.get_player(player_id)
    player.hp = 100

    registry = AgentRegistry(mock_llm_openai, world_state)
    result = await registry.invoke(npc_id, player_id, "attack now", player.to_dict())

    assert mock_llm_openai.call_count == 0
    assert result["dialogue"] == "I strike back immediately."
    assert any(action["kind"] == "damage" for action in result["actions"])
    assert world_state.get_player(player_id).hp == 85


@pytest.mark.asyncio
async def test_defend_command_bypasses_llm_and_returns_emote(mock_llm_openai) -> None:
    world_state = WorldState()
    npc_id = _pick_npc_id(world_state)
    player_id = "fast_defend_player"
    player = world_state.get_player(player_id)

    registry = AgentRegistry(mock_llm_openai, world_state)
    result = await registry.invoke(npc_id, player_id, "defend", player.to_dict())

    assert mock_llm_openai.call_count == 0
    assert result["dialogue"] == "I hold my guard."
    assert any(action["kind"] == "emote" for action in result["actions"])


@pytest.mark.asyncio
async def test_trade_command_bypasses_llm_and_gives_item(mock_llm_openai) -> None:
    world_state = WorldState()
    npc_id = _pick_npc_id(world_state)
    player_id = "fast_trade_player"
    player = world_state.get_player(player_id)

    registry = AgentRegistry(mock_llm_openai, world_state)
    result = await registry.invoke(npc_id, player_id, "trade", player.to_dict())

    assert mock_llm_openai.call_count == 0
    assert result["dialogue"] == "Here, take this potion."
    assert any(action["kind"] == "give_item" for action in result["actions"])
    assert "Health Potion" in world_state.get_player(player_id).inventory


@pytest.mark.asyncio
async def test_flee_command_bypasses_llm_and_moves_npc(mock_llm_openai) -> None:
    world_state = WorldState()
    npc_id = _pick_npc_id(world_state)
    player_id = "fast_flee_player"
    player = world_state.get_player(player_id)

    registry = AgentRegistry(mock_llm_openai, world_state)
    result = await registry.invoke(npc_id, player_id, "retreat now", player.to_dict())

    assert mock_llm_openai.call_count == 0
    assert result["dialogue"] == "I am retreating!"
    assert any(action["kind"] == "move_npc" for action in result["actions"])


@pytest.mark.asyncio
async def test_non_direct_prompt_still_uses_agent_reasoning(mock_llm_openai) -> None:
    world_state = WorldState()
    npc_id = _pick_npc_id(world_state)
    player_id = "slow_path_player"
    player = world_state.get_player(player_id)

    registry = AgentRegistry(mock_llm_openai, world_state)
    await registry.invoke(
        npc_id,
        player_id,
        "Tell me in detail what happened in this town over the last few weeks and why.",
        player.to_dict(),
    )

    assert mock_llm_openai.call_count > 0
