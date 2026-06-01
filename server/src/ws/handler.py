from __future__ import annotations

import asyncio
import logging
import random
import re
from typing import TYPE_CHECKING, Any

from ..combat.combat_resolution import CombatResolution, is_attack_prompt, resolve_combat
from ..config import settings

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..agents.agent_state import NPCAgentState as _NPCAgentState
    from ..agents.registry import AgentRegistry
    from ..world.world_state import WorldState
    from .connection_manager import ConnectionManager

logger = logging.getLogger(__name__)

# Background tasks for NPC chat reactions (prevent garbage collection)
_background_tasks: set[asyncio.Task[None]] = set()

# Module-level references set during app startup
_registry: AgentRegistry | None = None
_world_state: WorldState | None = None
_manager: ConnectionManager | None = None

# WorldBuilder agent and its pending actions list
_world_builder_agent: Any | None = None
_pending_world_actions: list[Any] = []

# Per-player interaction locks — prevents concurrent interactions from the same client
_interaction_locks: dict[str, asyncio.Lock] = {}

# Global cap on concurrent LLM agent invocations.
# Additional requests wait in the asyncio queue (backpressure) rather than
# creating unbounded parallelism that would exhaust LLM API rate limits.
_agent_semaphore = asyncio.Semaphore(10)

# Valid races and factions for join validation
_VALID_RACES = {"human", "night_elf", "orc", "undead"}
_VALID_FACTIONS = {"alliance", "horde"}
_VALID_SKINS = {"skin-1", "skin-2", "skin-3", "skin-4"}

# Allowed fields from client player state (security whitelist)
# We sync inventory and hp so the server can score attacks properly
# and use_item can find items the player received from NPCs.
_ALLOWED_PLAYER_FIELDS = {"position", "hp", "inventory"}


def _auto_register_procedural_npc(npc_id: str, name: str, personality_key: str) -> None:
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
        position=[0.0, 0.0, 0.0],
    )
    _world_state.npcs[npc_id] = npc
    _registry.register_dynamic_npc(npc)
    logger.info(
        "Auto-registered procedural NPC %s (%s) with key '%s'", npc_id, name, personality_key
    )


def init_handler(
    registry: AgentRegistry,
    world_state: WorldState,
    manager: ConnectionManager,
    world_builder_agent: Any | None = None,
    pending_world_actions: list[Any] | None = None,
) -> None:
    """Wire the handler to the live registry, world state, and connection manager."""
    global _registry, _world_state, _manager, _world_builder_agent, _pending_world_actions
    _registry = registry
    _world_state = world_state
    _manager = manager
    if world_builder_agent is not None:
        _world_builder_agent = world_builder_agent
    if pending_world_actions is not None:
        _pending_world_actions = pending_world_actions


async def handle_message(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    """Route incoming WebSocket messages to appropriate handlers."""
    msg_type = data.get("type")

    if msg_type == "join":
        return await _handle_join(data, websocket, manager)

    if msg_type == "ping":
        return {"type": "pong"}

    # All other message types require registration
    if manager.get_player_id(websocket) is None:
        return None  # silently drop — client will re-join after reconnect

    if msg_type == "interaction":
        return await _handle_interaction(data, websocket, manager)

    if msg_type == "player_move":
        return await _handle_player_move(data, websocket, manager)

    if msg_type == "explore_area":
        return await _handle_explore_area(data)

    if msg_type == "use_item":
        return await _handle_use_item(data)

    if msg_type == "equip_item":
        return await _handle_equip_item(data)

    if msg_type in ("chat", "chat_message"):
        return await _handle_chat_message(data, websocket, manager)

    if msg_type == "dungeon_enter":
        return await _handle_dungeon_enter(data)

    if msg_type == "dungeon_exit":
        return await _handle_dungeon_exit(data)

    if msg_type == "quest_update":
        return await _handle_quest_update(data)

    if msg_type == "world_modify":
        return await _handle_world_modify(data, websocket)

    if msg_type == "world_manifest_update":
        return await _handle_world_manifest_update(data)

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

    # Validate username: 1-20 alphanumeric/underscore characters
    if not username or len(username) > 20 or not re.match(r"^[a-zA-Z0-9_]+$", username):
        logger.warning(f"Join rejected: Invalid username '{username}'")
        return {
            "type": "join_error",
            "message": "Username must be 1-20 alphanumeric characters.",
        }

    if race not in _VALID_RACES:
        race = "human"
    if faction not in _VALID_FACTIONS:
        faction = "alliance"
    if skin not in _VALID_SKINS:
        skin = "skin-1"

    # Register websocket with manager
    await manager.register(websocket, username)
    logger.info(f"WebSocket registered for player: {username}")

    # BUG-3: Accept initial position from client so player isn't broadcast at [0,0,0]
    initial_position = data.get("position")
    if (
        isinstance(initial_position, list)
        and len(initial_position) >= 3
        and all(isinstance(v, (int, float)) for v in initial_position[:3])
    ):
        initial_position = [float(v) for v in initial_position[:3]]
    else:
        initial_position = [0.0, 0.0, 0.0]

    # Create player in world state
    if _world_state is not None:
        _world_state.refresh_npcs()
        if _registry:
            _registry.refresh_agents()
        player = _world_state.get_player(username)
        player.username = username
        player.race = race
        player.faction = faction
        player.skin = skin
        player.position = initial_position
        logger.info(f"Player state initialized: {username}")

    # Build list of current players (excluding the joining player)
    current_players: list[dict[str, Any]] = []
    if _world_state is not None:
        for pid, p in _world_state.players.items():
            if pid != username and pid in manager.active_connections:
                current_players.append(p.to_public_dict())

    # Build NPC list
    current_npcs: list[dict[str, Any]] = []
    if _world_state is not None:
        for npc in _world_state.npcs.values():
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

    logger.info(f"Join successful: {username}. Sending join_ok with {len(current_npcs)} NPCs.")
    return {
        "type": "join_ok",
        "playerId": username,
        "players": current_players,
        "npcs": current_npcs,
    }


async def _handle_chat_message(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    """Handle a chat message from a player — broadcast to nearby players."""
    player_id = manager.get_player_id(websocket)
    if player_id is None:
        return {"type": "error", "message": "Not registered"}

    text = data.get("text", "").strip()
    if not text:
        return None

    if _world_state is None:
        return None

    # Store in world state chat history
    _world_state.add_chat_message(player_id, text)

    # Get player position for proximity
    player = _world_state.get_player(player_id)

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
        world_state=_world_state,
        exclude=player_id,
    )

    # Trigger nearby NPCs to react to the chat (fire-and-forget)
    if _registry is not None:
        nearby_npcs = _world_state.get_nearby_npcs(player.position, 50.0)
        for npc in nearby_npcs:
            task = asyncio.create_task(_npc_react_to_chat(npc, player_id, text, player, manager))
            _background_tasks.add(task)
            task.add_done_callback(_background_tasks.discard)

    return None


async def _npc_react_to_chat(
    npc: Any,
    player_id: str,
    text: str,
    player: Any,
    manager: ConnectionManager,
) -> None:
    """Have an NPC react to a nearby chat message — lightweight, no tools/actions."""
    if _registry is None or _world_state is None:
        return

    # 40% chance to react — NPCs shouldn't respond to every message
    if random.random() > 0.4:
        return

    # Use a direct lightweight LLM call instead of the full agent pipeline
    from langchain_core.messages import HumanMessage, SystemMessage

    llm = _registry._llm
    prompt = (
        f"You are {npc.name}, an NPC in a fantasy world.\n"
        f"Personality: {npc.personality[:200]}\n\n"
        f"A player named '{player_id}' said nearby: \"{text}\"\n\n"
        "Respond with a SHORT reaction (1 sentence max, 15 words max). "
        "Stay in character. If the message isn't relevant to you, respond with just '...' and nothing else."
    )
    # Respect the global LLM call cap — chat reactions are lower-priority than interactions
    if _agent_semaphore.locked():
        return  # drop silently when server is saturated; chat reactions are best-effort
    try:
        async with _agent_semaphore:
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
        world_state=_world_state,
    )


_COMBAT_FALLBACKS = [
    "You dare strike me?!",
    "I'll make you pay for that!",
    "You'll regret this, fool!",
    "Feel my wrath!",
    "Is that all you've got?!",
]


async def _fast_combat_reaction(
    player_id: str,
    npc_id: str,
    npc_name: str,
    npc_personality: str,
    resolution: CombatResolution,
    prompt: str,
    manager: ConnectionManager,
) -> None:
    """Send a fast NPC reaction using a single direct LLM call — no full pipeline.

    - NPC dialogue: one direct LLM call with a minimal prompt (≈1-2 s).
    - Counter-attack: computed deterministically from NPC max HP (no LLM needed).

    The player already received the damage action instantly. This follow-up
    delivers the NPC's voice and retaliation damage with minimum extra latency.
    """
    if _registry is None or _world_state is None:
        return

    npc_data = _world_state.get_npc(npc_id)
    if npc_data is None or npc_data.hp <= 0:
        return

    # Deterministic counter-attack: scales with NPC max HP so bosses hit harder
    counter_damage = max(3, random.randint(npc_data.max_hp // 15, npc_data.max_hp // 8))

    # Single direct LLM call — no tools, no pipeline, minimal prompt
    llm = _registry._llm
    from langchain_core.messages import HumanMessage as _HumanMessage
    from langchain_core.messages import SystemMessage as _SystemMessage

    short_personality = npc_personality[:300].strip()
    system_text = (
        f"You are {npc_name}.\n{short_personality}\n\n"
        "The player just attacked you. React in ONE short, dramatic, in-character sentence. "
        "Do NOT break character. Do NOT explain or add commentary."
    )
    user_text = f'Player did: "{prompt}". Combat result: {resolution.combat_text}'

    try:
        response = await asyncio.wait_for(
            llm.ainvoke([_SystemMessage(content=system_text), _HumanMessage(content=user_text)]),
            timeout=12.0,
        )
        raw = response.content if isinstance(response.content, str) else ""
        dialogue = raw.strip() or random.choice(_COMBAT_FALLBACKS)
    except Exception:
        logger.warning("Fast combat reaction failed for NPC %s — using fallback", npc_id)
        dialogue = random.choice(_COMBAT_FALLBACKS)

    # Apply counter-attack to world state
    counter_actions: list[dict[str, Any]] = []
    if npc_data.hp > 0:
        counter_action: dict[str, Any] = {
            "kind": "damage",
            "params": {
                "target": "player",
                "amount": counter_damage,
                "damageType": "physical",
                "combatText": f"{npc_name} retaliates for {counter_damage} damage!",
            },
        }
        await _world_state.apply_actions([counter_action])
        counter_actions.append(counter_action)

    # Re-fetch updated state
    npc_after = _world_state.get_npc(npc_id)
    npc_state: dict[str, Any] = {}
    if npc_after is not None:
        npc_state = {"hp": npc_after.hp, "maxHp": npc_after.max_hp}

    player = _world_state.get_player(player_id)
    player_update = player.to_dict() if player else None

    await manager.send_to(
        player_id,
        {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": dialogue,
            "actions": counter_actions,
            "playerStateUpdate": player_update,
            "npcStateUpdate": npc_state,
        },
    )

    # Broadcast to nearby players
    if npc_after is not None:
        if dialogue:
            await manager.broadcast_nearby(
                {
                    "type": "npc_dialogue",
                    "npcId": npc_id,
                    "npcName": npc_name,
                    "dialogue": dialogue,
                },
                origin=npc_after.position,
                radius=100.0,
                world_state=_world_state,
                exclude=player_id,
            )
        bcast = [a for a in counter_actions if a.get("params", {}).get("target") != "player"]
        if bcast or npc_state:
            await manager.broadcast_nearby(
                {
                    "type": "npc_actions",
                    "npcId": npc_id,
                    "actions": bcast,
                    "npcStateUpdate": npc_state,
                },
                origin=npc_after.position,
                radius=200.0,
                world_state=_world_state,
                exclude=player_id,
            )


async def _update_combat_memory_async(
    player_id: str,
    npc_id: str,
    resolution: CombatResolution,
    prompt: str,
) -> None:
    """Run the full agent pipeline silently to update NPC memory and relationship score.

    The player already received their combat response from _fast_combat_reaction.
    This function persists the relationship penalty and mood change so future
    interactions reflect that the NPC was attacked — no further client message sent.
    """
    if _registry is None or _world_state is None:
        return

    player = _world_state.get_player(player_id)
    player_dict = player.to_dict()
    player_dict["active_quests"] = player.active_quests
    player_dict["completed_quests"] = list(player.completed_quests)
    player_dict["kill_count"] = player.kill_count

    combat_prompt = (
        f"[COMBAT: {resolution.outcome} — "
        f"{resolution.final_damage} {resolution.damage_type} damage] "
        f"{prompt}"
    )

    lock = _interaction_locks.setdefault(player_id, asyncio.Lock())
    try:
        async with lock, _agent_semaphore:
            await asyncio.wait_for(
                _registry.invoke(
                    npc_id=npc_id,
                    player_id=player_id,
                    prompt=combat_prompt,
                    player_state=player_dict,
                ),
                timeout=settings.agent_invoke_timeout_seconds,
            )
    except Exception:
        logger.debug("Background memory update timed out/failed for NPC %s", npc_id)


async def _handle_interaction(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any]:
    npc_id = data.get("npcId", data.get("npc_id", "unknown"))
    npc_name = data.get("npcName") or "Unknown Creature"
    personality_key = data.get("personalityKey") or ""
    player_id = data.get("playerId", data.get("player_id")) or manager.get_player_id(websocket)
    prompt = str(data.get("prompt", data.get("text", ""))).strip()
    player_state_raw = data.get("playerState", data.get("player_state", {}))

    # Bug 10: Reject unregistered players instead of falling back to "default"
    if not player_id:
        return {"type": "error", "message": "Player not registered"}

    if _registry is None or _world_state is None:
        logger.warning("Handler called before initialization")
        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": "[System] The world is not yet ready.",
            "actions": [],
            "playerStateUpdate": None,
            "npcStateUpdate": None,
        }

    # Auto-register procedural NPCs on first interaction.
    # These are spawned client-side and the server has no prior record of them.
    if _world_state.get_npc(npc_id) is None and npc_id.startswith(("proc_", "enc_")):
        _auto_register_procedural_npc(npc_id, npc_name, personality_key)

    # Bug 36: Dead players cannot interact
    player = _world_state.get_player(player_id)
    if player.hp <= 0:
        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": "[System] You are dead and cannot interact.",
            "actions": [],
            "playerStateUpdate": None,
            "npcStateUpdate": None,
        }

    # Bug 6: Update player state under the world state lock
    if player_state_raw:
        updates = {
            key: player_state_raw[key]
            for key in _ALLOWED_PLAYER_FIELDS
            if key in player_state_raw and hasattr(player, key)
        }
        if updates:
            await _world_state.update_player(player_id, updates)
        # Re-fetch player after lock-protected update
        player = _world_state.get_player(player_id)

    # ── Resolve player attack (fast path — no LLM wait) ─────────────────
    player_damage_actions: list[dict[str, Any]] = []
    _combat_resolution: CombatResolution | None = None

    if is_attack_prompt(prompt):
        client_inventory = player_state_raw.get("inventory", []) if player_state_raw else []
        scoring_inventory = client_inventory if client_inventory else player.inventory
        client_equipped = player_state_raw.get("equipped", None) if player_state_raw else None

        npc = _world_state.get_npc(npc_id)
        if npc:
            # Bug 35: Skip if NPC was already dead before this interaction
            if npc.hp <= 0:
                return {
                    "type": "agent_response",
                    "npcId": npc_id,
                    "dialogue": f"{npc.name} is already dead.",
                    "actions": [],
                    "playerStateUpdate": None,
                    "npcStateUpdate": {"hp": 0, "maxHp": npc.max_hp},
                }

            _combat_resolution = resolve_combat(
                prompt=prompt,
                player_level=player.level,
                player_inventory=scoring_inventory,
                player_equipped=client_equipped,
                npc_hp=npc.hp,
                npc_max_hp=npc.max_hp,
            )

            damage_action: dict[str, Any] = {
                "kind": "damage",
                "params": {
                    "target": npc_id,
                    "amount": _combat_resolution.final_damage,
                    "damageType": _combat_resolution.damage_type,
                    "outcome": _combat_resolution.outcome,
                    "isCrit": _combat_resolution.is_crit,
                    "combatText": _combat_resolution.combat_text,
                },
            }
            await _world_state.apply_actions([damage_action])
            player_damage_actions.append(damage_action)

            # Visual effects from outcome
            for tag in _combat_resolution.visual_tags:
                player_damage_actions.append(
                    {
                        "kind": "spawn_effect",
                        "params": {
                            "effectType": tag,
                            "count": 40 if _combat_resolution.is_crit else 20,
                        },
                    }
                )

    # ── Fast-path: return immediately for combat, fire LLM narration async ──
    if _combat_resolution is not None:
        # Re-fetch NPC to get updated HP after apply_actions
        npc_after = _world_state.get_npc(npc_id)
        npc_state: dict[str, Any] = {}
        if npc_after is not None:
            npc_state = {"hp": npc_after.hp, "maxHp": npc_after.max_hp}
            if npc_after.hp <= 0:
                player_damage_actions.append(
                    {
                        "kind": "spawn_effect",
                        "params": {"color": "#ff4400", "count": 50},
                    }
                )

        # Broadcast the attack to nearby players
        npc_for_bcast = _world_state.get_npc(npc_id)
        if npc_for_bcast is not None:
            _BROADCAST_KINDS_FAST = {"damage", "spawn_effect"}  # noqa: N806
            bcast_actions = [
                a
                for a in player_damage_actions
                if a.get("kind") in _BROADCAST_KINDS_FAST
                and a.get("params", {}).get("target") != "player"
            ]
            if bcast_actions or npc_state:
                await manager.broadcast_nearby(
                    {
                        "type": "npc_actions",
                        "npcId": npc_id,
                        "actions": bcast_actions,
                        "npcStateUpdate": npc_state,
                    },
                    origin=list(npc_for_bcast.position),
                    radius=200.0,
                    world_state=_world_state,
                    exclude=player_id,
                )

        # Fast reaction: single LLM call → NPC dialogue + counter-attack (≈1-2 s)
        npc_data = _world_state.get_npc(npc_id)
        npc_personality = npc_data.personality if npc_data is not None else ""
        reaction_task = asyncio.create_task(
            _fast_combat_reaction(
                player_id=player_id,
                npc_id=npc_id,
                npc_name=npc_name,
                npc_personality=npc_personality,
                resolution=_combat_resolution,
                prompt=prompt,
                manager=manager,
            )
        )
        _background_tasks.add(reaction_task)
        reaction_task.add_done_callback(_background_tasks.discard)

        # Memory update: full pipeline silently in background (no extra client message)
        memory_task = asyncio.create_task(
            _update_combat_memory_async(
                player_id=player_id,
                npc_id=npc_id,
                resolution=_combat_resolution,
                prompt=prompt,
            )
        )
        _background_tasks.add(memory_task)
        memory_task.add_done_callback(_background_tasks.discard)

        return {
            "type": "agent_response",
            "npcId": npc_id,
            "dialogue": _combat_resolution.combat_text,
            "actions": player_damage_actions,
            "playerStateUpdate": None,
            "npcStateUpdate": npc_state,
        }

    # Build player state dict with quest data so agents can see quest progress
    player_dict = player.to_dict()
    player_dict["active_quests"] = player.active_quests
    player_dict["completed_quests"] = list(player.completed_quests)
    player_dict["kill_count"] = player.kill_count

    # Per-player lock + global semaphore:
    #   lock  → serializes rapid clicks from the same player (prevents double-damage)
    #   semaphore → caps total concurrent LLM calls (backpressure against API rate limits)
    lock = _interaction_locks.setdefault(player_id, asyncio.Lock())
    async with lock, _agent_semaphore:
        try:
            result = await asyncio.wait_for(
                _registry.invoke(
                    npc_id=npc_id,
                    player_id=player_id,
                    prompt=prompt,
                    player_state=player_dict,
                ),
                timeout=settings.agent_invoke_timeout_seconds,
            )
        except TimeoutError:
            logger.warning(
                "Agent invocation timed out for npc_id=%s player_id=%s", npc_id, player_id
            )
            return {
                "type": "agent_response",
                "npcId": npc_id,
                "dialogue": "The NPC seems distracted and doesn't respond...",
                "actions": player_damage_actions,
                "playerStateUpdate": None,
                "npcStateUpdate": None,
            }
        except Exception:
            logger.exception("Agent invocation failed for NPC %s player %s", npc_id, player_id)
            return {
                "type": "agent_response",
                "npcId": npc_id,
                "dialogue": "The NPC seems confused and doesn't respond.",
                "actions": player_damage_actions,
                "playerStateUpdate": None,
                "npcStateUpdate": None,
            }

    # Merge player damage actions before agent actions
    all_actions = player_damage_actions + result.get("actions", [])

    # Check for NPC death
    npc = _world_state.get_npc(npc_id)
    # Bug 11: Merge agent's npcStateUpdate with server HP instead of overwriting
    npc_state = result.get("npcStateUpdate") or {}
    if npc:
        npc_state = {**npc_state, "hp": npc.hp, "maxHp": npc.max_hp}
        if npc.hp <= 0:
            all_actions.append(
                {
                    "kind": "spawn_effect",
                    "params": {"color": "#ff4400", "count": 50},
                }
            )

    # Bug 19: Sync offer_item actions to server-side player inventory
    for action in all_actions:
        if action.get("kind") == "offer_item":
            item = action.get("params", {}).get("item", "")
            if item:
                async with _world_state._lock:
                    player = _world_state.get_player(player_id)
                    player.inventory.append(item)

    dialogue_text = result.get("dialogue", "...")

    # ── Broadcast NPC dialogue to nearby players ──────────────────────────
    npc_for_broadcast = _world_state.get_npc(npc_id)
    if npc_for_broadcast is not None:
        npc_pos = npc_for_broadcast.position
        npc_broadcast_pos = list(npc_pos)
        # Broadcast player's prompt
        await manager.broadcast_nearby(
            {
                "type": "npc_dialogue",
                "npcId": npc_id,
                "npcName": "",
                "speakerPlayer": player_id,
                "dialogue": prompt,
                "position": npc_broadcast_pos,
            },
            origin=npc_pos,
            radius=100.0,
            world_state=_world_state,
            exclude=player_id,
        )
        # Broadcast NPC's response
        await manager.broadcast_nearby(
            {
                "type": "npc_dialogue",
                "npcId": npc_id,
                "npcName": npc_for_broadcast.name,
                "speakerPlayer": player_id,
                "dialogue": dialogue_text,
                "position": npc_broadcast_pos,
            },
            origin=npc_pos,
            radius=100.0,
            world_state=_world_state,
            exclude=player_id,
        )

    # ── Sync NPC position for move_npc actions ─────────────────────────────
    for action in all_actions:
        if action.get("kind") == "move_npc":
            pos = action.get("params", {}).get("position")
            npc = _world_state.get_npc(npc_id)
            if npc and isinstance(pos, list) and len(pos) >= 3:
                async with _world_state._lock:
                    npc.position = [float(pos[0]), float(pos[1]), float(pos[2])]

    # ── Broadcast NPC actions to nearby players (combat sync) ─────────────
    # Other players need to see NPC damage, movement, emotes, and HP changes.
    _BROADCAST_KINDS = {"damage", "move_npc", "emote", "spawn_effect"}  # noqa: N806
    if npc_for_broadcast is not None:
        broadcast_actions = [
            a
            for a in all_actions
            if a.get("kind") in _BROADCAST_KINDS and a.get("params", {}).get("target") != "player"
        ]
        if broadcast_actions or npc_state:
            await manager.broadcast_nearby(
                {
                    "type": "npc_actions",
                    "npcId": npc_id,
                    "actions": broadcast_actions,
                    "npcStateUpdate": npc_state,
                },
                origin=list(npc_for_broadcast.position),
                radius=200.0,
                world_state=_world_state,
                exclude=player_id,
            )

    # Don't send playerStateUpdate — let actions be the sole source of truth
    # on the client. This prevents double-application of HP/inventory changes.
    return {
        "type": "agent_response",
        "npcId": npc_id,
        "dialogue": dialogue_text,
        "actions": all_actions,
        "playerStateUpdate": None,
        "npcStateUpdate": npc_state,
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
        if _world_state is not None:
            await _world_state.update_player(player_id, {"position": position, "yaw": yaw})

            # Broadcast nearby player positions as a list
            nearby = _world_state.get_nearby_players(position, 200.0)
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
                moving_player = _world_state.get_player(player_id)
                broadcast_list = [moving_player.to_public_dict(), *nearby_list]
                await manager.broadcast_nearby(
                    {
                        "type": "world_update",
                        "players": broadcast_list,
                    },
                    origin=position,
                    radius=200.0,
                    world_state=_world_state,
                    exclude=player_id,
                )
    except Exception:
        logger.exception("Failed to update player position for %s", player_id)

    return None


async def _handle_explore_area(data: dict[str, Any]) -> dict[str, Any]:
    """Handle area exploration — create dynamic NPC agents for generated NPCs."""
    npcs = data.get("npcs", [])
    for npc_data in npcs:
        npc_id = npc_data.get("id", "")
        name = npc_data.get("name", "Unknown")
        behavior = npc_data.get("behavior", "friendly")

        # Create NPC in world state
        if _world_state and npc_id not in _world_state.npcs:
            from ..world.world_state import NPCData

            personality = _get_generated_personality(name, behavior)
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
    """Return a system prompt personality for a dynamically generated NPC."""
    if behavior == "hostile":
        damage_range = random.choice([(8, 15), (12, 20), (15, 25)])
        damage_type = random.choice(["physical", "fire", "ice", "dark"])
        effect = random.choice(["fire", "ice", "smoke", "lightning"])
        return (
            f"You are {name}, a dangerous creature lurking in Teldrassil.\n"
            f"BEHAVIOR: You are aggressive and attack on sight.\n"
            f"TOOL RULES:\n"
            f"- ALWAYS call deal_damage targeting 'player' with {damage_range[0]}-{damage_range[1]} {damage_type} damage.\n"
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


async def _handle_use_item(data: dict[str, Any]) -> dict[str, Any]:
    """Handle item usage from the player's inventory."""
    if _world_state is None:
        return {"type": "use_item_result", "success": False, "message": "World not ready"}

    player_id = data.get("playerId", "default")
    item_name = data.get("item", "")

    player = _world_state.get_player(player_id)

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

    # Apply effects based on item type
    actions: list[dict[str, Any]] = []
    message = f"Used {item_name}"

    lower = item_name.lower()

    if "health" in lower or "heal" in lower or "potion" in lower:
        heal_amount = 30
        player.hp = min(player.max_hp, player.hp + heal_amount)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_amount}})
        message = f"Restored {heal_amount} HP"

    elif "mana" in lower or "elixir" in lower:
        mana_amount = 25
        player.mana = min(player.max_mana, player.mana + mana_amount)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": 0}})
        message = f"Restored {mana_amount} Mana"

    elif "sword" in lower or "blade" in lower or "axe" in lower or "dagger" in lower:
        # Weapon buff — player's next attacks deal more damage for the session
        player.level = min(player.level + 1, 10)
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "sparkle", "color": "#ffaa44", "count": 20},
            }
        )
        message = f"Equipped {item_name}! Attack power increased (Level {player.level})"

    elif "shield" in lower or "armor" in lower:
        # Defensive item — restore some HP as a shield effect
        shield_hp = 20
        player.hp = min(player.max_hp, player.hp + shield_hp)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": shield_hp}})
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "sparkle", "color": "#4488ff", "count": 15},
            }
        )
        message = f"Shield activated! +{shield_hp} HP"

    elif "scroll" in lower:
        # Scrolls restore mana and grant a magic boost
        mana_amount = 30
        player.mana = min(player.max_mana, player.mana + mana_amount)
        player.level = min(player.level + 1, 10)
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "sparkle", "color": "#aa44ff", "count": 30},
            }
        )
        message = f"Read {item_name}! Mana +{mana_amount}, magic power increased"

    elif "charm" in lower or "amulet" in lower or "rune" in lower:
        # Trinkets — small heal + buff
        heal_amount = 15
        player.hp = min(player.max_hp, player.hp + heal_amount)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_amount}})
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "holy_light", "color": "#ffcc00", "count": 15},
            }
        )
        message = f"The {item_name} glows warmly. +{heal_amount} HP"

    elif "brownie" in lower or "tea" in lower or "herb" in lower:
        # El Tito's special items — full HP/mana restore
        player.hp = player.max_hp
        player.mana = player.max_mana
        heal_amount = player.max_hp
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_amount}})
        actions.append(
            {
                "kind": "spawn_effect",
                "params": {"effectType": "smoke", "color": "#44ff88", "count": 30},
            }
        )
        message = "Whoa... full restore! HP and Mana replenished"

    else:
        # Generic item — small heal
        heal_amount = 10
        player.hp = min(player.max_hp, player.hp + heal_amount)
        actions.append({"kind": "heal", "params": {"target": "player", "amount": heal_amount}})
        message = f"Used {item_name}. +{heal_amount} HP"

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


# ── Player equipment storage (server-side, keyed by player_id) ─────────
_player_equipment: dict[str, dict[str, str | None]] = {}


def cleanup_player_equipment(player_id: str) -> None:
    """Remove a player's equipment data on disconnect (Bug 16)."""
    _player_equipment.pop(player_id, None)


def cleanup_player_locks(player_id: str) -> None:
    """Remove per-player interaction lock on disconnect."""
    _interaction_locks.pop(player_id, None)


async def _handle_equip_item(data: dict[str, Any]) -> dict[str, Any]:
    """Handle equipment changes from the client."""
    player_id = data.get("playerId", "default")
    item_name = data.get("item", "")
    slot = data.get("slot", "")
    equipped = data.get("equipped", {})

    # Store the full equipment state
    _player_equipment[player_id] = equipped

    logger.info("Player %s equipped %s in %s slot", player_id, item_name, slot)
    return {"type": "ack", "status": "ok"}


async def _handle_dungeon_enter(data: dict[str, Any]) -> dict[str, Any]:
    """Handle a player entering a dungeon — advance enter_dungeon quest objectives."""
    if _world_state is None:
        return {"type": "quest_update", "actions": [], "playerStateUpdate": None}

    player_id = data.get("playerId", data.get("player_id", "default"))
    dungeon_id = data.get("dungeonId", data.get("dungeon_id", ""))
    player = _world_state.get_player(player_id)
    actions: list[dict[str, Any]] = []

    # Check active quests for "enter_dungeon" objectives matching this dungeon
    for quest in player.active_quests:
        for obj in quest.get("objectives", []):
            if (
                obj.get("type") == "enter_dungeon"
                and obj.get("target") == dungeon_id
                and not obj.get("completed", False)
            ):
                player.advance_objective(quest["id"], obj["id"])
                actions.append(
                    {
                        "kind": "advance_objective",
                        "params": {
                            "questId": quest["id"],
                            "objectiveId": obj["id"],
                            "description": obj.get("description", ""),
                        },
                    }
                )

    return {
        "type": "quest_update",
        "actions": actions,
        "playerStateUpdate": player.to_dict(),
    }


async def _handle_dungeon_exit(data: dict[str, Any]) -> dict[str, Any]:
    """Handle a player exiting a dungeon — add loot and advance collect_item objectives."""
    if _world_state is None:
        return {"type": "quest_update", "actions": [], "playerStateUpdate": None}

    player_id = data.get("playerId", data.get("player_id", "default"))
    dungeon_id = data.get("dungeonId", data.get("dungeon_id", ""))
    loot: list[str] = data.get("loot", [])
    player = _world_state.get_player(player_id)
    actions: list[dict[str, Any]] = []

    # Add loot items to player inventory
    for item in loot:
        player.inventory.append(item)

    # Check active quests for "collect_item" objectives matching loot items
    loot_set = set(loot)
    for quest in player.active_quests:
        for obj in quest.get("objectives", []):
            if (
                obj.get("type") == "collect_item"
                and obj.get("target") in loot_set
                and not obj.get("completed", False)
            ):
                player.advance_objective(quest["id"], obj["id"])
                actions.append(
                    {
                        "kind": "advance_objective",
                        "params": {
                            "questId": quest["id"],
                            "objectiveId": obj["id"],
                            "description": obj.get("description", ""),
                        },
                    }
                )

    logger.info(
        "Player %s exited dungeon %s with loot: %s",
        player_id,
        dungeon_id,
        loot,
    )

    return {
        "type": "quest_update",
        "actions": actions,
        "playerStateUpdate": player.to_dict(),
    }


async def _handle_quest_update(data: dict[str, Any]) -> dict[str, Any]:
    """Handle generic quest objective advancement (e.g. kill tracking)."""
    if _world_state is None:
        return {"type": "quest_update", "actions": [], "playerStateUpdate": None}

    player_id = data.get("playerId", data.get("player_id", "default"))
    quest_id = data.get("questId", data.get("quest_id", ""))
    objective_id = data.get("objectiveId", data.get("objective_id", ""))
    player = _world_state.get_player(player_id)
    actions: list[dict[str, Any]] = []

    # Find the matching quest and objective
    for quest in player.active_quests:
        if quest["id"] != quest_id:
            continue
        for obj in quest.get("objectives", []):
            if obj["id"] != objective_id or obj.get("completed", False):
                continue

            # Handle kill_enemies type: increment kill_count and check threshold
            if obj.get("type") == "kill_enemies":
                player.kill_count += 1
                threshold = int(obj.get("target", "1"))
                if player.kill_count >= threshold:
                    player.advance_objective(quest_id, objective_id)
                    actions.append(
                        {
                            "kind": "advance_objective",
                            "params": {
                                "questId": quest_id,
                                "objectiveId": objective_id,
                                "description": obj.get("description", ""),
                            },
                        }
                    )
            else:
                # Generic advancement for other objective types
                player.advance_objective(quest_id, objective_id)
                actions.append(
                    {
                        "kind": "advance_objective",
                        "params": {
                            "questId": quest_id,
                            "objectiveId": objective_id,
                            "description": obj.get("description", ""),
                        },
                    }
                )
            break
        break

    return {
        "type": "quest_update",
        "actions": actions,
        "playerStateUpdate": player.to_dict(),
    }


async def _handle_world_modify(data: dict[str, Any], websocket: WebSocket) -> dict[str, Any]:
    """Handle a world_modify request — invoke the WorldBuilder agent."""
    if _world_builder_agent is None:
        return {
            "type": "world_modify_response",
            "dialogue": "The World Spirit is not yet awakened...",
            "actions": [],
        }

    prompt = data.get("prompt", "")
    position: list[float] = data.get("position", [0.0, 0.0, 0.0])
    if not isinstance(position, list) or len(position) < 3:
        position = [0.0, 0.0, 0.0]

    _pending_world_actions.clear()

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
        result = await asyncio.wait_for(
            _world_builder_agent.ainvoke(input_state),
            timeout=30.0,
        )
        actions = list(_pending_world_actions)
        dialogue: str = result.get("response_text", "The world reshapes itself...")
    except Exception:
        logger.exception("WorldBuilder agent failed")
        actions = []
        dialogue = "The world spirit is dormant..."

    return {
        "type": "world_modify_response",
        "dialogue": dialogue,
        "actions": actions,
    }


async def _handle_world_manifest_update(data: dict[str, Any]) -> dict[str, Any]:
    """Save the updated world manifest to disk."""
    import json
    import os

    manifest_data = data.get("data")
    if not manifest_data:
        return {"type": "error", "message": "No manifest data provided"}

    # Path to shared world manifest
    # Try multiple common locations relative to the server script
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    manifest_path = os.path.join(base_dir, "shared", "data", "world_manifest.json")

    if not os.path.exists(manifest_path):
        # Fallback to absolute path provided in context
        manifest_path = "/Users/eduardo.pertierrapuche/Development/My Project/world-of-prompcraft/shared/data/world_manifest.json"

    try:
        with open(manifest_path, "w") as f:
            json.dump(manifest_data, f, indent=2)
        logger.info("World manifest updated successfully at %s", manifest_path)

        # Broadcast the update to all connected players (optional)
        if _manager:
            await _manager.broadcast({"type": "world_manifest_refreshed"})

        return {"type": "ack", "status": "ok"}
    except Exception as e:
        logger.exception("Failed to save world manifest")
        return {"type": "error", "message": f"Failed to save manifest: {e!s}"}
