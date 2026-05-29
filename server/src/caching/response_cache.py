"""Redis-backed LLM response caching layer."""

from __future__ import annotations

import hashlib
import importlib
import json
from typing import Any


class ResponseCache:
    """Cache LLM responses by prompt hash to reduce API calls."""

    def __init__(
        self,
        redis_url: str = "redis://localhost:6379/0",
        default_ttl: int = 3600,  # 1 hour
        enabled: bool = True,
    ):
        """Initialize response cache.

        Args:
            redis_url: Redis connection URL
            default_ttl: Default TTL in seconds
            enabled: Whether caching is enabled
        """
        self.enabled = enabled
        self.default_ttl = default_ttl
        self.redis_client: Any | None = None

        if enabled:
            try:
                redis_module = importlib.import_module("redis")
                self.redis_client = redis_module.from_url(redis_url, decode_responses=True)
                self.redis_client.ping()
            except Exception:
                # Redis not available, disable caching
                self.enabled = False

    def _make_key(
        self,
        npc_id: str,
        player_id: str,
        prompt: str,
        temperature: float = 0.1,
    ) -> str:
        """Generate cache key from prompt parameters."""
        key_data = f"{npc_id}:{player_id}:{prompt}:{temperature}"
        key_hash = hashlib.sha256(key_data.encode()).hexdigest()
        return f"llm_response:{key_hash}"

    def get(
        self,
        npc_id: str,
        player_id: str,
        prompt: str,
        temperature: float = 0.1,
    ) -> dict[str, Any] | None:
        """Get cached response if available."""
        if not self.enabled or not self.redis_client:
            return None

        try:
            key = self._make_key(npc_id, player_id, prompt, temperature)
            cached = self.redis_client.get(key)
            if cached:
                loaded = json.loads(cached)
                if isinstance(loaded, dict):
                    return loaded
        except Exception:
            pass

        return None

    def set(
        self,
        npc_id: str,
        player_id: str,
        prompt: str,
        response: dict[str, Any],
        temperature: float = 0.1,
        ttl: int | None = None,
    ) -> bool:
        """Cache a response."""
        if not self.enabled or not self.redis_client:
            return False

        try:
            key = self._make_key(npc_id, player_id, prompt, temperature)
            ttl_seconds = ttl or self.default_ttl
            self.redis_client.setex(key, ttl_seconds, json.dumps(response))
            return True
        except Exception:
            pass

        return False

    def clear(self, pattern: str = "llm_response:*") -> int:
        """Clear cached responses matching pattern."""
        if not self.enabled or not self.redis_client:
            return 0

        try:
            keys = self.redis_client.keys(pattern)
            if keys:
                return int(self.redis_client.delete(*keys))
        except Exception:
            pass

        return 0

    def stats(self) -> dict[str, Any]:
        """Get cache statistics."""
        if not self.enabled or not self.redis_client:
            return {"enabled": False}

        try:
            info = self.redis_client.info("stats")
            keys = self.redis_client.keys("llm_response:*")
            return {
                "enabled": True,
                "cached_responses": len(keys) if keys else 0,
                "memory_usage": info.get("used_memory_human", "unknown"),
            }
        except Exception:
            return {"enabled": False, "error": "Could not retrieve stats"}


# Global cache instance
_cache: ResponseCache | None = None


def init_cache(
    redis_url: str = "redis://localhost:6379/0",
    enabled: bool = True,
) -> ResponseCache:
    """Initialize global response cache."""
    global _cache
    _cache = ResponseCache(redis_url=redis_url, enabled=enabled)
    return _cache


def get_cache() -> ResponseCache:
    """Get global response cache instance."""
    global _cache
    if _cache is None:
        _cache = ResponseCache(enabled=False)
    return _cache
