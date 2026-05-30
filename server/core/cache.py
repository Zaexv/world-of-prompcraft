import hashlib

import redis.asyncio as redis
from server.core.config import settings


class ResponseCache:
    def __init__(self):
        self.redis = (
            redis.from_url(settings.REDIS_URL, decode_responses=True)
            if settings.CACHE_ENABLED
            else None
        )

    def _generate_key(self, npc_id: str, player_id: str, message: str) -> str:
        payload = f"{npc_id}:{player_id}:{message}"
        return hashlib.sha256(payload.encode()).hexdigest()

    async def get_response(self, npc_id: str, player_id: str, message: str) -> str | None:
        if not self.redis:
            return None
        key = self._generate_key(npc_id, player_id, message)
        return await self.redis.get(key)

    async def set_response(self, npc_id: str, player_id: str, message: str, response: str):
        if not self.redis:
            return
        key = self._generate_key(npc_id, player_id, message)
        await self.redis.set(key, response, ex=settings.CACHE_TTL)


response_cache = ResponseCache()
