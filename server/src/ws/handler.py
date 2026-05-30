from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

from langchain_core.messages import HumanMessage as _HumanMessage

from ..agents.application import (
    InteractionRequest,
    InteractionService,
    build_state_fingerprint,
)
from ..agents.infrastructure import HybridInteractionCache
from ..config import settings
from ..llm.errors import LLMProviderUnavailableError

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..agents.agent_state import NPCAgentState as _NPCAgentState
    from ..agents.registry import AgentRegistry
    from ..world.world_state import NPCData, WorldState
    from .connection_manager import ConnectionManager

    pass

logger = logging.getLogger(__name__)

_registry: AgentRegistry | None = None
_world_state: WorldState | None = None
_manager: ConnectionManager | None = None
_world_builder_agent: Any | None = None
_pending_world_actions: list[Any] | None = None
_interaction_service: InteractionService | None = None
_npc_sync_state: dict[str, tuple[frozenset[str], float]] = {}

# We sync inventory and hp so the server can score attacks properly
# and use_item can find items the player received from NPCs.
_ALLOWED_PLAYER_FIELDS = {"position", "hp", "inventory"}


def _build_world_update_payload(
    players: list[dict[str, Any]],
    npcs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"type": "world_update", "players": players}
    if npcs is not None:
        payload["npcs"] = npcs
    return payload


def _should_send_npc_snapshot(player_id: str, nearby_npcs: list[NPCData]) -> bool:
    """Throttle NPC snapshots per player to reduce world-update payload churn."""
    now = time.monotonic()
    current_ids = frozenset(npc.npc_id for npc in nearby_npcs)
    previous = _npc_sync_state.get(player_id)
    if previous is None:
        _npc_sync_state[player_id] = (current_ids, now)
        return True

    last_ids, last_sent_at = previous
    interval = max(0.0, float(settings.npc_sync_interval_seconds))
    if current_ids != last_ids or (now - last_sent_at) >= interval:
        _npc_sync_state[player_id] = (current_ids, now)
        return True
    return False


def _npc_snapshot_limit() -> int:
    return max(1, int(settings.npc_snapshot_max_count))


def _npc_join_radius() -> float:
    return max(1.0, float(settings.npc_join_snapshot_radius))


def _npc_world_update_radius() -> float:
    return max(1.0, float(settings.npc_world_update_radius))


def _extract_message_text(data: dict[str, Any]) -> str:
    for key in ("text", "prompt", "message", "content"):
        value = data.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _auto_register_procedural_npc(
    npc_id: str, name: str, personality_key: str, position: list[float]
) -> None:
    """Register a procedurally spawned NPC in the world state and agent registry on first contact."""
    if _world_state is None or _registry is None:
        return

    from ..agents.personalities.templates import NPC_PERSONALITIES
    from ..world.world_state import NPCData

    personality = NPC_PERSONALITIES.get(personality_key, {})
    system_prompt = personality.get(
        "system_prompt",
        f"You are {name}, a creature encountered in the wild. You are hostile and territorial.",
    )
    hp = 80

    npc = NPCData(
        npc_id=npc_id,
        name=name,
        personality=system_prompt,
        hp=hp,
        max_hp=hp,
        position=position,
    )
    _world_state.register_npc(
        npc,
        personality_key=personality_key or npc_id,
        archetype="procedural",
    )
    _registry.register_dynamic_npc(npc)
    logger.info(
        "Auto-registered procedural NPC %s (%s) with key '%s' at %s",
        npc_id,
        name,
        personality_key,
        position,
    )


def init_handler(
    registry: AgentRegistry,
    world_state: WorldState,
    manager: ConnectionManager,
    world_builder_agent: Any | None = None,
    pending_world_actions: list[Any] | None = None,
) -> None:
    """Wire the handler to the live registry, world state, and connection manager."""
    global \
        _registry, \
        _world_state, \
        _manager, \
        _world_builder_agent, \
        _pending_world_actions, \
        _interaction_service
    _registry = registry
    _world_state = world_state
    _manager = manager
    _world_builder_agent = world_builder_agent
    _pending_world_actions = pending_world_actions
    _interaction_service = InteractionService(
        agent_port=registry,
        cache_port=HybridInteractionCache(),
    )


async def handle_message(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    """Route WebSocket messages to their specific handlers."""
    msg_type = data.get("type")

    if msg_type == "join":
        return await _handle_join(data, websocket, manager)
    elif msg_type == "chat_message":
        return await _handle_chat_message(data, websocket, manager)
    elif msg_type == "interaction":
        return await _handle_player_interaction(data, websocket, manager)
    elif msg_type == "player_move":
        return await _handle_player_move(data, websocket, manager)
    elif msg_type == "use_item":
        return await _handle_use_item(data, websocket, manager)
    elif msg_type == "equip_item":
        return await _handle_equip_item(data, websocket, manager)
    elif msg_type == "explore_area":
        return await _handle_explore_area(data)
    elif msg_type == "dungeon_enter":
        return await _handle_dungeon_enter(data, manager)
    elif msg_type == "dungeon_exit":
        return await _handle_dungeon_exit(data, manager)
    elif msg_type == "quest_update":
        return await _handle_quest_update(data, manager)
    elif msg_type == "ping":
        return {"type": "pong"}
    elif msg_type == "world_modify":
        return await _handle_world_modify(data, websocket, manager)

    return {"type": "error", "message": f"Unknown message type: {msg_type}"}


async def _handle_join(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any]:
    """Handle a player joining the game."""
    username = (data.get("username") or "").strip()
    race = data.get("race", "human")
    faction = data.get("faction", "alliance")
    skin = data.get("skin", "skin-1")

    logger.info(f"Player joining: {username} ({race}, {faction})")

    if not username:
        return {"type": "error", "message": "Username is required"}

    # Register with connection manager
    await manager.register(websocket, username)

    requested_position = data.get("position")

    # Create player in world state
    if _world_state is not None:
        _world_state.refresh_npcs()
        reaped = _world_state.reap_procedural_npcs()
        if _registry:
            _registry.refresh_agents()
        if reaped > 0:
            logger.info("Reaped %d stale procedural NPCs before join for %s", reaped, username)
        player = _world_state.get_player(username)
        if (
            requested_position
            and isinstance(requested_position, list)
            and len(requested_position) >= 3
        ):
            initial_position = [
                float(requested_position[0]),
                float(requested_position[1]),
                float(requested_position[2]),
            ]
        else:
            # Keep persisted position for returning players.
            initial_position = list(player.position)
        player.username = username
        player.race = race
        player.faction = faction
        player.skin = skin
        player.position = initial_position
        await _world_state.persist_player(username)
        logger.info(f"Player state initialized: {username}")

    # Build list of current players (excluding the joining player)
    current_players: list[dict[str, Any]] = []
    if _world_state is not None:
        for pid, p in _world_state.players.items():
            if pid != username and pid in manager.active_connections:
                current_players.append(p.to_public_dict())

    # Build NPC list (Filtered by proximity for performance)
    current_npcs: list[dict[str, Any]] = []
    if _world_state is not None:
        nearby_npcs = _world_state.get_nearby_npcs(
            initial_position,
            _npc_join_radius(),
            limit=_npc_snapshot_limit(),
        )
        for npc in nearby_npcs:
            current_npcs.append(npc.to_dict())

    # Broadcast player_joined to everyone else
    if _world_state is not None:
        player = _world_state.get_player(username)
        await manager.broadcast(
            {
                "type": "player_joined",
                "player": player.to_public_dict(),
            },
            exclude=username,
        )

    total_npcs = len(_world_state.npcs) if _world_state else 0
    logger.info(
        f"Join successful: {username}. Sending join_ok with {len(current_npcs)} nearby NPCs (of {total_npcs} total)."
    )
    return {
        "type": "join_ok",
        "playerId": username,
        "players": current_players,
        "npcs": current_npcs,
    }


async def _handle_chat_message(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    """Handle a standard chat message — broadcasts to everyone."""
    player_id = manager.get_player_id(websocket)
    if player_id is None:
        return {"type": "error", "message": "Not registered"}

    text = _extract_message_text(data)
    if not text:
        return None

    if _world_state is None:
        return None

    # Update world state chat history
    _world_state.add_chat_message(player_id, text)
    await _world_state.flush_dirty_state()

    # Broadcast to all players
    await manager.broadcast(
        {"type": "chat_broadcast", "sender": player_id, "text": text},
    )

    return None


async def _handle_player_interaction(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any]:
    """Handle an AI interaction — player talking to or acting on an NPC."""
    player_id = manager.get_player_id(websocket)
    npc_id = data.get("npcId")
    text = _extract_message_text(data)
    npc_name = data.get("npcName", "Unknown")
    personality_key = data.get("personalityKey", "")
    player_state_raw = data.get("playerState", {})

    if not player_id or not npc_id:
        return {"type": "error", "message": "Player and NPC IDs are required"}

    # Register procedural NPCs on first interaction.
    # These are spawned client-side and the server has no prior record of them.
    if (
        _world_state
        and _world_state.get_npc(npc_id) is None
        and npc_id.startswith(("proc_", "enc_"))
    ):
        # Prefer the NPC's real position so it isn't registered on top of the
        # player (which made freshly-streamed procedural NPCs cluster at the
        # player right after an interaction).
        pos = data.get("npcPosition") or player_state_raw.get("position", [0.0, 0.0, 0.0])
        _auto_register_procedural_npc(npc_id, npc_name, personality_key, pos)

    # Bug 36: Dead players cannot interact
    if _world_state:
        player = _world_state.get_player(player_id)
        if player.hp <= 0:
            return {
                "type": "agent_response",
                "npcId": npc_id,
                "dialogue": "You are too weak to speak...",
                "actions": [],
            }

    # Bug 6: Update player state under the world state lock
    if player_state_raw and _world_state:
        updates = {
            key: player_state_raw[key] for key in _ALLOWED_PLAYER_FIELDS if key in player_state_raw
        }
        await _world_state.update_player(player_id, updates)

    logger.info(f"Interaction: {player_id} -> {npc_id}: '{text}'")

    if not _registry:
        return {"type": "error", "message": "Agent registry not initialized"}

    if _world_state is None:
        return {"type": "error", "message": "World state not initialized"}
    if _interaction_service is None:
        return {"type": "error", "message": "Interaction service not initialized"}

    player_snapshot = _world_state.get_player(player_id).to_dict()
    world_context = _world_state.get_context_for_npc(npc_id, player_id)
    state_fingerprint = build_state_fingerprint(player_snapshot, world_context)
    request = InteractionRequest(
        npc_id=npc_id,
        player_id=player_id,
        prompt=text,
        player_state=player_snapshot,
        state_fingerprint=state_fingerprint,
    )

    # Invoke agent logic through application service
    try:
        response = await _interaction_service.run(request)

        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": response.get("dialogue") or "...",
            "actions": response.get("actions", []),
        }
    except Exception as e:
        logger.error(f"Agent invocation failed: {e}", exc_info=True)
        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": "I am lost in thought right now...",
            "actions": [],
        }


async def _handle_player_move(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    # BUG-2: Always use server-side WebSocket registration as authoritative player ID
    player_id = manager.get_player_id(websocket)
    if not player_id:
        return {"type": "error", "message": "Player not registered"}

    position = data.get("position", [0.0, 0.0, 0.0])
    yaw = data.get("yaw", 0.0)

    if _world_state is not None:
        # Update state (HP/Inventory update ignored here for safety, move only)
        # We explicitly only update position/yaw in the move handler
        await _world_state.update_player(player_id, {"position": position, "yaw": yaw})

        # Broadcast nearby player positions as a list
        nearby = _world_state.get_nearby_players(position, 200.0)
        nearby.pop(player_id, None)

        nearby_npcs = _world_state.get_nearby_npcs(
            position,
            _npc_world_update_radius(),
            limit=_npc_snapshot_limit(),
        )
        include_npcs = _should_send_npc_snapshot(player_id, nearby_npcs)
        npc_list = [n.to_dict() for n in nearby_npcs] if include_npcs else None
        nearby_list = list(nearby.values())

        # Send a targeted update to the moving player.
        # NPC snapshots are throttled to avoid high-frequency payload churn.
        if nearby_list or npc_list is not None:
            await manager.send_to(
                player_id,
                _build_world_update_payload(nearby_list, npc_list),
            )

        # Broadcast movement to nearby players.
        # Do not include NPC snapshots here; each player receives their own
        # throttled NPC sync as they move.
        if nearby_list:
            moving_player = _world_state.get_player(player_id)
            broadcast_list = [moving_player.to_public_dict(), *nearby_list]
            await manager.broadcast_nearby(
                _build_world_update_payload(broadcast_list),
                origin=position,
                radius=200.0,
                world_state=_world_state,
                exclude=player_id,
            )

    return None


async def _handle_use_item(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    player_id = manager.get_player_id(websocket)
    item_name = data.get("item")
    inventory = data.get("inventory")

    if not player_id or not item_name:
        return None

    logger.info(f"Item use: {player_id} uses '{item_name}'")

    if _world_state is not None:
        # Update inventory before use
        if inventory is not None:
            await _world_state.update_player(player_id, {"inventory": inventory})

        # Apply effect
        action = {"kind": "use_item", "player_id": player_id, "item": item_name}
        await _world_state.apply_actions([action])

        # Notify the player of their new state
        player = _world_state.get_player(player_id)
        return {
            "type": "player_state_update",
            "hp": player.hp,
            "maxHp": player.max_hp,
            "inventory": player.inventory,
        }

    return None


_player_equipment: dict[str, dict[str, str | None]] = {}


async def _handle_equip_item(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    player_id = manager.get_player_id(websocket)
    item_name = data.get("item")
    slot = data.get("slot")
    equipped_raw = data.get("equipped", {})

    if not player_id or not slot:
        return None

    # Track equipment server-side for world-builder context
    if player_id not in _player_equipment:
        _player_equipment[player_id] = {}
    _player_equipment[player_id][slot] = item_name

    logger.info(f"Equip: {player_id} equips '{item_name}' in {slot}")

    # Broadcast visual update to everyone
    await manager.broadcast(
        {
            "type": "player_visual_update",
            "playerId": player_id,
            "equipped": equipped_raw,
        },
        exclude=player_id,
    )
    return None


def cleanup_player_equipment(player_id: str) -> None:
    """Remove equipment tracking when player disconnects."""
    _player_equipment.pop(player_id, None)


async def _handle_explore_area(data: dict[str, Any]) -> dict[str, Any]:
    """Handle area exploration — create dynamic NPC agents for generated NPCs."""
    npcs = data.get("npcs", [])
    for npc_data in npcs:
        npc_id = npc_data.get("id", "")
        name = npc_data.get("name", "Unknown")
        behavior = npc_data.get("behavior", "friendly")

        # Create NPC in world state
        if _world_state and npc_id not in _world_state.npcs:
            personality = _get_generated_personality(name, behavior)
            from ..world.world_state import NPCData

            npc = NPCData(
                npc_id=npc_id,
                name=name,
                personality=personality,
                hp=60 if behavior == "hostile" else 80,
                max_hp=60 if behavior == "hostile" else 80,
                position=npc_data.get("position", [0, 0, 0]),
            )
            _world_state.npcs[npc_id] = npc

            # Register agent
            if _registry:
                _registry.register_dynamic_npc(npc)

    return {"type": "ack", "status": "ok"}


def _get_generated_personality(name: str, behavior: str) -> str:
    """Generate a simple personality string for procedurally created NPCs."""
    if behavior == "hostile":
        return f"You are {name}, a hostile creature. You attack intruders on sight and speak in short, aggressive growls."
    return f"You are {name}, a peaceful wanderer. You are friendly to travelers and enjoy sharing stories of the road."


async def _handle_dungeon_enter(data: dict[str, Any], manager: ConnectionManager) -> dict[str, Any]:
    player_id = data.get("playerId")
    dungeon_id = data.get("dungeonId")
    logger.info(f"Dungeon Enter: {player_id} enters {dungeon_id}")
    return {"type": "ack"}


async def _handle_dungeon_exit(data: dict[str, Any], manager: ConnectionManager) -> dict[str, Any]:
    player_id = data.get("playerId")
    logger.info(f"Dungeon Exit: {player_id}")
    return {"type": "ack"}


async def _handle_quest_update(data: dict[str, Any], manager: ConnectionManager) -> dict[str, Any]:
    # Placeholder for future quest sync
    return {"type": "ack"}


_player_locks: dict[str, asyncio.Lock] = {}


def cleanup_player_locks(player_id: str) -> None:
    _player_locks.pop(player_id, None)
    _npc_sync_state.pop(player_id, None)


async def _handle_world_modify(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    """Handle a World Builder agent request to modify the environment."""
    player_id = manager.get_player_id(websocket)
    prompt = data.get("prompt", "").strip()

    if not player_id or not prompt:
        return {"type": "error", "message": "Missing prompt"}

    if _world_builder_agent is None:
        return {"type": "error", "message": "World Builder agent not initialized"}

    # We use a per-player lock to prevent race conditions in world generation
    if player_id not in _player_locks:
        _player_locks[player_id] = asyncio.Lock()

    async with _player_locks[player_id]:
        logger.info(f"World Modify Request: {player_id} -> '{prompt}'")

        # Build context for the agent
        player = _world_state.get_player(player_id) if _world_state else None
        context = {
            "player_id": player_id,
            "position": player.position if player else [0, 0, 0],
            "inventory": player.inventory if player else [],
            "equipment": _player_equipment.get(player_id, {}),
            "nearby_npcs": [n.name for n in _world_state.get_nearby_npcs(player.position, 100)]
            if player and _world_state
            else [],
        }

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
            "current_goal": "Maintain the world's balance.",
            "episodic_memories": [],
        }

        try:
            result = await asyncio.wait_for(
                _world_builder_agent.ainvoke(input_state),
                timeout=30.0,
            )

            # Extract dialogue and actions
            dialogue = "The world shifts..."
            for msg in reversed(result.get("messages", [])):
                if getattr(msg, "type", "") == "ai" and msg.content:
                    dialogue = msg.content
                    break

            # The tools already append to _pending_world_actions via closure
            actions = []
            if _pending_world_actions:
                actions = list(_pending_world_actions)
                _pending_world_actions.clear()

            return {
                "type": "world_modify_response",
                "dialogue": dialogue,
                "actions": actions,
            }

        except TimeoutError:
            return {"type": "error", "message": "World modification timed out"}
        except LLMProviderUnavailableError:
            logger.warning("World Builder provider unavailable; returning fallback response")
            return {"type": "error", "message": "The world spirits are silent..."}
        except Exception as e:
            logger.error(f"World Builder failed: {e}", exc_info=True)
            return {"type": "error", "message": "The world spirits are silent..."}
