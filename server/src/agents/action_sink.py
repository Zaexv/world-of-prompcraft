from __future__ import annotations

from contextvars import ContextVar, Token
from typing import Any


class PendingActionSink:
    """Collect tool-emitted actions per async invocation context.

    Tools call ``append`` without needing to know which invocation they belong to.
    The active capture context is tracked with a ContextVar, so concurrent graph
    runs for the same NPC do not leak actions into each other.
    """

    def __init__(self) -> None:
        self._capture_id: ContextVar[str | None] = ContextVar(
            "pending_action_capture_id",
            default=None,
        )
        self._buckets: dict[str, list[Any]] = {}

    def start_capture(self, capture_id: str) -> Token[str | None]:
        self._buckets[capture_id] = []
        return self._capture_id.set(capture_id)

    def end_capture(self, token: Token[str | None]) -> None:
        self._capture_id.reset(token)

    def append(self, action: Any) -> None:
        capture_id = self._capture_id.get()
        if capture_id is None:
            raise RuntimeError("No active action capture context")
        self._buckets.setdefault(capture_id, []).append(action)

    def drain(self, capture_id: str) -> list[Any]:
        return self._buckets.pop(capture_id, [])
