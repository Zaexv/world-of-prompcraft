"""Movement handling: ``player_move`` position sync with ``world_update``
broadcasts, and ``explore_area`` dynamic NPC agent registration."""

from __future__ import annotations

import logging
import random
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..connection_manager import ConnectionManager
    from .context import HandlerContext

logger = logging.getLogger(__name__)


async def handle_player_move(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any] | None:
    """Handle a player position update — sync state and broadcast to neighbours."""
    world_state = ctx.world_state

    # BUG-2: Always use server-side WebSocket registration as authoritative player ID
    player_id = manager.get_player_id(websocket)
    if not player_id:
        return {"type": "error", "message": "Player not registered"}

    position = data.get("position", [0.0, 0.0, 0.0])
    yaw = data.get("yaw", 0.0)

    # Bug 20: Clamp position coordinates to a reasonable range
    pos_limit = 5000.0
    if isinstance(position, list) and len(position) >= 3:
        position = [
            max(-pos_limit, min(pos_limit, position[0])),
            max(-pos_limit, min(pos_limit, position[1])),
            max(-pos_limit, min(pos_limit, position[2])),
        ]
    else:
        position = [0.0, 0.0, 0.0]

    try:
        if world_state is not None:
            await world_state.update_player(player_id, {"position": position, "yaw": yaw})

            # Broadcast nearby player positions as a list
            nearby = world_state.get_nearby_players(position, 200.0)
            nearby.pop(player_id, None)
            if nearby:
                nearby_list = list(nearby.values())
                # BUG-11: Also send world_update back to the moving player
                # so they discover nearby stationary players
                await manager.send_to(
                    player_id,
                    {"type": "world_update", "players": nearby_list},
                )
                # Build broadcast list that includes the moving player so
                # other clients can see them move.
                moving_player = world_state.get_player(player_id)
                broadcast_list = [moving_player.to_public_dict(), *nearby_list]
                await manager.broadcast_nearby(
                    {
                        "type": "world_update",
                        "players": broadcast_list,
                    },
                    origin=position,
                    radius=200.0,
                    world_state=world_state,
                    exclude=player_id,
                )
    except Exception:
        logger.exception("Failed to update player position for %s", player_id)

    return None


async def handle_explore_area(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle area exploration — create dynamic NPC agents for generated NPCs."""
    npcs = data.get("npcs", [])
    for npc_data in npcs:
        npc_id = npc_data.get("id", "")
        name = npc_data.get("name", "Unknown")
        behavior = npc_data.get("behavior", "friendly")

        # Create NPC in world state
        if ctx.world_state and npc_id not in ctx.world_state.npcs:
            from ...world.world_state import NPCData

            personality = _get_generated_personality(name, behavior)
            npc = NPCData(
                npc_id=npc_id,
                name=name,
                personality=personality,
                hp=60 if behavior == "hostile" else 80,
                max_hp=60 if behavior == "hostile" else 80,
                position=npc_data.get("position", [0, 0, 0]),
            )
            ctx.world_state.npcs[npc_id] = npc

            # Register agent
            if ctx.registry:
                ctx.registry.register_dynamic_npc(npc)

    return {"type": "ack", "status": "ok"}


def _get_generated_personality(name: str, behavior: str) -> str:
    """Return a system prompt personality for a dynamically generated NPC."""
    if behavior == "hostile":
        damage_range = random.choice([(8, 15), (12, 20), (15, 25)])
        damage_type = random.choice(["physical", "fire", "ice", "dark"])
        effect = random.choice(["fire", "ice", "smoke", "lightning"])
        return (
            f"You are {name}, a dangerous creature lurking in Teldrassil.\n"
            f"BEHAVIOR: You are aggressive and attack on sight.\n"
            f"TOOL RULES:\n"
            f"- If the player is attacking you (prompt starts with [COMBAT:]), ALWAYS call deal_damage targeting 'player' with {damage_range[0]}-{damage_range[1]} {damage_type} damage.\n"
            f"- If the player greets or talks peacefully, WARN them menacingly but do NOT deal damage yet.\n"
            f"- Only deal_damage after the player has attacked first (prompt contains [COMBAT:]).\n"
            f"- Use spawn_effect('{effect}') when attacking.\n"
            f"- Use emote('threaten') before your first attack.\n"
            f"- Keep dialogue to 1-2 sentences of growling, snarling, or hissing.\n"
            f"- If your HP drops below 30%, use flee() to escape.\n"
            f"- NEVER negotiate. ALWAYS fight."
        )
    elif behavior == "neutral":
        quest_type = random.choice(
            [
                ("Gather Moonpetals", "Collect 3 moonpetal flowers from the glade nearby"),
                ("Hunt the Corruption", "Destroy the corrupted treant east of here"),
                ("Deliver the Message", "Take this scroll to the sentinel at the crossroads"),
                ("Find the Lost Artifact", "A sacred moonstone was lost in the barrow den"),
            ]
        )
        return (
            f"You are {name}, a Night Elf patrolling Teldrassil.\n"
            f"PERSONALITY: Serious, dutiful, knowledgeable about Night Elf culture.\n"
            f"TOOL RULES:\n"
            f"- Use emote('bow') when greeting.\n"
            f"- You have a quest to offer: give_quest('{quest_type[0]}', '{quest_type[1]}').\n"
            f"- Use spawn_effect('sparkle') when discussing magical topics.\n"
            f"- If the player asks for directions, describe nearby landmarks.\n"
            f"- Share lore about Night Elves, Elune, and Teldrassil.\n"
            f"- If attacked, defend yourself with deal_damage(15-25, 'physical')."
        )
    else:
        item = random.choice(
            [
                "Health Potion",
                "Mana Elixir",
                "Lucky Charm",
                "Moonpetal Flower",
                "Starlight Dust",
                "Ancient Rune",
            ]
        )
        trait = random.choice(
            [
                "cheerful and tells bad jokes",
                "mysterious and speaks in riddles",
                "nervous and jumpy, always looking over their shoulder",
                "very old and wise, speaks slowly",
                "enthusiastic about everything, uses lots of exclamation marks",
            ]
        )
        return (
            f"You are {name}, a friendly wanderer in Teldrassil.\n"
            f"PERSONALITY: You are {trait}.\n"
            f"TOOL RULES:\n"
            f"- Use emote('wave') when greeting.\n"
            f"- You carry a {item} -- use offer_item('{item}') if the player is kind.\n"
            f"- If the player asks for help, give useful tips about the area.\n"
            f"- Use spawn_effect('sparkle') when showing something magical.\n"
            f"- If attacked, use emote('cry') and plead for peace. Don't fight.\n"
            f"- ALWAYS remind the player that it's dangerous out in the wild."
        )
