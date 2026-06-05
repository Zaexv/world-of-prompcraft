"""Tests for the gold economy: offer_item proposal flow + complete_purchase."""

from __future__ import annotations

from typing import Any

from src.agents.tools.trade import create_trade_tools


def _tools(world: dict[str, Any]) -> dict[str, Any]:
    pending: list[Any] = []
    tools = {t.name: t for t in create_trade_tools(pending, world)}
    return {"pending": pending, **tools}


def test_offer_item_gift_grants_immediately() -> None:
    world: dict[str, Any] = {"player": {"gold": 0, "inventory": []}, "player_id": "alice"}
    t = _tools(world)
    msg = t["offer_item"].invoke({"item_name": "Bread", "price": 0})
    assert "gift" in msg.lower()
    assert t["pending"][0]["kind"] == "give_item"


def test_offer_item_sale_only_proposes() -> None:
    world: dict[str, Any] = {"player": {"gold": 100, "inventory": []}, "player_id": "alice"}
    t = _tools(world)
    msg = t["offer_item"].invoke({"item_name": "Espeto de Sardinas", "price": 15})
    assert "proposing" in msg.lower()
    # No action emitted and no gold moved on a mere proposal.
    assert t["pending"] == []
    assert world["player"]["gold"] == 100


def test_complete_purchase_success_deducts_gold_and_grants_item() -> None:
    world: dict[str, Any] = {"player": {"gold": 100, "inventory": []}, "player_id": "alice"}
    t = _tools(world)
    msg = t["complete_purchase"].invoke({"item_name": "Espeto de Sardinas", "price": 15})
    assert "sold" in msg.lower()
    action = t["pending"][0]
    assert action["kind"] == "complete_purchase"
    assert action["params"]["price"] == 15
    assert action["params"]["player_id"] == "alice"
    # Snapshot kept in sync for subsequent tool calls this turn.
    assert world["player"]["gold"] == 85


def test_complete_purchase_insufficient_gold_rejected() -> None:
    world: dict[str, Any] = {"player": {"gold": 5, "inventory": []}, "player_id": "alice"}
    t = _tools(world)
    msg = t["complete_purchase"].invoke({"item_name": "Plato de Jamón Ibérico", "price": 40})
    assert "gold" in msg.lower()
    # No action emitted, gold untouched.
    assert t["pending"] == []
    assert world["player"]["gold"] == 5


def test_buy_item_from_player_pays_value_and_emits_sell_item() -> None:
    world: dict[str, Any] = {
        "player": {"gold": 0, "inventory": [{"name": "Health Potion", "quantity": 1}]},
        "player_id": "alice",
    }
    t = _tools(world)
    msg = t["buy_item_from_player"].invoke({"item_name": "Health Potion"})
    assert "bought" in msg.lower()
    action = t["pending"][0]
    assert action["kind"] == "sell_item"
    assert action["params"]["item"] == "Health Potion"
    assert action["params"]["price"] == 5  # common rarity default
    assert action["params"]["player_id"] == "alice"
    assert world["player"]["gold"] == 5


def test_buy_item_from_player_rejects_unowned_item() -> None:
    world: dict[str, Any] = {"player": {"gold": 0, "inventory": []}, "player_id": "alice"}
    t = _tools(world)
    msg = t["buy_item_from_player"].invoke({"item_name": "Dragon Scale"})
    assert "does not have" in msg.lower()
    assert t["pending"] == []
    assert world["player"]["gold"] == 0
