"""SQLite persistence for the game world.

Decoupled from the WebSocket handlers: the store only knows WorldState data
shapes, and main.py owns when to save (periodic tick, disconnect, shutdown)
and when to restore (startup).
"""

from __future__ import annotations

from .store import GameStore

__all__ = ["GameStore"]
