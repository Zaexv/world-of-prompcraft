from __future__ import annotations

import logging
import math
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from fastapi import WebSocket

    from ..world.world_state import WorldState

logger = logging.getLogger(__name__)


def _distance(a: list[float], b: list[float]) -> float:
    """Horizontal (XZ) distance — ignores Y so terrain height doesn't affect proximity."""
    dx = a[0] - b[0]
    dz = a[2] - b[2] if len(a) > 2 and len(b) > 2 else 0.0
    return math.sqrt(dx * dx + dz * dz)


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}
        self._ws_to_player: dict[int, str] = {}

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()

    def register(self, websocket: WebSocket, player_id: str) -> None:
        """Associate a websocket with a player id."""
        self.active_connections[player_id] = websocket
        self._ws_to_player[id(websocket)] = player_id

    def disconnect(self, websocket: WebSocket) -> str | None:
        """Remove a websocket and return the player_id, or None."""
        player_id = self._ws_to_player.pop(id(websocket), None)
        if player_id is not None:
            self.active_connections.pop(player_id, None)
        return player_id

    def get_player_id(self, websocket: WebSocket) -> str | None:
        """Return the player_id for a websocket, or None if not registered."""
        return self._ws_to_player.get(id(websocket))

    def is_username_taken(self, username: str) -> bool:
        """Check if a username is already connected."""
        return username in self.active_connections

    async def send_to(self, player_id: str, data: dict[str, Any]) -> None:
        """Send data to a specific player by id."""
        ws = self.active_connections.get(player_id)
        if ws is not None:
            try:
                await ws.send_json(data)
            except Exception:
                logger.warning("Failed to send to player %s", player_id)
                self.active_connections.pop(player_id, None)

    async def broadcast(self, data: dict[str, Any], exclude: str | None = None) -> None:
        """Broadcast data to all connected players, optionally excluding one."""
        failed: list[str] = []
        for pid, ws in list(self.active_connections.items()):
            if pid == exclude:
                continue
            try:
                await ws.send_json(data)
            except Exception:
                logger.warning("Failed to broadcast to player %s", pid)
                failed.append(pid)
        for pid in failed:
            self.active_connections.pop(pid, None)

    async def broadcast_nearby(
        self,
        data: dict[str, Any],
        origin: list[float],
        radius: float,
        world_state: WorldState,
        exclude: str | None = None,
    ) -> None:
        """Broadcast data to players within radius of origin position."""
        failed: list[str] = []
        for pid, ws in list(self.active_connections.items()):
            if pid == exclude:
                continue
            player = world_state.players.get(pid)
            if player is None:
                continue
            if _distance(player.position, origin) <= radius:
                try:
                    await ws.send_json(data)
                except Exception:
                    logger.warning("Failed to send to nearby player %s", pid)
                    failed.append(pid)
        for pid in failed:
            self.active_connections.pop(pid, None)
