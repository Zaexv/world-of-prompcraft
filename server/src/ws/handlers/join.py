"""Join handling: validate the joining player, register the connection, build
the ``join_ok`` payload, and broadcast ``player_joined`` to everyone else."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from ...agents.tools.world_builder import set_known_mesh_types

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..connection_manager import ConnectionManager
    from .context import HandlerContext

logger = logging.getLogger(__name__)

# Valid races and factions for join validation
_VALID_RACES = {"human", "night_elf", "orc", "undead"}
_VALID_FACTIONS = {"alliance", "horde"}


async def handle_join(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Handle a player joining the game."""
    world_state = ctx.world_state

    username = (data.get("username") or "").strip()
    race = data.get("race", "human")
    faction = data.get("faction", "alliance")

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

    # Reject duplicate logins instead of session takeover. Taking over the old
    # socket made the kicked client auto-reconnect and re-join, ping-ponging
    # forever and spamming "X has joined".
    if manager.is_username_taken(username):
        logger.warning(f"Join rejected: username '{username}' already online")
        return {
            "type": "join_error",
            "message": f"A player named '{username}' is already online.",
        }

    # Register websocket with manager
    await manager.register(websocket, username)
    logger.info(f"WebSocket registered for player: {username}")

    # Learn the client's mesh catalog so the WorldBuilder agent can place any
    # registered mesh (not a hardcoded subset). Clients share one registry, so
    # the last join's catalog is authoritative.
    catalog = data.get("meshCatalog")
    if isinstance(catalog, list) and catalog:
        set_known_mesh_types([str(t) for t in catalog])

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
    if world_state is not None:
        world_state.refresh_npcs()
        if ctx.registry:
            ctx.registry.refresh_agents()

        is_new_player = username not in world_state.players

        # Returning player not in memory (left earlier / server restarted after
        # their save): restore the persisted document before initializing.
        if is_new_player and ctx.store is not None:
            doc = ctx.store.load_player(username)
            if doc:
                from ...world.player_state import PlayerData

                try:
                    world_state.players[username] = PlayerData(**doc)
                    is_new_player = False
                    logger.info(f"Restored persisted state for returning player: {username}")
                except TypeError:
                    logger.warning(f"Stale persisted schema for {username} — starting fresh")

        player = world_state.get_player(username)
        player.username = username
        player.race = race
        player.faction = faction

        if is_new_player:
            player.position = initial_position

        logger.info(f"Player state initialized: {username}")

    # Build list of current players (excluding the joining player)
    current_players: list[dict[str, Any]] = []
    if world_state is not None:
        for pid, p in world_state.players.items():
            if pid != username and pid in manager.active_connections:
                current_players.append(p.to_public_dict())

    # Build NPC list
    current_npcs: list[dict[str, Any]] = []
    if world_state is not None:
        for npc in world_state.npcs.values():
            current_npcs.append(npc.to_dict())

    # Broadcast player_joined to everyone else
    if world_state is not None:
        player = world_state.get_player(username)
        await manager.broadcast(
            {
                "type": "player_joined",
                "player": player.to_public_dict(),
            },
            exclude=username,
        )

    # Player-built objects placed by anyone, so the joiner sees the shared world.
    world_objects: list[dict[str, Any]] = []
    if world_state is not None:
        world_objects = world_state.get_world_objects()

    logger.info(f"Join successful: {username}. Sending join_ok with {len(current_npcs)} NPCs.")

    self_player_data = None
    if world_state is not None:
        self_player_data = world_state.get_player(username).to_public_dict()

    return {
        "type": "join_ok",
        "playerId": username,
        "self_player": self_player_data,
        "players": current_players,
        "npcs": current_npcs,
        "worldObjects": world_objects,
    }
