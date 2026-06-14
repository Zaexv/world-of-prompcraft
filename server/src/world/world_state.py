from __future__ import annotations

import asyncio
import logging
import math
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from ..agents.personalities.archetypes import get_archetype
from ..agents.personalities.templates import NPC_PERSONALITIES
from .designed_npcs import load_designed_npcs
from .npc_definitions import get_npc_definitions
from .player_state import PlayerData
from .zones import get_zone, get_zone_description

logger = logging.getLogger(__name__)


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
    # Archetype (e.g. "hostile_boss", "friendly_merchant") drives the instant,
    # deterministic combat reply so attacks don't wait on the LLM.
    archetype: str = ""
    # Tool categories this NPC may call (set from its archetype). ``None`` means
    # "all tools" — the back-compat default before archetype gating.
    allowed_tools: list[str] | None = None
    style: str | None = None
    appearance: dict[str, Any] | None = None
    # Set once gold + loot have been awarded for this NPC's death so repeated
    # interactions with the corpse don't keep paying out.
    loot_dropped: bool = False

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "npc_id": self.npc_id,
            "name": self.name,
            "hp": self.hp,
            "maxHp": self.max_hp,
            "position": list(self.position),
            "personality": self.personality,
            "archetype": self.archetype,
            "mood": self.mood,
            "scale": self.scale,
        }
        if self.style is not None:
            d["style"] = self.style
        if self.appearance is not None:
            d["appearance"] = self.appearance
        return d


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
        self.players: dict[str, PlayerData] = {}
        self.npcs: dict[str, NPCData] = {}
        self.environment: dict[str, Any] = {
            "weather": "clear",
            "time_of_day": "day",
        }
        self.chat_history: deque[dict[str, Any]] = deque(maxlen=50)
        self.recent_events: deque[str] = deque(maxlen=20)
        # Player-built world objects, keyed by object id. Each value is the full
        # spawn params dict (objectId, objectType, position, scale, label, spec?).
        self.world_objects: dict[str, dict[str, Any]] = {}
        self.refresh_npcs()
        # World objects are loaded from the persistence store at startup (lifespan),
        # not here — WorldState stays free of any storage backend.

    def refresh_npcs(self) -> None:
        """Synchronize in-memory NPCs with the manifest definitions."""
        definitions = get_npc_definitions()

        # 1. Remove NPCs that are no longer in the manifest. Runtime-registered
        # procedural NPCs (proc_/enc_) are never manifest entries — keep them,
        # otherwise every join wipes their state (including deaths).
        current_ids = set(self.npcs.keys())
        manifest_ids = set(definitions.keys())
        for npc_id in current_ids - manifest_ids:
            # proc_/enc_ are procedural; des_ are NPC-Designer creations — both
            # are non-manifest and must survive a manifest refresh.
            if not npc_id.startswith(("proc_", "enc_", "des_")):
                del self.npcs[npc_id]

        # 2. Add or update NPCs from the manifest
        for npc_id, npc_def in definitions.items():
            personality_key = npc_def.get("personality_key", npc_id)
            personality = NPC_PERSONALITIES.get(personality_key, {})
            system_prompt = personality.get("system_prompt", "You are a mysterious stranger.")
            archetype = personality.get("archetype", npc_def.get("role", ""))
            # Editor-authored NPC designer fields override the personality_key
            # lookup: inline archetype sets tools, inline flavor_prompt is the voice.
            if npc_def.get("archetype"):
                archetype = npc_def["archetype"]
            if npc_def.get("flavor_prompt"):
                system_prompt = npc_def["flavor_prompt"]
            # The archetype dictates which tool categories this NPC may call. An
            # unknown archetype falls back to None → all tools (back-compat) and
            # is warned about so it surfaces in logs.
            arch = get_archetype(archetype)
            if archetype and arch is None:
                logger.warning(
                    "NPC %s has unknown archetype %r — granting all tools", npc_id, archetype
                )
            allowed_tools = list(arch.allowed_tools) if arch is not None else None
            initial_hp = npc_def.get("initial_hp", arch.default_hp if arch is not None else 100)

            if npc_id in self.npcs:
                # Update existing (preserving dynamic state like current HP)
                self.npcs[npc_id].name = npc_def["name"]
                self.npcs[npc_id].personality = system_prompt
                self.npcs[npc_id].archetype = archetype
                self.npcs[npc_id].allowed_tools = allowed_tools
                self.npcs[npc_id].position = list(npc_def["position"])
                self.npcs[npc_id].scale = npc_def.get("scale", 1.0)
                self.npcs[npc_id].style = npc_def.get("style")
                self.npcs[npc_id].appearance = npc_def.get("appearance")
            else:
                # Add new
                npc = NPCData(
                    npc_id=npc_id,
                    name=npc_def["name"],
                    personality=system_prompt,
                    hp=initial_hp,
                    max_hp=initial_hp,
                    position=list(npc_def["position"]),
                    scale=npc_def.get("scale", 1.0),
                    archetype=archetype,
                    allowed_tools=allowed_tools,
                    style=npc_def.get("style"),
                    appearance=npc_def.get("appearance"),
                )
                self.npcs[npc_id] = npc

        # 3. Merge in NPC-Designer creations (durable, non-manifest).
        for record in load_designed_npcs().values():
            self.upsert_designed_npc(record)

    def upsert_designed_npc(self, record: dict[str, Any]) -> NPCData:
        """Create or update an in-memory NPC from a designer spec record.

        ``record`` keys: npc_id, name, archetype, flavor_prompt, initial_hp,
        position. The archetype sets ``allowed_tools`` (the tool limit). Returns
        the live NPCData. Preserves dynamic HP/mood on update.
        """
        npc_id = record["npc_id"]
        archetype = record.get("archetype", "")
        arch = get_archetype(archetype)
        allowed_tools = list(arch.allowed_tools) if arch is not None else None
        personality = record.get("flavor_prompt", "") or "You are a mysterious stranger."
        hp = int(record.get("initial_hp", arch.default_hp if arch is not None else 100))
        position = list(record.get("position", [0.0, 0.0, 0.0]))

        if npc_id in self.npcs:
            npc = self.npcs[npc_id]
            npc.name = record.get("name", npc.name)
            npc.personality = personality
            npc.archetype = archetype
            npc.allowed_tools = allowed_tools
        else:
            npc = NPCData(
                npc_id=npc_id,
                name=record.get("name", "Stranger"),
                personality=personality,
                hp=hp,
                max_hp=hp,
                position=position,
                archetype=archetype,
                allowed_tools=allowed_tools,
            )
            self.npcs[npc_id] = npc
        return npc

    # ---- Player helpers ----

    def get_player(self, player_id: str) -> PlayerData:
        if player_id not in self.players:
            self.players[player_id] = PlayerData()
        return self.players[player_id]

    async def update_player(self, player_id: str, updates: dict[str, Any]) -> None:
        async with self._lock:
            player = self.get_player(player_id)
            for key, value in updates.items():
                if hasattr(player, key):
                    setattr(player, key, value)

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

    def get_nearby_npcs(self, position: list[float], radius: float) -> list[NPCData]:
        """Return NPCs within radius (XZ distance) of the given position."""
        result: list[NPCData] = []
        for npc in self.npcs.values():
            dx = position[0] - npc.position[0]
            dz = position[2] - npc.position[2] if len(position) > 2 else 0.0
            dist = math.sqrt(dx * dx + dz * dz)
            if dist <= radius and npc.hp > 0:
                result.append(npc)
        return result

    # ---- World objects (player-built, shared + persisted) ----

    def add_world_object(self, params: dict[str, Any]) -> None:
        """Insert or replace a player-built object, keyed by its objectId."""
        object_id = params.get("objectId")
        if not object_id:
            return
        self.world_objects[str(object_id)] = params

    def remove_world_object(self, object_id: str) -> None:
        self.world_objects.pop(object_id, None)

    def get_world_objects(self) -> list[dict[str, Any]]:
        return list(self.world_objects.values())

    def apply_world_action(self, action: dict[str, Any]) -> None:
        """Mutate the world-object store from a world_spawn / world_remove action."""
        kind = action.get("kind")
        params = action.get("params", {})
        if kind == "world_spawn":
            self.add_world_object(params)
        elif kind == "world_remove":
            self.remove_world_object(str(params.get("objectId", "")))

    def world_objects_map(self) -> dict[str, dict[str, Any]]:
        """Return a shallow copy of object_id → params for persistence."""
        return dict(self.world_objects)

    # ---- Context ----

    def get_context_for_npc(self, npc_id: str, player_id: str) -> dict[str, Any]:
        """Build a world-context snapshot for an NPC interaction."""
        self.get_player(player_id)  # Ensure player exists
        npc = self.npcs.get(npc_id)

        npc_pos = npc.position if npc else [0.0, 0.0, 0.0]
        zone_name = get_zone(npc_pos)

        # Gather nearby entities (NPCs within 50 units)
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
            "zone": zone_name,
            "zone_description": get_zone_description(zone_name),
            "time_of_day": self.environment.get("time_of_day", "day"),
            "weather": self.environment.get("weather", "clear"),
            "nearby_entities": nearby,
            "recent_chat": self.get_recent_chat(10),
            "recent_events": list(self.recent_events)[-5:],
        }

    # ---- Actions ----

    async def apply_actions(self, actions: list[dict[str, Any]]) -> None:
        """Mutate world state based on a list of action dicts."""
        async with self._lock:
            # Reward feedback (give_gold/give_item/grant_xp/complete_quest) produced
            # while completing a quest. Collected here and appended to ``actions``
            # AFTER the loop so the client renders the reward banners without these
            # being re-processed (which would double-credit gold/items).
            reward_actions: list[dict[str, Any]] = []
            for action in actions:
                kind = action.get("kind")
                params = action.get("params", {})

                if kind in ("damage_player", "damage"):
                    # "damage" is emitted by combat tools with target in params
                    target = params.get("target", "player")
                    pid = params.get("player_id", "")
                    amount = params.get("amount", 0)
                    # Damage a named NPC only when the target is a known NPC id.
                    # Anything else (the literal "player", or a value the model
                    # mis-supplied like a damage type) targets the player — an NPC
                    # dealing damage is, by default, attacking the player.
                    if kind != "damage_player" and target in self.npcs:
                        target_npc = self.npcs[target]
                        target_npc.hp = max(0, target_npc.hp - amount)
                        if target_npc.hp <= 0:
                            self.recent_events.append(f"{target_npc.name} was defeated")
                    else:
                        player = self.get_player(pid or "default")
                        player.hp = max(0, player.hp - amount)

                elif kind in ("heal_player", "heal"):
                    target = params.get("target", "player")
                    pid = params.get("player_id", "")
                    amount = params.get("amount", 0)
                    if target == "player" or kind == "heal_player":
                        player = self.get_player(pid or "default")
                        player.hp = min(player.max_hp, player.hp + amount)

                elif kind == "give_item":
                    pid = params.get("player_id", "")
                    item = params.get("item", "")
                    if item:
                        player = self.get_player(pid)
                        player.inventory.append(item)

                elif kind == "give_gold":
                    pid = params.get("player_id", "")
                    amount = params.get("amount", 0)
                    if amount:
                        player = self.get_player(pid)
                        player.gold = max(0, player.gold + amount)

                elif kind == "complete_purchase":
                    pid = params.get("player_id", "")
                    item = params.get("item", "")
                    price = params.get("price", 0)
                    player = self.get_player(pid)
                    if player.gold >= price:
                        player.gold = max(0, player.gold - price)
                        if item:
                            player.inventory.append(item)

                elif kind == "sell_item":
                    # Player sells an item to a merchant: remove item, gain gold.
                    pid = params.get("player_id", "")
                    item = params.get("item", "")
                    price = params.get("price", 0)
                    player = self.get_player(pid)
                    if item in player.inventory:
                        player.inventory.remove(item)
                        player.gold = max(0, player.gold + price)

                elif kind in ("remove_item", "take_item"):
                    pid = params.get("player_id", "")
                    item = params.get("item", "")
                    player = self.get_player(pid)
                    if item in player.inventory:
                        player.inventory.remove(item)

                elif kind == "update_npc_mood":
                    nid = params.get("npc_id", "")
                    mood = params.get("mood", "neutral")
                    npc = self.npcs.get(nid)
                    if npc:
                        npc.mood = mood

                elif kind == "damage_npc":
                    nid = params.get("npc_id", "")
                    amount = params.get("amount", 0)
                    npc = self.npcs.get(nid)
                    if npc:
                        npc.hp = max(0, npc.hp - amount)

                elif kind == "change_weather":
                    weather = params.get("weather", "clear")
                    self.environment["weather"] = weather
                    self.recent_events.append(f"Weather changed to {weather}")

                elif kind in ("accept_quest", "start_quest"):
                    # Full server-authoritative instance offered by an NPC.
                    pid = params.get("player_id", "")
                    quest = params.get("quest")
                    if isinstance(quest, dict):
                        player = self.get_player(pid)
                        if player.accept_quest(quest):
                            self.recent_events.append(f"{pid} started quest {quest.get('id', '')}")
                    else:
                        # Legacy curated-by-id path.
                        quest_id = params.get("quest_id", "")
                        if quest_id:
                            player = self.get_player(pid)
                            if player.accept_template(quest_id):
                                self.recent_events.append(f"{pid} started quest {quest_id}")

                elif kind == "advance_objective":
                    pid = params.get("player_id", "")
                    quest_id = params.get("quest_id", "")
                    objective_id = params.get("objective_id", "")
                    if quest_id and objective_id:
                        player = self.get_player(pid)
                        player.advance_objective(quest_id, objective_id)
                        # Auto-complete + pay out if this finished the quest.
                        if player.all_objectives_complete(quest_id):
                            from .quest_progress import complete_and_reward

                            reward_actions.extend(complete_and_reward(player, quest_id))

                elif kind == "complete_quest":
                    pid = params.get("player_id", "")
                    quest_id = params.get("quest_id", "")
                    if quest_id:
                        from .quest_progress import complete_and_reward

                        player = self.get_player(pid)
                        # Drop the duplicate complete_quest banner — the originating
                        # action already carries it; keep only the reward feedback.
                        reward_actions.extend(
                            a
                            for a in complete_and_reward(player, quest_id)
                            if a.get("kind") != "complete_quest"
                        )
                        self.recent_events.append(f"{pid} completed quest {quest_id}")

                elif kind == "move_npc":
                    # Sync NPC position server-side
                    nid = params.get("npc_id", "")
                    position = params.get("position")
                    npc = self.npcs.get(nid)
                    if npc and isinstance(position, list) and len(position) >= 3:
                        npc.position = [float(position[0]), float(position[1]), float(position[2])]

                # spawn_effect, emote are purely visual — client only

            # Surface quest reward feedback to the client. Appended post-loop so it
            # is sent (the caller forwards this same list) but not re-applied.
            actions.extend(reward_actions)
