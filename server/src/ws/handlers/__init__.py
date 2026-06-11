"""Domain-specific WebSocket message handlers.

Each module owns one game-state domain (join, movement, chat, interaction,
items, dungeon, quest, world building, system). Handlers share runtime state
through an explicit :class:`~src.ws.handlers.context.HandlerContext` object
instead of module globals; the ``src.ws.handler`` facade owns the single
context instance and dispatches incoming messages to these modules.
"""

from __future__ import annotations
