from __future__ import annotations

from django.contrib import admin

from .models import (
    CompletedQuest,
    NPCRelationship,
    NPCState,
    Player,
    PlayerInventory,
    WorldObject,
)


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("username", "level", "hp", "gold", "updated_at")
    search_fields = ("username",)


@admin.register(PlayerInventory)
class PlayerInventoryAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("player", "item_name", "quantity")
    search_fields = ("player__username", "item_name")


@admin.register(CompletedQuest)
class CompletedQuestAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("player", "quest_id")


@admin.register(NPCState)
class NPCStateAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("npc_id", "hp", "mood", "loot_dropped", "updated_at")


@admin.register(NPCRelationship)
class NPCRelationshipAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("npc_id", "player", "relationship_score", "mood", "updated_at")
    search_fields = ("npc_id", "player")


@admin.register(WorldObject)
class WorldObjectAdmin(admin.ModelAdmin):  # type: ignore[type-arg]
    list_display = ("object_id", "updated_at")
