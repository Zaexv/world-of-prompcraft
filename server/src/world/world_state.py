from __future__ import annotations

import asyncio
import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from ..agents.personalities.templates import NPC_PERSONALITIES
from ..config import settings
from ..persistence import SQLiteGameStateStore
from .npc_definitions import get_npc_definitions
from .player_state import PlayerData
from .zones import get_zone, get_zone_description


@dataclass
class NPCData:
    npc_id: str
    name: str
    personality: str
    hp: int = 100
    max_hp: int = 100
    position: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    mood: str = "neutral"
    scale: float = 1.0

    def to_dict(self) -> dict[str, Any]:
        return {
            "npc_id": self.npc_id,
            "name": self.name,
            "hp": self.hp,
            "maxHp": self.max_hp,
            "position": list(self.position),
            "personality": self.personality,
            "mood": self.mood,
            "scale": self.scale,
        }


class WorldState:
    """Singleton-style world state tracker with thread-safe mutations."""

    _instance: WorldState | None = None
    _initialized: bool = False

    def __new__(cls) -> WorldState:
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        self._lock = asyncio.Lock()
        self._store = SQLiteGameStateStore(settings.sqlite_game_db_path)
        self.players: dict[str, PlayerData] = {}
        self.npcs: dict[str, NPCData] = {}
        self._npc_personality_keys: dict[str, str] = {}
        self._npc_archetypes: dict[str, str] = {}
        self._dirty_player_ids: set[str] = set()
        self._world_dirty = False
        self.environment: dict[str, Any] = {
            "weather": "clear",
            "time_of_day": "day",
        }
        self.chat_history: deque[dict[str, Any]] = deque(maxlen=50)
        self.recent_events: deque[str] = deque(maxlen=20)
        self._hydrate_world_snapshot()
        self.refresh_npcs()
        self._hydrate_players()

    def _hydrate_world_snapshot(self) -> None:
        snapshot = self._store.load_world_snapshot()
        if snapshot is None:
            self._store.upsert_world_snapshot(
                dict(self.environment),
                list(self.recent_events),
                list(self.chat_history),
            )
            return

        self.environment.update(snapshot["environment"])
        self.recent_events.clear()
        self.recent_events.extend(snapshot["recent_events"])
        self.chat_history.clear()
        self.chat_history.extend(snapshot["chat_history"])

    def _hydrate_players(self) -> None:
        for player_id, payload in self._store.load_player_records().items():
            self.players[player_id] = PlayerData.from_storage_dict(payload)

    @staticmethod
    def _default_personality_bundle(npc_id: str, personality_key: str | None) -> dict[str, str]:
        resolved_key = personality_key or npc_id
        personality = NPC_PERSONALITIES.get(resolved_key)
        if personality is None:
            return {
                "personality_key": resolved_key,
                "archetype": "custom",
                "system_prompt": "You are a mysterious stranger.",
            }
        return {
            "personality_key": resolved_key,
            "archetype": str(personality.get("archetype", "custom")),
            "system_prompt": str(
                personality.get("system_prompt", "You are a mysterious stranger.")
            ),
        }

    def _npc_record(self, npc_id: str, npc: NPCData) -> dict[str, Any]:
        return {
            "npc_id": npc_id,
            "name": npc.name,
            "hp": npc.hp,
            "max_hp": npc.max_hp,
            "position": list(npc.position),
            "mood": npc.mood,
            "scale": npc.scale,
            "personality_key": self._npc_personality_keys.get(npc_id, npc_id),
            "archetype": self._npc_archetypes.get(npc_id, "custom"),
            "system_prompt": npc.personality,
        }

    def register_npc(
        self,
        npc: NPCData,
        *,
        personality_key: str | None = None,
        archetype: str | None = None,
    ) -> None:
        bundle = self._default_personality_bundle(npc.npc_id, personality_key)
        resolved_key = personality_key or bundle["personality_key"]
        resolved_archetype = archetype or bundle["archetype"]
        if not npc.personality:
            npc.personality = bundle["system_prompt"]

        self.npcs[npc.npc_id] = npc
        self._npc_personality_keys[npc.npc_id] = resolved_key
        self._npc_archetypes[npc.npc_id] = resolved_archetype
        self._store.upsert_npc_record(self._npc_record(npc.npc_id, npc))

    def refresh_npcs(self) -> None:
        """Synchronize in-memory NPCs with manifest + persisted personality/state."""
        definitions = get_npc_definitions()
        persisted_records = self._store.load_npc_records()

        # 1. Remove stale static NPCs that are no longer in the manifest
        current_ids = set(self.npcs.keys())
        manifest_ids = set(definitions.keys())
        for npc_id in current_ids:
            if npc_id in manifest_ids or npc_id.startswith(("proc_", "enc_")):
                continue
            del self.npcs[npc_id]
            self._npc_personality_keys.pop(npc_id, None)
            self._npc_archetypes.pop(npc_id, None)
            self._store.delete_npc_record(npc_id)

        # 2. Add/update all manifest NPCs, with DB state taking precedence
        records_to_upsert: list[dict[str, Any]] = []
        for npc_id, npc_def in definitions.items():
            base_bundle = self._default_personality_bundle(
                npc_id, str(npc_def.get("personality_key", npc_id))
            )
            initial_hp = int(npc_def.get("initial_hp", 100))
            default_position = list(npc_def["position"])
            default_scale = float(npc_def.get("scale", 1.0))

            persisted = persisted_records.get(npc_id)
            if persisted is not None:
                personality_key = str(
                    persisted.get("personality_key") or base_bundle["personality_key"]
                )
                archetype = str(persisted.get("archetype") or base_bundle["archetype"])
                system_prompt = str(persisted.get("system_prompt") or base_bundle["system_prompt"])
                hp = int(persisted.get("hp", initial_hp))
                max_hp = int(persisted.get("max_hp", initial_hp))
                position = list(persisted.get("position", default_position))
                mood = str(persisted.get("mood", "neutral"))
                scale = float(persisted.get("scale", default_scale))
            else:
                personality_key = base_bundle["personality_key"]
                archetype = base_bundle["archetype"]
                system_prompt = base_bundle["system_prompt"]
                hp = initial_hp
                max_hp = initial_hp
                position = default_position
                mood = "neutral"
                scale = default_scale

            self._npc_personality_keys[npc_id] = personality_key
            self._npc_archetypes[npc_id] = archetype
            npc = self.npcs.get(npc_id)
            if npc is None:
                npc = NPCData(
                    npc_id=npc_id,
                    name=str(npc_def["name"]),
                    personality=system_prompt,
                    hp=hp,
                    max_hp=max_hp,
                    position=position,
                    mood=mood,
                    scale=scale,
                )
                self.npcs[npc_id] = npc
            else:
                npc.name = str(npc_def["name"])
                npc.personality = system_prompt
                npc.hp = hp
                npc.max_hp = max_hp
                npc.position = position
                npc.mood = mood
                npc.scale = scale

            records_to_upsert.append(self._npc_record(npc_id, npc))

        if records_to_upsert:
            self._store.upsert_many_npc_records(records_to_upsert)

    def reap_procedural_npcs(self) -> int:
        """Remove procedural NPCs that are far from all players. Returns count removed."""
        if not self.players:
            proc_ids = [nid for nid in self.npcs if nid.startswith(("proc_", "enc_"))]
            for nid in proc_ids:
                del self.npcs[nid]
                self._npc_personality_keys.pop(nid, None)
                self._npc_archetypes.pop(nid, None)
                self._store.delete_npc_record(nid)
            return len(proc_ids)

        reap_count = 0
        proc_ids = [nid for nid in self.npcs if nid.startswith(("proc_", "enc_"))]
        for nid in proc_ids:
            npc = self.npcs[nid]
            is_near_anyone = False
            for player in self.players.values():
                dx = npc.position[0] - player.position[0]
                dz = npc.position[2] - player.position[2]
                if (dx * dx + dz * dz) < 500 * 500:
                    is_near_anyone = True
                    break

            if not is_near_anyone:
                del self.npcs[nid]
                self._npc_personality_keys.pop(nid, None)
                self._npc_archetypes.pop(nid, None)
                self._store.delete_npc_record(nid)
                reap_count += 1

        return reap_count

    # ---- Persistence ----

    async def persist_player(self, player_id: str) -> None:
        async with self._lock:
            player = self.players.get(player_id)
            if player is None:
                return
            snapshot = player.to_storage_dict()
            self._dirty_player_ids.discard(player_id)
        await asyncio.to_thread(self._store.upsert_player_record, player_id, snapshot)

    async def flush_dirty_state(self) -> None:
        async with self._lock:
            player_snapshots = {
                pid: self.players[pid].to_storage_dict()
                for pid in list(self._dirty_player_ids)
                if pid in self.players
            }
            self._dirty_player_ids.clear()

            world_snapshot: tuple[dict[str, Any], list[str], list[dict[str, Any]]] | None = None
            if self._world_dirty:
                world_snapshot = (
                    dict(self.environment),
                    list(self.recent_events),
                    list(self.chat_history),
                )
                self._world_dirty = False

        if player_snapshots:
            await asyncio.to_thread(self._store.upsert_many_player_records, player_snapshots)
        if world_snapshot is not None:
            await asyncio.to_thread(
                self._store.upsert_world_snapshot,
                world_snapshot[0],
                world_snapshot[1],
                world_snapshot[2],
            )

    async def persist_all_state(self) -> None:
        async with self._lock:
            player_snapshots = {
                pid: player.to_storage_dict() for pid, player in self.players.items()
            }
            npc_records = [self._npc_record(npc_id, npc) for npc_id, npc in self.npcs.items()]
            world_snapshot = (
                dict(self.environment),
                list(self.recent_events),
                list(self.chat_history),
            )
            self._dirty_player_ids.clear()
            self._world_dirty = False

        if player_snapshots:
            await asyncio.to_thread(self._store.upsert_many_player_records, player_snapshots)
        if npc_records:
            await asyncio.to_thread(self._store.upsert_many_npc_records, npc_records)
        await asyncio.to_thread(
            self._store.upsert_world_snapshot,
            world_snapshot[0],
            world_snapshot[1],
            world_snapshot[2],
        )

    # ---- Player helpers ----

    def get_player(self, player_id: str) -> PlayerData:
        if player_id not in self.players:
            self.players[player_id] = PlayerData()
            self._dirty_player_ids.add(player_id)
        return self.players[player_id]

    async def update_player(self, player_id: str, updates: dict[str, Any]) -> None:
        player_snapshot: dict[str, Any] | None = None
        async with self._lock:
            player = self.get_player(player_id)
            changed_keys: set[str] = set()
            for key, value in updates.items():
                if hasattr(player, key):
                    setattr(player, key, value)
                    changed_keys.add(key)

            if not changed_keys:
                return

            if changed_keys.difference({"position", "yaw"}):
                player_snapshot = player.to_storage_dict()
                self._dirty_player_ids.discard(player_id)
            else:
                self._dirty_player_ids.add(player_id)

        if player_snapshot is not None:
            await asyncio.to_thread(self._store.upsert_player_record, player_id, player_snapshot)

    def get_nearby_players(self, position: list[float], radius: float) -> dict[str, dict[str, Any]]:
        """Return public dicts of players within *radius* (XZ distance) of *position*."""
        result: dict[str, dict[str, Any]] = {}
        for pid, player in self.players.items():
            dx = position[0] - player.position[0]
            dz = position[2] - player.position[2] if len(position) > 2 else 0.0
            dist = math.sqrt(dx * dx + dz * dz)
            if dist <= radius:
                result[pid] = player.to_public_dict()
        return result

    # ---- Chat helpers ----

    def add_chat_message(self, player_id: str, text: str) -> dict[str, Any]:
        """Store a chat message and return the entry."""
        entry: dict[str, Any] = {
            "player": player_id,
            "text": text,
            "timestamp": time.time(),
        }
        self.chat_history.append(entry)
        self._world_dirty = True
        return entry

    def get_recent_chat(self, limit: int = 10) -> list[dict[str, Any]]:
        """Return the most recent *limit* chat messages."""
        items = list(self.chat_history)
        return items[-limit:]

    # ---- NPC helpers ----

    def get_npc(self, npc_id: str) -> NPCData | None:
        return self.npcs.get(npc_id)

    def get_npc_config(self, npc_id: str) -> dict[str, Any]:
        npc = self.npcs.get(npc_id)
        if npc is None:
            return {"name": "Unknown", "personality": "You are a mysterious stranger."}
        return {"name": npc.name, "personality": npc.personality}

    def get_nearby_npcs(
        self,
        position: list[float],
        radius: float,
        *,
        limit: int | None = None,
    ) -> list[NPCData]:
        """Return nearest living NPCs within radius (XZ distance) of the given position."""
        if limit is not None and limit <= 0:
            return []

        radius_sq = radius * radius
        ranked: list[tuple[float, NPCData]] = []
        for npc in self.npcs.values():
            if npc.hp <= 0:
                continue
            dx = position[0] - npc.position[0]
            dz = position[2] - npc.position[2] if len(position) > 2 else 0.0
            dist_sq = dx * dx + dz * dz
            if dist_sq <= radius_sq:
                ranked.append((dist_sq, npc))

        ranked.sort(key=lambda item: item[0])
        if limit is None:
            return [npc for _, npc in ranked]
        return [npc for _, npc in ranked[:limit]]

    # ---- Context ----

    def get_context_for_npc(self, npc_id: str, player_id: str) -> dict[str, Any]:
        """Build a world-context snapshot for an NPC interaction."""
        player = self.get_player(player_id)  # Ensure player exists
        npc = self.npcs.get(npc_id)

        npc_pos = npc.position if npc else [0.0, 0.0, 0.0]
        zone_name = get_zone(npc_pos)

        nearby: list[dict[str, Any]] = []
        for other_id, other_npc in self.npcs.items():
            if other_id == npc_id:
                continue
            dist = math.sqrt(
                sum((a - b) ** 2 for a, b in zip(npc_pos, other_npc.position, strict=True))
            )
            if dist < 50.0:
                nearby.append({"name": other_npc.name, "distance": round(dist, 1)})

        return {
            "npc_id": npc_id,
            "npc_name": npc.name if npc else "Unknown",
            "npc_hp": npc.hp if npc else 0,
            "npc_max_hp": npc.max_hp if npc else 0,
            "npc_mood": npc.mood if npc else "neutral",
            "zone": zone_name,
            "zone_description": get_zone_description(zone_name),
            "time_of_day": self.environment.get("time_of_day", "day"),
            "weather": self.environment.get("weather", "clear"),
            "nearby_entities": nearby,
            "recent_chat": self.get_recent_chat(10),
            "recent_events": list(self.recent_events)[-5:],
            "player_active_quests": list(player.active_quests),
            "player_completed_quests": list(player.completed_quests),
            "player_kill_count": player.kill_count,
        }

    # ---- Actions ----

    async def apply_actions(self, actions: list[dict[str, Any]]) -> None:
        """Mutate world state based on a list of action dicts."""
        touched_players: set[str] = set()
        touched_npcs: set[str] = set()
        world_changed = False

        async with self._lock:
            for action in actions:
                kind = action.get("kind")
                params = action.get("params", {})

                if kind in ("damage_player", "damage"):
                    target = params.get("target", "player")
                    pid = str(params.get("player_id", ""))
                    amount = int(params.get("amount", 0))
                    if target == "player" or kind == "damage_player":
                        resolved_pid = pid or "default"
                        player = self.get_player(resolved_pid)
                        player.hp = max(0, player.hp - amount)
                        touched_players.add(resolved_pid)
                    else:
                        npc = self.npcs.get(str(target))
                        if npc:
                            npc.hp = max(0, npc.hp - amount)
                            touched_npcs.add(npc.npc_id)
                            if npc.hp <= 0:
                                self.recent_events.append(f"{npc.name} was defeated")
                                world_changed = True

                elif kind in ("heal_player", "heal"):
                    target = params.get("target", "player")
                    pid = str(params.get("player_id", ""))
                    amount = int(params.get("amount", 0))
                    if target == "player" or kind == "heal_player":
                        resolved_pid = pid or "default"
                        player = self.get_player(resolved_pid)
                        player.hp = min(player.max_hp, player.hp + amount)
                        touched_players.add(resolved_pid)

                elif kind == "give_item":
                    pid = str(params.get("player_id", ""))
                    item = str(params.get("item", ""))
                    if item:
                        player = self.get_player(pid)
                        player.inventory.append(item)
                        touched_players.add(pid)

                elif kind in ("remove_item", "take_item"):
                    pid = str(params.get("player_id", ""))
                    item = str(params.get("item", ""))
                    player = self.get_player(pid)
                    if item in player.inventory:
                        player.inventory.remove(item)
                        touched_players.add(pid)

                elif kind == "update_npc_mood":
                    nid = str(params.get("npc_id", ""))
                    mood = str(params.get("mood", "neutral"))
                    npc = self.npcs.get(nid)
                    if npc:
                        npc.mood = mood
                        touched_npcs.add(nid)

                elif kind == "damage_npc":
                    nid = str(params.get("npc_id", ""))
                    amount = int(params.get("amount", 0))
                    npc = self.npcs.get(nid)
                    if npc:
                        npc.hp = max(0, npc.hp - amount)
                        touched_npcs.add(nid)

                elif kind == "change_weather":
                    weather = str(params.get("weather", "clear"))
                    self.environment["weather"] = weather
                    self.recent_events.append(f"Weather changed to {weather}")
                    world_changed = True

                elif kind == "start_quest":
                    pid = str(params.get("player_id", "")) or "default"
                    quest_id = str(params.get("quest_id", params.get("questId", "")))
                    if quest_id:
                        player = self.get_player(pid)
                        player.start_quest(quest_id)
                        touched_players.add(pid)
                        self.recent_events.append(f"{pid} started quest {quest_id}")
                        world_changed = True

                elif kind == "complete_quest":
                    pid = str(params.get("player_id", "")) or "default"
                    quest_id = str(params.get("quest_id", params.get("questId", "")))
                    if quest_id:
                        player = self.get_player(pid)
                        player.complete_quest(quest_id)
                        from .quest_definitions import QUEST_DEFINITIONS

                        quest_def = QUEST_DEFINITIONS.get(quest_id)
                        if quest_def and quest_def.reward_item:
                            player.inventory.append(quest_def.reward_item)
                        touched_players.add(pid)
                        self.recent_events.append(f"{pid} completed quest {quest_id}")
                        world_changed = True

                elif kind == "move_npc":
                    nid = str(params.get("npc_id", ""))
                    position = params.get("position")
                    npc = self.npcs.get(nid)
                    if npc and isinstance(position, list) and len(position) >= 3:
                        y = position[1]
                        npc.position = [
                            float(position[0]),
                            float(npc.position[1] if y is None else y),
                            float(position[2]),
                        ]
                        touched_npcs.add(nid)

                # spawn_effect, emote are purely visual — client only

            player_snapshots = {
                pid: self.players[pid].to_storage_dict()
                for pid in touched_players
                if pid in self.players
            }
            npc_records = [
                self._npc_record(nid, self.npcs[nid]) for nid in touched_npcs if nid in self.npcs
            ]
            world_snapshot: tuple[dict[str, Any], list[str], list[dict[str, Any]]] | None = None
            if world_changed or self._world_dirty:
                world_snapshot = (
                    dict(self.environment),
                    list(self.recent_events),
                    list(self.chat_history),
                )
                self._world_dirty = False

        if player_snapshots:
            await asyncio.to_thread(self._store.upsert_many_player_records, player_snapshots)
        if npc_records:
            await asyncio.to_thread(self._store.upsert_many_npc_records, npc_records)
        if world_snapshot is not None:
            await asyncio.to_thread(
                self._store.upsert_world_snapshot,
                world_snapshot[0],
                world_snapshot[1],
                world_snapshot[2],
            )
