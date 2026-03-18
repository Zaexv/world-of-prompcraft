"""Trade and item exchange tools for NPC agents."""

from __future__ import annotations

from langchain_core.tools import tool


def create_trade_tools(pending_actions: list, world_state: dict) -> list:
    """Create trade-related tools closed over shared state.

    Args:
        pending_actions: Mutable list that accumulates actions for the frontend.
        world_state: Mutable dict holding current world/player state.

    Returns:
        A list of LangChain tool objects.
    """

    @tool
    def offer_item(item_name: str, price: int = 0) -> str:
        """Offer an item to the player, either as a gift or for sale. Use when
        the NPC wants to give or sell something to the player.

        Args:
            item_name: The name of the item to offer.
            price: The price in gold. Use 0 for a free gift.
        """
        pending_actions.append(
            {
                "kind": "give_item",
                "params": {"item": item_name},
            }
        )
        if price > 0:
            return f"Offered {item_name} to player for {price} gold"
        return f"Offered {item_name} to player as a gift"

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
        return f"Took {item_name} from player"

    return [offer_item, take_item]
