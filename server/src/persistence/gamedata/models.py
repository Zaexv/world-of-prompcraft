"""Relational schema for persistent game state.

These models are the *storage* shape. Runtime code keeps using the in-memory
``PlayerData`` / ``NPCData`` dataclasses; ``GameStore`` converts between the two.
"""

from __future__ import annotations

from django.db import models


class Player(models.Model):
    """Durable per-player state, keyed by the (unique) username."""

    username = models.CharField(primary_key=True, max_length=20)
    hp = models.IntegerField(default=100)
    max_hp = models.IntegerField(default=100)
    mana = models.IntegerField(default=50)
    max_mana = models.IntegerField(default=50)
    level = models.IntegerField(default=1)
    gold = models.IntegerField(default=0)
    kill_count = models.IntegerField(default=0)
    race = models.CharField(max_length=32, default="human")
    faction = models.CharField(max_length=32, default="alliance")
    position = models.JSONField(default=list)
    yaw = models.FloatField(default=0.0)
    # Nested objective shape stays JSON (not normalized — see plan scope).
    active_quests = models.JSONField(default=list)
    # slot -> item_name (weapon / shield / trinket); single source of truth for
    # equipped gear, mirrored into HandlerContext.player_equipment at runtime.
    equipped = models.JSONField(default=dict)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.username


class PlayerInventory(models.Model):
    """One row per distinct item a player holds, with a stack quantity."""

    player = models.ForeignKey(Player, related_name="items", on_delete=models.CASCADE)
    item_name = models.CharField(max_length=64)
    quantity = models.IntegerField(default=1)

    class Meta:
        unique_together = ("player", "item_name")

    def __str__(self) -> str:
        return f"{self.player_id}: {self.item_name} x{self.quantity}"


class CompletedQuest(models.Model):
    """A quest a player has finished (relational completed-quest list)."""

    player = models.ForeignKey(Player, related_name="completed", on_delete=models.CASCADE)
    quest_id = models.CharField(max_length=64)

    class Meta:
        unique_together = ("player", "quest_id")

    def __str__(self) -> str:
        return f"{self.player_id}: {self.quest_id}"


class NPCState(models.Model):
    """Mutable NPC state overlaid onto manifest/registered NPCs at startup."""

    npc_id = models.CharField(primary_key=True, max_length=64)
    hp = models.IntegerField()
    position = models.JSONField(default=list)
    loot_dropped = models.BooleanField(default=False)
    mood = models.CharField(max_length=32, default="neutral")
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.npc_id


class NPCRelationship(models.Model):
    """Queryable mirror of the per-(npc, player) relationship score / mood.

    The authoritative conversational memory lives in the LangGraph checkpoint
    tables; this denormalized row exists so the score is cheap to read for the
    UI/admin without replaying a graph thread.
    """

    npc_id = models.CharField(max_length=64)
    player = models.CharField(max_length=20)
    relationship_score = models.IntegerField(default=0)
    mood = models.CharField(max_length=32, default="neutral")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ("npc_id", "player")

    def __str__(self) -> str:
        return f"{self.npc_id}<->{self.player}: {self.relationship_score}"


class WorldObject(models.Model):
    """A player-built world object (world-builder spawn), keyed by its id."""

    object_id = models.CharField(primary_key=True, max_length=64)
    params = models.JSONField()
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.object_id
