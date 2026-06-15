"""Django-ORM-backed game-state store.

Persists the full durable game state into the embedded Django schema
(:mod:`src.persistence.gamedata.models`):

- **Player** + **PlayerInventory** (relational stacks) + **CompletedQuest** —
  the player's vitals, gold, inventory, quests and equipped gear.
- **NPCState** — mutable NPC hp / position / loot flag / mood (identity always
  comes from the manifest or runtime registration, so restoring is an overlay).
- **NPCRelationship** — queryable mirror of per-(npc, player) relationship.
- **WorldObject** — player-built world-builder spawns.

Every method here is *synchronous* Django ORM. Callers on the event loop wrap
them in ``asyncio.to_thread`` (Django forbids sync ORM directly inside the async
loop); synchronous callers and tests use them directly. Each call is a tiny
single-row write or a bounded read invoked at low frequency (join, disconnect,
periodic tick, shutdown), so this stays cheap.
"""

from __future__ import annotations

import logging
from collections import Counter
from typing import TYPE_CHECKING, Any

from django.db import transaction

from .django_setup import setup_django

# Ensure the ORM is configured before the models are imported. Idempotent — a
# no-op when Django is already set up (server lifespan, pytest-django, manage.py).
setup_django()

from .gamedata.models import (  # noqa: E402  (must follow setup_django)
    CompletedQuest,
    NPCRelationship,
    NPCState,
    Player,
    PlayerInventory,
    WorldObject,
)

if TYPE_CHECKING:
    from ..world.world_state import WorldState

logger = logging.getLogger(__name__)

# Scalar Player columns mirrored 1:1 with PlayerData fields.
_PLAYER_SCALARS = (
    "hp",
    "max_hp",
    "mana",
    "max_mana",
    "level",
    "gold",
    "kill_count",
    "race",
    "faction",
    "yaw",
)


class GameStore:
    """Persist and restore the mutable game state via the Django ORM."""

    def __init__(self, db_path: str | object | None = None) -> None:
        # db_path is accepted for backward call-site compatibility but ignored:
        # the database is configured globally in django_settings.
        setup_django()

    # ── Players ───────────────────────────────────────────────────────────────

    def save_player(self, player_id: str, player: Any) -> None:
        """Upsert a player's scalar state + relational inventory + completed quests."""
        scalars = {field: getattr(player, field) for field in _PLAYER_SCALARS}
        scalars["position"] = list(player.position)
        scalars["active_quests"] = list(player.active_quests)
        scalars["equipped"] = dict(getattr(player, "equipped", {}) or {})

        with transaction.atomic():
            row, _ = Player.objects.update_or_create(username=player_id, defaults=scalars)

            # Inventory: collapse the flat list[str] into stacked rows.
            row.items.all().delete()
            counts = Counter(player.inventory)
            if counts:
                PlayerInventory.objects.bulk_create(
                    [
                        PlayerInventory(player=row, item_name=name, quantity=qty)
                        for name, qty in counts.items()
                    ]
                )

            # Completed quests (with display title so names survive a reload).
            row.completed.all().delete()
            completed = list(dict.fromkeys(player.completed_quests))  # de-dup, keep order
            names = getattr(player, "completed_quest_names", {}) or {}
            if completed:
                CompletedQuest.objects.bulk_create(
                    [
                        CompletedQuest(player=row, quest_id=qid, name=names.get(qid, ""))
                        for qid in completed
                    ]
                )

    def load_player(self, player_id: str) -> dict[str, Any] | None:
        """Return the persisted player as a ``PlayerData(**doc)``-compatible dict."""
        row = Player.objects.filter(pk=player_id).first()
        if row is None:
            return None

        # Expand stacked inventory back into the flat list[str] runtime shape.
        inventory: list[str] = []
        for item in row.items.all():
            inventory.extend([item.item_name] * max(0, item.quantity))

        completed_rows = list(row.completed.values_list("quest_id", "name"))

        doc: dict[str, Any] = {field: getattr(row, field) for field in _PLAYER_SCALARS}
        doc["username"] = row.username
        doc["position"] = list(row.position)
        doc["active_quests"] = list(row.active_quests)
        doc["completed_quests"] = [qid for qid, _ in completed_rows]
        doc["completed_quest_names"] = {qid: nm for qid, nm in completed_rows if nm}
        doc["inventory"] = inventory
        doc["equipped"] = dict(row.equipped or {})
        return doc

    # ── NPCs ──────────────────────────────────────────────────────────────────

    def save_npc(self, npc: Any) -> None:
        """Upsert an NPC's mutable state (hp, position, loot flag, mood)."""
        NPCState.objects.update_or_create(
            npc_id=npc.npc_id,
            defaults={
                "hp": npc.hp,
                "position": list(npc.position),
                "loot_dropped": bool(npc.loot_dropped),
                "mood": getattr(npc, "mood", "neutral") or "neutral",
            },
        )

    def load_npc_overrides(self) -> dict[str, dict[str, Any]]:
        """Return npc_id → {hp, position, loot_dropped, mood} for all persisted NPCs."""
        overrides: dict[str, dict[str, Any]] = {}
        for row in NPCState.objects.all():
            overrides[row.npc_id] = {
                "hp": row.hp,
                "position": list(row.position),
                "loot_dropped": bool(row.loot_dropped),
                "mood": row.mood,
            }
        return overrides

    # ── Whole-world snapshot / restore ────────────────────────────────────────

    def save_world(self, world_state: WorldState) -> None:
        """Persist every player and every NPC's mutable state in one transaction."""
        with transaction.atomic():
            for player_id, player in world_state.players.items():
                self.save_player(player_id, player)
            for npc in world_state.npcs.values():
                self.save_npc(npc)

    def restore_world(self, world_state: WorldState) -> int:
        """Overlay persisted state onto a freshly built WorldState.

        Players are lazy-loaded on join. NPC overrides apply only to NPCs that
        already exist (manifest) — except dead procedural NPCs, which are
        recreated as corpses so ``join_ok`` reports them dead and clients refuse
        to respawn them. Returns the number of restored NPC rows.
        """
        from ..world.world_state import NPCData

        restored = 0
        for npc_id, override in self.load_npc_overrides().items():
            npc = world_state.npcs.get(npc_id)
            if npc is not None:
                npc.hp = int(override["hp"])
                npc.position = [float(c) for c in override["position"]]
                npc.loot_dropped = bool(override["loot_dropped"])
                npc.mood = str(override.get("mood", "neutral"))
                restored += 1
            elif npc_id.startswith(("proc_", "enc_")) and int(override["hp"]) <= 0:
                world_state.npcs[npc_id] = NPCData(
                    npc_id=npc_id,
                    name="Slain creature",
                    personality="dead",
                    hp=0,
                    max_hp=1,
                    position=[float(c) for c in override["position"]],
                    mood=str(override.get("mood", "neutral")),
                    loot_dropped=bool(override["loot_dropped"]),
                )
                restored += 1

        return restored

    # ── World objects (player-built) ──────────────────────────────────────────

    def load_world_objects(self) -> dict[str, dict[str, Any]]:
        """Return object_id → spawn-params dict for every persisted world object."""
        return {row.object_id: dict(row.params) for row in WorldObject.objects.all()}

    def save_world_objects(self, objects: dict[str, dict[str, Any]]) -> None:
        """Mirror the full current world-object set: upsert present, drop missing."""
        with transaction.atomic():
            keep = set(objects.keys())
            WorldObject.objects.exclude(object_id__in=keep).delete()
            for object_id, params in objects.items():
                WorldObject.objects.update_or_create(
                    object_id=object_id, defaults={"params": params}
                )

    # ── NPC relationships (mirror of agent memory) ────────────────────────────

    def save_relationship(self, npc_id: str, player_id: str, score: int, mood: str) -> None:
        """Upsert the queryable relationship mirror for (npc, player)."""
        NPCRelationship.objects.update_or_create(
            npc_id=npc_id,
            player=player_id,
            defaults={"relationship_score": int(score), "mood": mood or "neutral"},
        )

    def load_relationships_for_player(self, player_id: str) -> dict[str, dict[str, Any]]:
        """Return npc_id → {relationship_score, mood} for a given player."""
        result: dict[str, dict[str, Any]] = {}
        for row in NPCRelationship.objects.filter(player=player_id):
            result[row.npc_id] = {
                "relationship_score": row.relationship_score,
                "mood": row.mood,
            }
        return result

    def close(self) -> None:
        """No persistent handle to close (the ORM manages connections)."""
        return None
