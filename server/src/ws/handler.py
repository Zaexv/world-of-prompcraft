"""WebSocket message dispatch facade.

Thin routing layer over the domain handler modules in ``src.ws.handlers``:
each game-state domain (join, movement, chat, interaction, items, dungeon,
quest, world building, system) lives in its own module and receives an
explicit :class:`~src.ws.handlers.context.HandlerContext` instead of module
globals.

This module keeps the historical public API used by ``main.py`` and the test
suite: ``init_handler``/``handle_message``, the ``_world_state``/``_manager``
module attributes (read *and* patched directly by tests — the shared context
is refreshed from them on every dispatch), the ``_handle_interaction`` alias,
and the ``cleanup_player_equipment``/``cleanup_player_locks`` re-exports.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from .handlers import (
    chat,
    dungeon,
    interaction,
    items,
    join,
    movement,
    quest,
    system,
    world_builder,
)
from .handlers.context import HandlerContext

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from fastapi import WebSocket

    from ..agents.registry import AgentRegistry
    from ..world.world_state import WorldState
    from .connection_manager import ConnectionManager

    _HandlerFunc = Callable[
        [HandlerContext, dict[str, Any], WebSocket, ConnectionManager],
        Awaitable[dict[str, Any] | None],
    ]

# Module-level references set during app startup. Kept as module attributes
# (not just context fields) for backwards compatibility: main.py reads
# ``_world_state`` and tests patch ``_world_state``/``_manager`` directly.
_registry: AgentRegistry | None = None
_world_state: WorldState | None = None
_manager: ConnectionManager | None = None

# WorldBuilder agent and its pending actions list
_world_builder_agent: Any | None = None
_pending_world_actions: list[Any] = []

# Single shared context: holds the service references above plus the shared
# mutable runtime state (interaction locks, background tasks, agent semaphore,
# player equipment) that the domain handlers operate on.
_context = HandlerContext()


def _sync_context() -> HandlerContext:
    """Refresh the shared context's service references from the module attributes.

    Re-read on every dispatch (not only in ``init_handler``) so tests that
    assign ``handler._world_state`` / ``handler._manager`` directly still work.
    """
    _context.registry = _registry
    _context.world_state = _world_state
    _context.manager = _manager
    _context.world_builder_agent = _world_builder_agent
    _context.pending_world_actions = _pending_world_actions
    return _context


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
    _sync_context()


# msg_type → handler coroutine. Every handler shares the signature
# (ctx, data, websocket, manager) -> response dict | None.
_MESSAGE_HANDLERS: dict[str, _HandlerFunc] = {
    "join": join.handle_join,
    "ping": system.handle_ping,
    "interaction": interaction.handle_interaction,
    "player_move": movement.handle_player_move,
    "explore_area": movement.handle_explore_area,
    "use_item": items.handle_use_item,
    "equip_item": items.handle_equip_item,
    "chat": chat.handle_chat_message,
    "chat_message": chat.handle_chat_message,
    "dungeon_enter": dungeon.handle_dungeon_enter,
    "dungeon_exit": dungeon.handle_dungeon_exit,
    "quest_update": quest.handle_quest_update,
    "world_modify": world_builder.handle_world_modify,
    "world_direct_edit": world_builder.handle_world_direct_edit,
    "world_manifest_update": world_builder.handle_world_manifest_update,
}

# Message types handled before player registration. A tuple (not a set) so the
# membership test never hashes a malformed non-string ``type`` payload.
_PRE_AUTH_TYPES = ("join", "ping")


async def handle_message(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any] | None:
    """Route incoming WebSocket messages to appropriate handlers."""
    ctx = _sync_context()
    msg_type = data.get("type")

    if msg_type in _PRE_AUTH_TYPES:
        return await _MESSAGE_HANDLERS[msg_type](ctx, data, websocket, manager)

    # All other message types require registration
    if manager.get_player_id(websocket) is None:
        return None  # silently drop — client will re-join after reconnect

    handler_fn = _MESSAGE_HANDLERS.get(msg_type) if isinstance(msg_type, str) else None
    if handler_fn is None:
        return {"type": "error", "message": f"Unknown message type: {msg_type}"}

    return await handler_fn(ctx, data, websocket, manager)


async def _handle_interaction(
    data: dict[str, Any], websocket: WebSocket, manager: ConnectionManager
) -> dict[str, Any]:
    """Backwards-compatible alias (tests call this directly) — delegates to the
    interaction module using the current context."""
    return await interaction.handle_interaction(_sync_context(), data, websocket, manager)


def cleanup_player_equipment(player_id: str) -> None:
    """Remove a player's equipment data on disconnect (Bug 16)."""
    items.cleanup_player_equipment(_context, player_id)


def cleanup_player_locks(player_id: str) -> None:
    """Remove per-player interaction lock on disconnect."""
    interaction.cleanup_player_locks(_context, player_id)


def manager_player_id(websocket: WebSocket) -> str | None:
    """Helper: resolve the player id for a websocket, tolerating a missing manager."""
    return world_builder.manager_player_id(_sync_context(), websocket)
