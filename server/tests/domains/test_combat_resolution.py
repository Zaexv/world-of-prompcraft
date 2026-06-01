from __future__ import annotations

import pytest

from src.combat.combat_resolution import (
    CombatResolution,
    is_attack_prompt,
    resolve_combat,
    score_attack,
)


class TestIsAttackPrompt:
    def test_basic_attack_keywords(self) -> None:
        for word in ["attack", "hit", "strike", "slash", "punch", "kill"]:
            assert is_attack_prompt(word)

    def test_non_attack_returns_false(self) -> None:
        assert not is_attack_prompt("hello how are you")
        assert not is_attack_prompt("I want to trade")
        assert not is_attack_prompt("")

    def test_mixed_sentence(self) -> None:
        assert is_attack_prompt("I want to attack the goblin with my sword")


class TestScoreAttack:
    def test_basic_attack_multiplier(self) -> None:
        quality, damage_type, effect_type = score_attack("attack", [], None)
        assert quality == pytest.approx(1.0)
        assert damage_type == "physical"
        assert effect_type == "sparkle"

    def test_weapon_equipped_bonus(self) -> None:
        q_no_weapon, _, _ = score_attack("attack", [], None)
        q_with_weapon, _, _ = score_attack("attack", [], {"weapon": "Iron Sword"})
        assert q_with_weapon > q_no_weapon

    def test_weapon_named_in_prompt_bonus(self) -> None:
        q_no_mention, _, _ = score_attack("attack", [], {"weapon": "Iron Sword"})
        q_mention, _, _ = score_attack("I slash with my Iron Sword", [], {"weapon": "Iron Sword"})
        assert q_mention > q_no_mention

    def test_magic_fire_damage_type(self) -> None:
        _, damage_type, effect_type = score_attack("I cast a fireball", [], None)
        assert damage_type == "fire"
        assert effect_type == "fire"

    def test_magic_ice_damage_type(self) -> None:
        _, damage_type, _ = score_attack("I freeze the enemy with ice", [], None)
        assert damage_type == "ice"

    def test_magic_lightning_damage_type(self) -> None:
        _, damage_type, _ = score_attack("I cast lightning bolt", [], None)
        assert damage_type == "lightning"

    def test_max_multiplier_capped(self) -> None:
        prompt = (
            "I humiliate and backstab with my sword executing a devastating "
            "spinning combo fury berserk finisher overhead uppercut"
        )
        quality, _, _ = score_attack(
            prompt,
            ["sword"],
            {"weapon": "sword", "shield": "shield", "trinket": "ring"},
        )
        assert quality <= 3.5

    def test_style_keywords_increase_multiplier(self) -> None:
        q_basic, _, _ = score_attack("attack", [], None)
        q_styled, _, _ = score_attack("devastating precise overhead combo attack", [], None)
        assert q_styled > q_basic

    def test_inventory_item_mention_bonus(self) -> None:
        q_no, _, _ = score_attack("I attack", ["Fire Wand"], None)
        q_yes, _, _ = score_attack("I attack with my Fire Wand", ["Fire Wand"], None)
        assert q_yes > q_no


class TestResolveCombat:
    def test_basic_attack_returns_combat_resolution(self) -> None:
        result = resolve_combat("attack", 1, [], None, npc_hp=100, npc_max_hp=100)
        assert isinstance(result, CombatResolution)
        assert result.final_damage >= 1
        assert result.outcome in {
            "glancing_hit",
            "clean_hit",
            "critical_hit",
            "devastating_hit",
            "defeated",
        }

    def test_weak_attack_gives_glancing(self) -> None:
        result = resolve_combat("attack", 1, [], None, npc_hp=100, npc_max_hp=100)
        assert result.outcome == "glancing_hit"
        assert not result.is_crit

    def test_strong_prompt_gives_critical(self) -> None:
        result = resolve_combat(
            "I cast a devastating fireball engulfing the enemy in flames",
            5,
            [],
            {"weapon": "Staff of Fire"},
            npc_hp=200,
            npc_max_hp=200,
        )
        assert result.is_crit
        assert result.outcome in {"critical_hit", "devastating_hit"}

    def test_killing_blow_sets_defeated(self) -> None:
        result = resolve_combat("attack", 1, [], None, npc_hp=1, npc_max_hp=100)
        assert result.outcome == "defeated"

    def test_minimum_damage_is_1(self) -> None:
        result = resolve_combat("attack", 1, [], None, npc_hp=100, npc_max_hp=100, npc_armor=999)
        assert result.final_damage == 1

    def test_gear_increases_damage(self) -> None:
        r_no_gear = resolve_combat("attack with sword", 1, [], None, npc_hp=200, npc_max_hp=200)
        r_with_gear = resolve_combat(
            "attack with sword",
            1,
            [],
            {"weapon": "Sword", "shield": "Shield", "trinket": "Ring"},
            npc_hp=200,
            npc_max_hp=200,
        )
        assert r_with_gear.final_damage > r_no_gear.final_damage

    def test_visual_tags_for_fire(self) -> None:
        result = resolve_combat("I cast fireball", 1, [], None, npc_hp=100, npc_max_hp=100)
        assert "fire" in result.visual_tags

    def test_devastating_has_explosion_tag(self) -> None:
        result = resolve_combat(
            "I execute a devastating berserk overhead combo fury spinning finisher attack",
            10,
            [],
            {"weapon": "Sword", "shield": "Shield", "trinket": "Ring"},
            npc_hp=1000,
            npc_max_hp=1000,
        )
        if result.outcome == "devastating_hit":
            assert "explosion" in result.visual_tags

    def test_defeated_has_explosion_tag(self) -> None:
        result = resolve_combat("attack", 1, [], None, npc_hp=1, npc_max_hp=100)
        assert "explosion" in result.visual_tags

    def test_combat_text_mentions_damage_type(self) -> None:
        result = resolve_combat("I cast ice bolt", 1, [], None, npc_hp=100, npc_max_hp=100)
        if result.damage_type == "ice":
            assert "ice" in result.combat_text.lower()

    def test_player_level_scales_base_damage(self) -> None:
        r_lvl1 = resolve_combat("attack with sword", 1, [], None, npc_hp=500, npc_max_hp=500)
        r_lvl10 = resolve_combat("attack with sword", 10, [], None, npc_hp=500, npc_max_hp=500)
        assert r_lvl10.final_damage > r_lvl1.final_damage
