"""Shared runtime context passed to every WebSocket message handler.

Replaces the module-level globals that previously lived in ``src.ws.handler``.
The facade (``src.ws.handler``) owns a single :class:`HandlerContext` instance
and refreshes its service references (registry, world state, manager, world
builder agent, pending actions) from its module attributes before each
dispatch — so tests that patch ``handler._world_state`` / ``handler._manager``
directly keep working.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from ...agents.registry import AgentRegistry
    from ...world.world_state import WorldState
    from ..connection_manager import ConnectionManager


@dataclass
class HandlerContext:
    """Mutable bag of services and shared runtime state for message handlers."""

    # Services wired during app startup via ``handler.init_handler``.
    registry: AgentRegistry | None = None
    world_state: WorldState | None = None
    manager: ConnectionManager | None = None

    # WorldBuilder agent and its pending actions list
    world_builder_agent: Any | None = None
    pending_world_actions: list[Any] = field(default_factory=list)

    # NPC Designer agent and its pending actions list (chat-driven NPC creation)
    npc_designer_agent: Any | None = None
    pending_npc_actions: list[Any] = field(default_factory=list)

    # SQLite game store (src.persistence.GameStore) — None when disabled.
    # Handlers only read/restore through it; main.py owns the save cadence.
    store: Any | None = None

    # Per-player interaction locks — prevents concurrent interactions from the same client
    interaction_locks: dict[str, asyncio.Lock] = field(default_factory=dict)

    # Background tasks for NPC chat reactions (prevent garbage collection)
    background_tasks: set[asyncio.Task[None]] = field(default_factory=set)

    # Global cap on concurrent LLM agent invocations.
    # Additional requests wait in the asyncio queue (backpressure) rather than
    # creating unbounded parallelism that would exhaust LLM API rate limits.
    agent_semaphore: asyncio.Semaphore = field(default_factory=lambda: asyncio.Semaphore(10))

    # Player equipment storage (server-side, keyed by player_id)
    player_equipment: dict[str, dict[str, str | None]] = field(default_factory=dict)
