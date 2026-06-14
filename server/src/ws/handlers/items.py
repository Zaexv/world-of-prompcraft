"""Item handling: ``use_item`` effect resolution and ``equip_item`` server-side
equipment tracking (plus its disconnect cleanup)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..connection_manager import ConnectionManager
    from .context import HandlerContext

logger = logging.getLogger(__name__)


def cleanup_player_equipment(ctx: HandlerContext, player_id: str) -> None:
    """Remove a player's equipment data on disconnect (Bug 16)."""
    ctx.player_equipment.pop(player_id, None)


async def handle_use_item(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle item usage from the player's inventory."""
    world_state = ctx.world_state
    if world_state is None:
        return {"type": "use_item_result", "success": False, "message": "World not ready"}

    player_id = data.get("playerId", "default")
    item_name = data.get("item", "")

    player = world_state.get_player(player_id)

    # Sync inventory from client (server's copy may be stale because
    # NPC offer_item tools don't update server-side player inventory).
    client_inventory = data.get("inventory")
    if client_inventory is not None:
        player.inventory = list(client_inventory)

    # Check if item exists in inventory
    if item_name not in player.inventory:
        return {"type": "use_item_result", "success": False, "message": "Item not found"}

    # Remove from inventory
    player.inventory.remove(item_name)

    # Resolve the item's structured effects and apply them deterministically.
    from ...world.items import resolve

    item_def = resolve(item_name)
    actions: list[dict[str, Any]] = []
    parts: list[str] = []

    heal_hp = item_def.effects.get("heal_hp", 0)
    restore_mana = item_def.effects.get("restore_mana", 0)
    max_hp_bonus = item_def.effects.get("max_hp", 0)
    level_bonus = item_def.effects.get("level", 0)

    if max_hp_bonus:
        player.max_hp += max_hp_bonus
        parts.append(f"Max HP +{max_hp_bonus}")
    if level_bonus:
        player.level = min(player.level + level_bonus, 10)
        parts.append(f"Level {player.level}")
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "sparkle", "color": "#ffaa44", "count": 20},
            }
        )
    if heal_hp:
        player.hp = min(player.max_hp, player.hp + heal_hp)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_hp}})
        parts.append(f"+{heal_hp} HP")
    if restore_mana:
        player.mana = min(player.max_mana, player.mana + restore_mana)
        parts.append(f"+{restore_mana} Mana")
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "sparkle", "color": "#aa44ff", "count": 20},
            }
        )

    if parts:
        message = f"Used {item_def.name}: " + ", ".join(parts)
    else:
        # No structured effect — small fallback heal so every item does something.
        fallback = 10
        player.hp = min(player.max_hp, player.hp + fallback)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": fallback}})
        message = f"Used {item_def.name}. +{fallback} HP"

    # Send updated state. The client will use actions as source of truth
    # for HP (ReactionSystem skips merge for fields touched by actions).
    return {
        "type": "use_item_result",
        "success": True,
        "item": item_name,
        "message": message,
        "actions": actions,
        "playerStateUpdate": player.to_dict(),
    }


async def handle_equip_item(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle equipment changes from the client."""
    player_id = data.get("playerId", "default")
    item_name = data.get("item", "")
    slot = data.get("slot", "")
    equipped = data.get("equipped", {})

    # Runtime cache for combat reads...
    ctx.player_equipment[player_id] = equipped
    # ...and the persisted single source of truth on the player itself, so gear
    # survives disconnect/restart.
    if ctx.world_state is not None:
        ctx.world_state.get_player(player_id).equipped = dict(equipped)

    logger.info("Player %s equipped %s in %s slot", player_id, item_name, slot)
    return {"type": "ack", "status": "ok"}
