from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class QuestObjective:
    """A single trackable objective within a quest."""

    id: str
    description: str
    type: str  # "enter_dungeon", "collect_item", "talk_npc", "kill_enemies"
    target: str  # dungeon_id, item_name, npc_id, or count as string
    completed: bool = False


@dataclass
class QuestDefinition:
    """Static definition of a quest (template, not instance)."""

    id: str
    name: str
    description: str
    giver_npc: str
    objectives: list[QuestObjective] = field(default_factory=list)
    reward_item: str = ""
    reward_description: str = ""
    required_level: int = 1


QUEST_DEFINITIONS: dict[str, QuestDefinition] = {
    "sacred_flame": QuestDefinition(
        id="sacred_flame",
        name="The Sacred Flame",
        description=(
            "El Tito possesses an ancient artifact of immense wisdom — el porro "
            "ancestral — but it lies dormant. Find the Mechero Ancestral, a sacred "
            "lighter from the ancient world, hidden in the Ember Depths dungeon. "
            "Only its sacred fire can awaken the artifact's power."
        ),
        giver_npc="eltito_01",
        objectives=[
            QuestObjective(
                "enter_ember_depths",
                "Enter the Ember Depths",
                "enter_dungeon",
                "ember_depths",
            ),
            QuestObjective(
                "find_mechero",
                "Find the Mechero Ancestral",
                "collect_item",
                "Mechero Ancestral",
            ),
            QuestObjective(
                "return_tito",
                "Return to El Tito",
                "talk_npc",
                "eltito_01",
            ),
        ],
        reward_item="Artifact of Ancient Wisdom",
        reward_description=(
            "El Tito's legendary artifact, now ablaze with sacred fire. Grants +50 max mana."
        ),
    ),
    "crystal_tear": QuestDefinition(
        id="crystal_tear",
        name="The Crystal Tear",
        description=(
            "Elyria the Sage speaks of a Crystal Tear — a shard of pure magical "
            "energy — lost in the Crystal Caverns beneath Crystal Lake. Retrieve "
            "it and bring it to her."
        ),
        giver_npc="sage_01",
        objectives=[
            QuestObjective(
                "enter_crystal_caverns",
                "Enter the Crystal Caverns",
                "enter_dungeon",
                "crystal_caverns",
            ),
            QuestObjective(
                "find_crystal_tear",
                "Find the Crystal Tear",
                "collect_item",
                "Crystal Tear",
            ),
            QuestObjective(
                "return_elyria",
                "Return to Elyria",
                "talk_npc",
                "sage_01",
            ),
        ],
        reward_item="Amulet of Clarity",
        reward_description="A shimmering amulet that clears the mind. Grants +20 max mana.",
    ),
    "village_patrol": QuestDefinition(
        id="village_patrol",
        name="Village Patrol",
        description=(
            "Captain Aldric needs help securing the village perimeter. Defeat 3 "
            "hostile creatures near the village and report back."
        ),
        giver_npc="guard_01",
        objectives=[
            QuestObjective(
                "kill_hostiles",
                "Defeat 3 hostile creatures",
                "kill_enemies",
                "3",
            ),
            QuestObjective(
                "return_aldric",
                "Report to Captain Aldric",
                "talk_npc",
                "guard_01",
            ),
        ],
        reward_item="Guard's Badge of Honor",
        reward_description="A badge marking you as a friend of the village guard.",
    ),
}


def get_quest(quest_id: str) -> QuestDefinition | None:
    """Look up a quest definition by ID."""
    return QUEST_DEFINITIONS.get(quest_id)
