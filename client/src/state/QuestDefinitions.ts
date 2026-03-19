export interface QuestObjectiveData {
  id: string;
  description: string;
  type: "enter_dungeon" | "collect_item" | "talk_npc" | "kill_enemies";
  target: string;
}

export interface QuestDefinition {
  id: string;
  name: string;
  description: string;
  giverNpc: string;
  giverName: string;
  objectives: QuestObjectiveData[];
  rewardItem: string;
  rewardDescription: string;
}

/** Runtime quest instance (with completion state). */
export interface ActiveQuest {
  id: string;
  name: string;
  description: string;
  giverNpc: string;
  giverName: string;
  objectives: Array<QuestObjectiveData & { completed: boolean }>;
  rewardItem: string;
  rewardDescription: string;
}

export const QUEST_DEFINITIONS: Record<string, QuestDefinition> = {
  sacred_flame: {
    id: "sacred_flame",
    name: "The Sacred Flame",
    description:
      "El Tito possesses an ancient artifact of immense wisdom — el porro ancestral — but it lies dormant. Find the Mechero Ancestral, a sacred lighter from the ancient world, hidden in the Ember Depths dungeon.",
    giverNpc: "eltito_01",
    giverName: "El Tito",
    objectives: [
      {
        id: "enter_ember_depths",
        description: "Enter the Ember Depths",
        type: "enter_dungeon",
        target: "ember_depths",
      },
      {
        id: "find_mechero",
        description: "Find the Mechero Ancestral",
        type: "collect_item",
        target: "Mechero Ancestral",
      },
      {
        id: "return_tito",
        description: "Return to El Tito",
        type: "talk_npc",
        target: "eltito_01",
      },
    ],
    rewardItem: "Artifact of Ancient Wisdom",
    rewardDescription:
      "El Tito's legendary artifact, ablaze with sacred fire. +50 max mana.",
  },
  crystal_tear: {
    id: "crystal_tear",
    name: "The Crystal Tear",
    description:
      "Elyria speaks of a Crystal Tear lost in the Crystal Caverns beneath Crystal Lake. Retrieve it.",
    giverNpc: "sage_01",
    giverName: "Elyria the Sage",
    objectives: [
      {
        id: "enter_crystal_caverns",
        description: "Enter the Crystal Caverns",
        type: "enter_dungeon",
        target: "crystal_caverns",
      },
      {
        id: "find_crystal_tear",
        description: "Find the Crystal Tear",
        type: "collect_item",
        target: "Crystal Tear",
      },
      {
        id: "return_elyria",
        description: "Return to Elyria",
        type: "talk_npc",
        target: "sage_01",
      },
    ],
    rewardItem: "Amulet of Clarity",
    rewardDescription:
      "A shimmering amulet that clears the mind. +20 max mana.",
  },
  village_patrol: {
    id: "village_patrol",
    name: "Village Patrol",
    description:
      "Captain Aldric needs help securing the village perimeter. Defeat 3 hostile creatures and report back.",
    giverNpc: "guard_01",
    giverName: "Captain Aldric",
    objectives: [
      {
        id: "kill_hostiles",
        description: "Defeat 3 hostile creatures",
        type: "kill_enemies",
        target: "3",
      },
      {
        id: "return_aldric",
        description: "Report to Captain Aldric",
        type: "talk_npc",
        target: "guard_01",
      },
    ],
    rewardItem: "Guard's Badge of Honor",
    rewardDescription:
      "A badge marking you as a friend of the village guard.",
  },
};
