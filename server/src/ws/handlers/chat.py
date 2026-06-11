"""Chat handling: proximity ``chat_broadcast`` for player messages and
fire-and-forget NPC reactions to overheard chat."""

from __future__ import annotations

import asyncio
import logging
import random
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..connection_manager import ConnectionManager
    from .context import HandlerContext

logger = logging.getLogger(__name__)


async def handle_chat_message(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any] | None:
    """Handle a chat message from a player — broadcast to nearby players."""
    world_state = ctx.world_state

    player_id = manager.get_player_id(websocket)
    if player_id is None:
        return {"type": "error", "message": "Not registered"}

    text = data.get("text", "").strip()
    if not text:
        return None

    if world_state is None:
        return None

    # Store in world state chat history
    world_state.add_chat_message(player_id, text)

    # Get player position for proximity
    player = world_state.get_player(player_id)

    # BUG-9: Match chat radius to position radius (200 units) so visible players can chat
    await manager.broadcast_nearby(
        {
            "type": "chat_broadcast",
            "sender": player_id,
            "text": text,
            "position": list(player.position),
        },
        origin=player.position,
        radius=200.0,
        world_state=world_state,
        exclude=player_id,
    )

    # Trigger nearby NPCs to react to the chat (fire-and-forget)
    if ctx.registry is not None:
        nearby_npcs = world_state.get_nearby_npcs(player.position, 50.0)
        for npc in nearby_npcs:
            task = asyncio.create_task(
                _npc_react_to_chat(ctx, npc, player_id, text, player, manager)
            )
            ctx.background_tasks.add(task)
            task.add_done_callback(ctx.background_tasks.discard)

    return None


async def _npc_react_to_chat(
    ctx: HandlerContext,
    npc: Any,
    player_id: str,
    text: str,
    player: Any,
    manager: ConnectionManager,
) -> None:
    """Have an NPC react to a nearby chat message — lightweight, no tools/actions."""
    if ctx.registry is None or ctx.world_state is None:
        return

    # 40% chance to react — NPCs shouldn't respond to every message
    if random.random() > 0.4:
        return

    # Use a direct lightweight LLM call instead of the full agent pipeline
    from langchain_core.messages import HumanMessage, SystemMessage

    llm = ctx.registry._llm
    prompt = (
        f"You are {npc.name}, an NPC in a fantasy world.\n"
        f"Personality: {npc.personality[:200]}\n\n"
        f"A player named '{player_id}' said nearby: \"{text}\"\n\n"
        "Respond with a SHORT reaction (1 sentence max, 15 words max). "
        "Stay in character. If the message isn't relevant to you, respond with just '...' and nothing else."
    )
    # Respect the global LLM call cap — chat reactions are lower-priority than interactions
    if ctx.agent_semaphore.locked():
        return  # drop silently when server is saturated; chat reactions are best-effort
    try:
        async with ctx.agent_semaphore:
            result = await asyncio.wait_for(
                llm.ainvoke([SystemMessage(content=prompt), HumanMessage(content=text)]),
                timeout=8.0,
            )
    except Exception:
        return

    raw_content = result.content if hasattr(result, "content") else ""
    dialogue = raw_content.strip() if isinstance(raw_content, str) else ""
    if not dialogue or dialogue == "..." or len(dialogue) < 2:
        return

    # Broadcast NPC dialogue to nearby players
    npc_msg = {
        "type": "npc_dialogue",
        "npcId": npc.npc_id,
        "npcName": npc.name,
        "speakerPlayer": player_id,
        "dialogue": dialogue,
        "position": list(npc.position),
    }
    await manager.broadcast_nearby(
        npc_msg,
        origin=npc.position,
        radius=100.0,
        world_state=ctx.world_state,
    )
