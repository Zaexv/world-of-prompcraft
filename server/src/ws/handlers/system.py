"""System-level messages: connection liveness (ping/pong)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..connection_manager import ConnectionManager
    from .context import HandlerContext


async def handle_ping(
    ctx: HandlerContext,
    data: dict[str, Any],
    websocket: WebSocket,
    manager: ConnectionManager,
) -> dict[str, Any]:
    """Reply to a client liveness ping."""
    return {"type": "pong"}
