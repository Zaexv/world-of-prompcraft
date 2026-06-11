"""Dungeon handling: ``dungeon_enter``/``dungeon_exit`` quest-objective
progression and exit loot collection."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from ...world import quest_progress

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..connection_manager import ConnectionManager
    from .context import HandlerContext

logger = logging.getLogger(__name__)


async def handle_dungeon_enter(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle a player entering a dungeon — advance enter_dungeon objectives."""
    world_state = ctx.world_state
    if world_state is None:
        return {"type": "quest_update", "actions": [], "playerStateUpdate": None}

    player_id = data.get("playerId", data.get("player_id", "default"))
    dungeon_id = data.get("dungeonId", data.get("dungeon_id", ""))
    async with world_state._lock:
        player = world_state.get_player(player_id)
        actions = quest_progress.on_event(player, {"type": "dungeon_entered", "target": dungeon_id})
        snapshot = player.to_dict()

    return {"type": "quest_update", "actions": actions, "playerStateUpdate": snapshot}


async def handle_dungeon_exit(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle a player exiting a dungeon — add loot and advance collect objectives."""
    world_state = ctx.world_state
    if world_state is None:
        return {"type": "quest_update", "actions": [], "playerStateUpdate": None}

    player_id = data.get("playerId", data.get("player_id", "default"))
    dungeon_id = data.get("dungeonId", data.get("dungeon_id", ""))
    loot: list[str] = data.get("loot", [])
    actions: list[dict[str, Any]] = []
    async with world_state._lock:
        player = world_state.get_player(player_id)
        # Add loot items, then fire one collect event per item.
        for item in loot:
            player.inventory.append(item)
            actions.extend(
                quest_progress.on_event(player, {"type": "item_collected", "target": item})
            )
        snapshot = player.to_dict()

    logger.info("Player %s exited dungeon %s with loot: %s", player_id, dungeon_id, loot)
    return {"type": "quest_update", "actions": actions, "playerStateUpdate": snapshot}
