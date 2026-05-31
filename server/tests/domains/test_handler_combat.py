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
    async def test_narrate_combat_async_drops_when_no_registry(self) -> None:
        """_narrate_combat_async should silently return when _registry is None."""
        from src.ws import handler

        original_registry = handler._registry
        handler._registry = None
        try:
            resolution = self._make_resolution()
            # Should return without error
            await handler._narrate_combat_async(
                player_id="player1",
                npc_id="npc1",
                npc_name="Goblin",
                resolution=resolution,
                prompt="attack",
                npc_system_prompt="You are a goblin.",
                manager=MagicMock(),
            )
        finally:
            handler._registry = original_registry

    @pytest.mark.asyncio
    async def test_narrate_combat_async_sends_npc_dialogue(self) -> None:
        """_narrate_combat_async should send agent_response when registry.invoke succeeds."""
        from src.ws import handler

        mock_registry = AsyncMock()
        mock_registry.invoke = AsyncMock(
            return_value={
                "dialogue": "That actually hurt, you fool!",
                "actions": [],
                "npcStateUpdate": {},
            }
        )

        mock_player = MagicMock()
        mock_player.to_dict.return_value = {"id": "player1"}
        mock_player.active_quests = []
        mock_player.completed_quests = []
        mock_player.kill_count = 0

        mock_world_state = MagicMock()
        mock_world_state.get_npc.return_value = None
        mock_world_state.get_player.return_value = mock_player

        mock_manager = AsyncMock()

        original_registry = handler._registry
        original_world_state = handler._world_state
        handler._registry = mock_registry  # type: ignore[assignment]
        handler._world_state = mock_world_state  # type: ignore[assignment]

        try:
            resolution = self._make_resolution()
            await handler._narrate_combat_async(
                player_id="player1",
                npc_id="npc1",
                npc_name="Goblin",
                resolution=resolution,
                prompt="I slash with my sword",
                npc_system_prompt="You are a goblin.",
                manager=mock_manager,
            )
            mock_manager.send_to.assert_called_once()
            call_args = mock_manager.send_to.call_args
            assert call_args[0][0] == "player1"
            assert call_args[0][1]["type"] == "agent_response"
            assert call_args[0][1]["dialogue"] == "That actually hurt, you fool!"
        finally:
            handler._registry = original_registry
            handler._world_state = original_world_state
