"""Tests for combat tool functions."""

from __future__ import annotations

from src.agents.tools.combat import create_combat_tools


def test_deal_damage_appends_action() -> None:
    actions: list = []
    world: dict = {"player": {"hp": 100}}
    tools = create_combat_tools(actions, world)
    deal_damage = tools[0]  # deal_damage is first

    result = deal_damage.invoke({"target": "player", "amount": 25, "damage_type": "fire"})

    assert len(actions) == 1
    assert actions[0]["kind"] == "damage"
    assert actions[0]["params"]["amount"] == 25
    assert actions[0]["params"]["damageType"] == "fire"
    assert world["player"]["hp"] == 75
    assert "25" in result


def test_deal_damage_floors_at_zero() -> None:
    actions: list = []
    world: dict = {"player": {"hp": 10}}
    tools = create_combat_tools(actions, world)
    deal_damage = tools[0]

    deal_damage.invoke({"target": "player", "amount": 50})
    assert world["player"]["hp"] == 0


def test_heal_target() -> None:
    actions: list = []
    world: dict = {"player": {"hp": 50, "max_hp": 100}}
    tools = create_combat_tools(actions, world)
    heal_target = tools[3]  # heal_target is last

    result = heal_target.invoke({"target": "player", "amount": 30})

    assert len(actions) == 1
    assert actions[0]["kind"] == "heal"
    assert actions[0]["params"]["amount"] == 30
    assert world["player"]["hp"] == 80
    assert "30" in result


def test_heal_target_caps_at_max() -> None:
    actions: list = []
    world: dict = {"player": {"hp": 90, "max_hp": 100}}
    tools = create_combat_tools(actions, world)
    heal_target = tools[3]

    heal_target.invoke({"target": "player", "amount": 50})
    assert world["player"]["hp"] == 100


def test_defend() -> None:
    actions: list = []
    world: dict = {}
    tools = create_combat_tools(actions, world)
    defend = tools[1]

    result = defend.invoke({"stance": "parry"})
    assert len(actions) == 1
    assert actions[0]["kind"] == "emote"
    assert "parry" in result


def test_flee() -> None:
    actions: list = []
    world: dict = {}
    tools = create_combat_tools(actions, world)
    flee = tools[2]

    result = flee.invoke({"direction": "north"})
    assert len(actions) == 1
    assert actions[0]["kind"] == "move_npc"
    assert actions[0]["params"]["direction"] == "north"
    assert "north" in result
