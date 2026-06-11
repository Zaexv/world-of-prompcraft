"""Quest handling: ``quest_update`` events routed through the quest-progress
service (typed events or the legacy direct objective advance)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from ...world import quest_progress

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..connection_manager import ConnectionManager
    from .context import HandlerContext


async def handle_quest_update(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle a generic typed game event routed through the quest-progress service.

    Accepts either an explicit ``event`` ({"type": ..., "target": ...}) or the
    legacy ``{questId, objectiveId}`` advance shape.
    """
    world_state = ctx.world_state
    if world_state is None:
        return {"type": "quest_update", "actions": [], "playerStateUpdate": None}

    player_id = data.get("playerId", data.get("player_id", "default"))
    async with world_state._lock:
        player = world_state.get_player(player_id)
        event = data.get("event")
        if isinstance(event, dict) and event.get("type"):
            actions = quest_progress.on_event(player, event)
        else:
            # Legacy direct objective advance.
            quest_id = data.get("questId", data.get("quest_id", ""))
            objective_id = data.get("objectiveId", data.get("objective_id", ""))
            actions = []
            if quest_id and objective_id:
                player.advance_objective(quest_id, objective_id)
                actions.append(
                    {
                        "kind": "advance_objective",
                        "params": {"questId": quest_id, "objectiveId": objective_id},
                    }
                )
                if player.all_objectives_complete(quest_id):
                    actions.extend(quest_progress.complete_and_reward(player, quest_id))
        snapshot = player.to_dict()

    return {"type": "quest_update", "actions": actions, "playerStateUpdate": snapshot}
