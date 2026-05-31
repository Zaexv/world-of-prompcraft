"""Tests for the fast combat path in handler.py."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from src.combat.combat_resolution import CombatResolution


class TestFastCombatPath:
    """Verify that attack prompts use the fast path (no LLM wait)."""

    def _make_resolution(self, outcome: str = "clean_hit", damage: int = 25) -> CombatResolution:
        return CombatResolution(
            prompt_quality=1.5,
            base_damage=17,
            final_damage=damage,
            damage_type="physical",
            outcome=outcome,
            combat_text=f"Clean hit! {damage} physical damage.",
            visual_tags=["sparkle"],
            is_crit=False,
        )

    def test_is_attack_prompt_detection(self) -> None:
        from src.combat.combat_resolution import is_attack_prompt

        assert is_attack_prompt("I attack the goblin")
        assert is_attack_prompt("slash with my sword")
        assert not is_attack_prompt("hello how are you")
        assert not is_attack_prompt("I want to trade")

    def test_combat_resolution_used_in_damage_action(self) -> None:
        """resolve_combat output must map to the damage action params."""
        from src.combat.combat_resolution import resolve_combat

        resolution = resolve_combat(
            prompt="I slash the goblin with my sword",
            player_level=1,
            player_inventory=[],
            player_equipped=None,
            npc_hp=100,
            npc_max_hp=100,
        )
        # Build action as handler does
        action: dict = {
            "kind": "damage",
            "params": {
                "target": "goblin_1",
                "amount": resolution.final_damage,
                "damageType": resolution.damage_type,
                "outcome": resolution.outcome,
                "isCrit": resolution.is_crit,
                "combatText": resolution.combat_text,
            },
        }
        assert action["kind"] == "damage"
        assert action["params"]["amount"] == resolution.final_damage
        assert action["params"]["outcome"] in {
            "glancing_hit",
            "clean_hit",
            "critical_hit",
            "devastating_hit",
            "defeated",
        }

    def test_crit_visual_tags_present(self) -> None:
        from src.combat.combat_resolution import resolve_combat

        # Crafted prompt with enough keywords to score as critical
        resolution = resolve_combat(
            prompt="I execute a devastating berserk combo fury finisher attack with my weapon",
            player_level=5,
            player_inventory=[],
            player_equipped={"weapon": "Sword", "shield": "Shield"},
            npc_hp=200,
            npc_max_hp=200,
        )
        if resolution.is_crit:
            assert len(resolution.visual_tags) > 0

    def test_defeated_outcome_includes_explosion(self) -> None:
        from src.combat.combat_resolution import resolve_combat

        # 1 HP NPC will definitely die
        resolution = resolve_combat(
            prompt="attack",
            player_level=1,
            player_inventory=[],
            player_equipped=None,
            npc_hp=1,
            npc_max_hp=100,
        )
        assert resolution.outcome == "defeated"
        assert "explosion" in resolution.visual_tags

    @pytest.mark.asyncio
    async def test_fast_combat_reaction_drops_when_no_registry(self) -> None:
        """_fast_combat_reaction should silently return when _registry is None."""
        from src.ws import handler

        original_registry = handler._registry
        handler._registry = None
        try:
            resolution = self._make_resolution()
            await handler._fast_combat_reaction(
                player_id="player1",
                npc_id="npc1",
                npc_name="Goblin",
                npc_personality="You are a goblin.",
                resolution=resolution,
                prompt="attack",
                manager=MagicMock(),
            )
        finally:
            handler._registry = original_registry

    @pytest.mark.asyncio
    async def test_fast_combat_reaction_sends_agent_response(self) -> None:
        """_fast_combat_reaction sends agent_response with dialogue and counter-attack."""
        from src.ws import handler

        mock_llm = AsyncMock()
        mock_llm_response = MagicMock()
        mock_llm_response.content = "You dare strike me?! Feel my wrath!"
        mock_llm.ainvoke = AsyncMock(return_value=mock_llm_response)

        mock_registry = MagicMock()
        mock_registry._llm = mock_llm

        mock_npc = MagicMock()
        mock_npc.hp = 80
        mock_npc.max_hp = 100
        mock_npc.position = [0.0, 0.0, 0.0]

        mock_player = MagicMock()
        mock_player.to_dict.return_value = {"id": "player1", "hp": 90}

        mock_world_state = MagicMock()
        mock_world_state.get_npc.return_value = mock_npc
        mock_world_state.get_player.return_value = mock_player
        mock_world_state.apply_actions = AsyncMock()

        mock_manager = AsyncMock()

        original_registry = handler._registry
        original_world_state = handler._world_state
        handler._registry = mock_registry  # type: ignore[assignment]
        handler._world_state = mock_world_state  # type: ignore[assignment]

        try:
            resolution = self._make_resolution()
            await handler._fast_combat_reaction(
                player_id="player1",
                npc_id="npc1",
                npc_name="Goblin",
                npc_personality="You are a goblin.",
                resolution=resolution,
                prompt="I slash with my sword",
                manager=mock_manager,
            )
            mock_manager.send_to.assert_called_once()
            call_args = mock_manager.send_to.call_args
            assert call_args[0][0] == "player1"
            payload = call_args[0][1]
            assert payload["type"] == "agent_response"
            assert payload["dialogue"] == "You dare strike me?! Feel my wrath!"
            # Counter-attack action should be included
            assert any(a["kind"] == "damage" for a in payload["actions"])
        finally:
            handler._registry = original_registry
            handler._world_state = original_world_state

    @pytest.mark.asyncio
    async def test_update_combat_memory_silently_handles_failure(self) -> None:
        """_update_combat_memory_async should not raise even when registry fails."""
        from src.ws import handler

        mock_registry = AsyncMock()
        mock_registry.invoke = AsyncMock(side_effect=Exception("LLM unavailable"))

        mock_player = MagicMock()
        mock_player.to_dict.return_value = {"id": "player1"}
        mock_player.active_quests = []
        mock_player.completed_quests = []
        mock_player.kill_count = 0

        mock_world_state = MagicMock()
        mock_world_state.get_player.return_value = mock_player

        original_registry = handler._registry
        original_world_state = handler._world_state
        handler._registry = mock_registry  # type: ignore[assignment]
        handler._world_state = mock_world_state  # type: ignore[assignment]

        try:
            resolution = self._make_resolution()
            # Must not raise
            await handler._update_combat_memory_async(
                player_id="player1",
                npc_id="npc1",
                resolution=resolution,
                prompt="I slash with my sword",
            )
        finally:
            handler._registry = original_registry
            handler._world_state = original_world_state
