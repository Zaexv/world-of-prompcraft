"""World-building handling: LLM-driven ``world_modify`` requests, manual
``world_direct_edit`` palette edits, and ``world_manifest_update`` persistence —
all sharing one persist-and-broadcast path for world objects."""

from __future__ import annotations

import asyncio
import logging
from typing import TYPE_CHECKING, Any

from ...agents.tools.world_builder import KNOWN_MESH_TYPES

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ...agents.agent_state import NPCAgentState as _NPCAgentState
    from ..connection_manager import ConnectionManager
    from .context import HandlerContext

logger = logging.getLogger(__name__)


async def handle_world_modify(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle a world_modify request — invoke the WorldBuilder agent."""
    if ctx.world_builder_agent is None:
        return {
            "type": "world_modify_response",
            "dialogue": "The World Spirit is not yet awakened...",
            "actions": [],
        }

    prompt = data.get("prompt", "")
    position: list[float] = data.get("position", [0.0, 0.0, 0.0])
    if not isinstance(position, list) or len(position) < 3:
        position = [0.0, 0.0, 0.0]

    ctx.pending_world_actions.clear()

    from langchain_core.messages import HumanMessage as _HumanMessage

    nearby = data.get("nearbyObjects", [])
    nearby_str = ""
    if nearby:
        nearby_str = "\nNearby objects you can modify or remove:\n" + "\n".join(
            [
                f"- {obj['label']} (type: {obj['type']}, id: {obj['id']}) at position {obj['position']}"
                for obj in nearby
            ]
        )

    context: dict[str, Any] = {
        "player_position": f"x={float(position[0]):.1f}, z={float(position[2]):.1f}",
        "nearby_objects": nearby_str,
    }
    if KNOWN_MESH_TYPES:
        context["available_types"] = ", ".join(sorted(KNOWN_MESH_TYPES))

    input_state: _NPCAgentState = {
        "messages": [_HumanMessage(content=prompt)],
        "npc_id": "world_spirit",
        "npc_name": "World Spirit",
        "npc_personality": "",
        "player_state": {},
        "world_context": context,
        "pending_actions": [],
        "response_text": "",
        "conversation_summary": "",
        "mood": "neutral",
        "relationship_score": 0,
        "personality_notes": "",
    }

    try:
        # Generous: a cold Ollama start reloads a multi-GB model before the
        # first token; 30s made the first build after idle fail as "dormant".
        result = await asyncio.wait_for(
            ctx.world_builder_agent.ainvoke(input_state),
            timeout=90.0,
        )
        actions = list(ctx.pending_world_actions)
        dialogue: str = result.get("response_text", "The world reshapes itself...")
    except Exception:
        logger.exception("WorldBuilder agent failed")
        actions = []
        dialogue = "The world spirit is dormant..."

    # Persist + share the new objects so every player sees them and they survive
    # restarts. The requester gets them via this response; everyone else via the
    # broadcast below.
    await _persist_and_broadcast_world_actions(
        ctx, actions, exclude=manager_player_id(ctx, websocket)
    )

    return {
        "type": "world_modify_response",
        "dialogue": dialogue,
        "actions": actions,
    }


def manager_player_id(ctx: HandlerContext, websocket: WebSocket) -> str | None:
    """Helper: resolve the player id for a websocket, tolerating a missing manager."""
    if ctx.manager is None:
        return None
    return ctx.manager.get_player_id(websocket)


async def _persist_and_broadcast_world_actions(
    ctx: HandlerContext, actions: list[dict[str, Any]], exclude: str | None
) -> None:
    """Apply world_spawn/world_remove actions to the store, persist, and broadcast."""
    if not actions:
        return
    world_actions = [a for a in actions if a.get("kind") in ("world_spawn", "world_remove")]
    if not world_actions:
        return
    if ctx.world_state is not None:
        for action in world_actions:
            ctx.world_state.apply_world_action(action)
        if ctx.store is not None:
            import asyncio

            await asyncio.to_thread(
                ctx.store.save_world_objects, ctx.world_state.world_objects_map()
            )
    if ctx.manager is not None:
        await ctx.manager.broadcast(
            {"type": "world_objects_update", "actions": world_actions},
            exclude=exclude,
        )


async def handle_world_direct_edit(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any] | None:
    """Handle a manual (non-LLM) world edit from the UI: palette spawn or delete.

    Persists to the shared store and broadcasts to all players (including the
    sender — spawnObject is idempotent by id, so a single broadcast path keeps
    every client consistent).
    """
    action_name = data.get("action")
    params = data.get("params")
    if action_name not in ("spawn", "remove") or not isinstance(params, dict):
        return {"type": "error", "message": "Invalid world_direct_edit"}

    kind = "world_spawn" if action_name == "spawn" else "world_remove"
    action = {"kind": kind, "params": params}
    await _persist_and_broadcast_world_actions(ctx, [action], exclude=None)
    return None


async def handle_world_manifest_update(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Save the updated world manifest to disk."""
    import json
    import os

    manifest_data = data.get("data")
    if not manifest_data:
        return {"type": "error", "message": "No manifest data provided"}

    # Path to shared world manifest
    # Try multiple common locations relative to the server script
    # world_builder.py is in server/src/ws/handlers/, so we need to go up 5
    # levels to reach root
    base_dir = os.path.dirname(
        os.path.dirname(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        )
    )
    manifest_path = os.path.join(base_dir, "shared", "data", "world_manifest.json")

    try:
        with open(manifest_path, "w") as f:
            json.dump(manifest_data, f, indent=2)
        logger.info("World manifest updated successfully at %s", manifest_path)

        # Broadcast the update to all connected players (optional)
        if ctx.manager:
            await ctx.manager.broadcast({"type": "world_manifest_refreshed"})

        return {"type": "ack", "status": "ok"}
    except Exception as e:
        logger.exception("Failed to save world manifest")
        return {"type": "error", "message": f"Failed to save manifest: {e!s}"}
