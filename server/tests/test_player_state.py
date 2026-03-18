"""Tests for PlayerData."""

from __future__ import annotations

from src.world.player_state import PlayerData


def test_player_defaults() -> None:
    p = PlayerData()
    assert p.hp == 100
    assert p.max_hp == 100
    assert p.mana == 50
    assert p.level == 1
    assert p.inventory == []
    assert p.position == [0.0, 0.0, 0.0]


def test_player_to_dict() -> None:
    p = PlayerData(hp=80, inventory=["Sword"])
    d = p.to_dict()
    assert d["hp"] == 80
    assert d["maxHp"] == 100
    assert d["inventory"] == ["Sword"]
    assert "maxMana" in d


def test_player_inventory_is_independent() -> None:
    """Each PlayerData should get its own inventory list."""
    p1 = PlayerData()
    p2 = PlayerData()
    p1.inventory.append("Potion")
    assert p2.inventory == []
