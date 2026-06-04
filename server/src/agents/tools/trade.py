"""Trade and item exchange tools for NPC agents."""

from __future__ import annotations

from typing import Any

from langchain_core.tools import tool

from ...world.items import resolve


def create_trade_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
    """Create trade-related tools closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    def _give_item_action(item_def: Any) -> dict[str, Any]:
        return {
            "kind": "give_item",
            "params": {
                "item": item_def.name,
                "description": item_def.description,
                "rarity": item_def.rarity,
                "icon": item_def.icon,
                "effects": dict(item_def.effects),
            },
        }

    @tool
    def offer_item(item_name: str, price: int = 0) -> str:
        """Offer an item to the player.

        - Gift (price == 0): the item is granted immediately.
        - Sale (price > 0): this only PROPOSES the sale. Tell the player the
          price and ask them to confirm. When they agree, call
          complete_purchase(item_name, price) to take their gold and hand over
          the item. Do NOT assume the sale happened until complete_purchase
          succeeds.

        Args:
            item_name: The name of the item to offer.
            price: The price in gold. Use 0 for a free gift.
        """
        item_def = resolve(item_name)

        if price > 0:
            # Propose only — no item granted, no gold moved yet.
            return (
                f"Proposing {item_def.name} for {price} gold. Awaiting player "
                f"confirmation — call complete_purchase('{item_def.name}', {price}) "
                f"once they agree to buy."
            )

        # Free gift — grant immediately.
        pending_actions.append(_give_item_action(item_def))
        # Keep server-side inventory in sync so use_item can find it later
        player = world_state.get("player", {})
        inv = player.get("inventory", [])
        inv.append(item_def.name)
        player["inventory"] = inv
        world_state["player"] = player
        return f"Offered {item_name} to player as a gift"

    @tool
    def complete_purchase(item_name: str, price: int) -> str:
        """Finalize a sale the player has agreed to. Authoritatively checks the
        player's gold, deducts the price, and grants the item. Call this ONLY
        after the player has confirmed they want to buy at the stated price.

        Args:
            item_name: The name of the item being sold.
            price: The agreed price in gold.
        """
        player = world_state.get("player", {})
        player_id = world_state.get("player_id", "")
        gold = int(player.get("gold", 0))

        if price <= 0:
            return "Use offer_item for free gifts, not complete_purchase."
        if gold < price:
            return (
                f"Player has only {gold} gold — not enough for {item_name} "
                f"({price} gold). Tell them they're short on coin; do NOT give the item."
            )

        item_def = resolve(item_name)
        action = _give_item_action(item_def)
        action["params"]["price"] = price
        action["params"]["player_id"] = player_id
        action["kind"] = "complete_purchase"
        pending_actions.append(action)

        # Keep snapshot in sync for any later tool calls this turn.
        player["gold"] = gold - price
        inv = player.get("inventory", [])
        inv.append(item_def.name)
        player["inventory"] = inv
        world_state["player"] = player

        return (
            f"Sold {item_def.name} to player for {price} gold. They have {gold - price} gold left."
        )

    @tool
    def take_item(item_name: str) -> str:
        """Take an item from the player. Use during trades or when collecting
        quest items.

        Args:
            item_name: The name of the item to take from the player.
        """
        pending_actions.append(
            {
                "kind": "take_item",
                "params": {"item": item_name},
            }
        )
        # Keep server-side inventory in sync
        player = world_state.get("player", {})
        inv = player.get("inventory", [])
        if item_name in inv:
            inv.remove(item_name)
        world_state["player"] = player

        return f"Took {item_name} from player"

    return [offer_item, complete_purchase, take_item]
