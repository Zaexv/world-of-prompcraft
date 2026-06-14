"""NPC Designer handling: chat-driven NPC creation/editing.

A player describes an NPC; the Architect agent turns it into ``npc_create`` /
``npc_update`` actions, which this handler persists, registers as a live agent,
and broadcasts so every client spawns the new character.
"""

from __future__ import annotations

import asyncio
import logging
import uuid
from typing import TYPE_CHECKING, Any

from ...config import settings
from ...world.designed_npcs import save_designed_npc, update_designed_npc

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..connection_manager import ConnectionManager
    from .context import HandlerContext

logger = logging.getLogger(__name__)


async def handle_npc_design(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle an ``npc_design`` request — invoke the Architect agent."""
    if not settings.npc_designer_enabled:
        return {
            "type": "npc_design_response",
            "dialogue": "The Architect is sealed away here.",
            "npcs": [],
        }
    if ctx.npc_designer_agent is None or ctx.world_state is None or ctx.registry is None:
        return {
            "type": "npc_design_response",
            "dialogue": "The Architect is not yet awake...",
            "npcs": [],
        }

    prompt = data.get("prompt", "")
    position = data.get("position", [0.0, 0.0, 0.0])
    if not isinstance(position, list) or len(position) < 3:
        position = [0.0, 0.0, 0.0]
    archetype_hint = data.get("archetype")

    ctx.pending_npc_actions.clear()

    from langchain_core.messages import HumanMessage

    context: dict[str, Any] = {
        "spawn_position": f"{position[0]:.1f},{position[1]:.1f},{position[2]:.1f}"
    }
    if archetype_hint:
        context["preferred_archetype"] = archetype_hint

    input_state: dict[str, Any] = {
        "messages": [HumanMessage(content=prompt)],
        "npc_id": "architect",
        "npc_name": "The Architect",
        "npc_personality": "",
        "player_state": {},
        "world_context": context,
        "pending_actions": [],
        "response_text": "",
    }

    try:
        result = await asyncio.wait_for(ctx.npc_designer_agent.ainvoke(input_state), timeout=90.0)
        dialogue: str = result.get("response_text", "A new soul takes form...")
    except Exception:
        logger.exception("NPC Designer agent failed")
        return {
            "type": "npc_design_response",
            "dialogue": "The Architect's vision faltered...",
            "npcs": [],
        }

    spawned = await _apply_npc_actions(ctx, list(ctx.pending_npc_actions), position)
    return {"type": "npc_design_response", "dialogue": dialogue, "npcs": spawned}


async def _apply_npc_actions(
    ctx: HandlerContext, actions: list[dict[str, Any]], position: list[float]
) -> list[dict[str, Any]]:
    """Persist + register + collect broadcast payloads for npc_create/update actions."""
    if ctx.world_state is None or ctx.registry is None:
        return []
    spawned: list[dict[str, Any]] = []

    for action in actions:
        kind = action.get("kind")
        params = action.get("params", {})

        if kind == "npc_create":
            npc_id = f"des_{uuid.uuid4().hex[:8]}"
            record = {
                "npc_id": npc_id,
                "name": params["name"],
                "archetype": params["archetype"],
                "flavor_prompt": params.get("flavor_prompt", ""),
                "initial_hp": params.get("hp") or 0,
                "position": list(position),
            }
            await asyncio.to_thread(save_designed_npc, record)
            npc = ctx.world_state.upsert_designed_npc(record)
            ctx.registry.register_dynamic_npc(npc)
            spawned.append(npc.to_dict())
            logger.info("Designer created NPC %s (%s)", npc_id, npc.name)

        elif kind == "npc_update":
            npc_id = params.get("npc_id", "")
            field = params.get("field", "")
            value = params.get("value", "")
            store_field = "flavor_prompt" if field == "flavor_prompt" else field
            ok = await asyncio.to_thread(update_designed_npc, npc_id, {store_field: value})
            if not ok:
                continue
            # Re-derive the live NPC from the updated record, re-register its agent.
            from ...world.designed_npcs import load_designed_npcs

            rec = load_designed_npcs().get(npc_id)
            if rec is None:
                continue
            npc = ctx.world_state.upsert_designed_npc(rec)
            # Tools are bound at agent-build time, so an archetype change needs a
            # rebuild. Drop the old agent and recreate it with the new tool set.
            ctx.registry.remove_agent(npc_id)
            ctx.registry.register_dynamic_npc(npc)
            spawned.append(npc.to_dict())
            logger.info("Designer updated NPC %s", npc_id)

    if spawned and ctx.manager is not None:
        await ctx.manager.broadcast({"type": "npc_spawn", "npcs": spawned})
    return spawned
