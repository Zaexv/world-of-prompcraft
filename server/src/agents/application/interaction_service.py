from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Protocol


@dataclass(slots=True)
class InteractionRequest:
    npc_id: str
    player_id: str
    prompt: str
    player_state: dict[str, Any]
    state_fingerprint: str


class AgentInteractionPort(Protocol):
    async def invoke(
        self, npc_id: str, player_id: str, prompt: str, player_state: dict[str, Any]
    ) -> dict[str, Any]: ...


class ResponseCachePort(Protocol):
    def get(self, key: str) -> dict[str, Any] | None: ...
    def set(self, key: str, value: dict[str, Any]) -> None: ...


def build_state_fingerprint(
    player_state: dict[str, Any],
    world_context: dict[str, Any],
) -> str:
    """Build a deterministic fingerprint for cache safety."""
    minimal = {
        "player": {
            "hp": player_state.get("hp"),
            "maxHp": player_state.get("maxHp"),
            "mana": player_state.get("mana"),
            "maxMana": player_state.get("maxMana"),
            "level": player_state.get("level"),
            "inventory": player_state.get("inventory", []),
            "active_quests": player_state.get("active_quests", []),
            "completed_quests": player_state.get("completed_quests", []),
            "kill_count": player_state.get("kill_count", 0),
        },
        "world": {
            "npc_id": world_context.get("npc_id"),
            "npc_name": world_context.get("npc_name"),
            "npc_hp": world_context.get("npc_hp"),
            "npc_max_hp": world_context.get("npc_max_hp"),
            "npc_mood": world_context.get("npc_mood"),
            "zone": world_context.get("zone"),
            "time_of_day": world_context.get("time_of_day"),
            "weather": world_context.get("weather"),
            "recent_chat": world_context.get("recent_chat", []),
            "recent_events": world_context.get("recent_events", []),
            "player_active_quests": world_context.get("player_active_quests", []),
            "player_completed_quests": world_context.get("player_completed_quests", []),
            "player_kill_count": world_context.get("player_kill_count", 0),
        },
    }
    payload = json.dumps(minimal, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class InteractionService:
    """Application-layer orchestrator for NPC interactions."""

    def __init__(self, agent_port: AgentInteractionPort, cache_port: ResponseCachePort) -> None:
        self._agent_port = agent_port
        self._cache_port = cache_port

    @staticmethod
    def _cache_key(request: InteractionRequest) -> str:
        payload = (
            f"{request.npc_id}|{request.player_id}|{request.prompt}|{request.state_fingerprint}"
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    async def run(self, request: InteractionRequest) -> dict[str, Any]:
        key = self._cache_key(request)
        cached = self._cache_port.get(key)
        if cached is not None:
            return cached

        result = await self._agent_port.invoke(
            request.npc_id,
            request.player_id,
            request.prompt,
            request.player_state,
        )

        # Preserve behavior: avoid caching state-mutating action turns.
        if not result.get("actions"):
            self._cache_port.set(key, result)

        return result
