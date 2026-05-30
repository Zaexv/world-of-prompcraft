from __future__ import annotations

import time
from collections import OrderedDict
from typing import Any


class HybridInteractionCache:
    """L1 in-memory + optional L2 Redis cache for interaction responses."""

    def __init__(self, ttl_seconds: int = 20, max_items: int = 512) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_items = max_items
        self._l1: OrderedDict[str, tuple[float, dict[str, Any]]] = OrderedDict()
        self._l2 = None
        try:
            from ...caching.response_cache import get_cache

            self._l2 = get_cache()
        except Exception:
            self._l2 = None

    def _evict_expired(self) -> None:
        now = time.monotonic()
        expired: list[str] = []
        for key, (expires_at, _) in self._l1.items():
            if expires_at < now:
                expired.append(key)
        for key in expired:
            self._l1.pop(key, None)

    def get(self, key: str) -> dict[str, Any] | None:
        self._evict_expired()
        local = self._l1.get(key)
        if local is not None:
            expires_at, value = local
            if expires_at >= time.monotonic():
                self._l1.move_to_end(key)
                return value

        # Reuse existing Redis cache adapter by storing key in prompt field.
        if self._l2 is not None:
            remote = self._l2.get("cache", "cache", key)
            if remote is not None:
                self._l1[key] = (time.monotonic() + self._ttl_seconds, remote)
                self._l1.move_to_end(key)
                return remote
        return None

    def set(self, key: str, value: dict[str, Any]) -> None:
        self._evict_expired()
        self._l1[key] = (time.monotonic() + self._ttl_seconds, value)
        self._l1.move_to_end(key)
        while len(self._l1) > self._max_items:
            self._l1.popitem(last=False)

        if self._l2 is not None:
            self._l2.set("cache", "cache", key, value)
