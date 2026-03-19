export interface DungeonConfig {
  id: string;
  name: string;
  wallColor: number;
  floorColor: number;
  ceilingColor: number;
  ambientColor: number;
  fogColor: number;
  fogDensity: number;
  enemyCount: number;
  lootItem: string;
  enemyNames: string[];
  enemyColor: number;
  roomWidth: number;
  roomDepth: number;
}

export const DUNGEONS: Record<string, DungeonConfig> = {
  ember_depths: {
    id: "ember_depths",
    name: "Ember Depths",
    wallColor: 0x2a1a0a,
    floorColor: 0x1a0a05,
    ceilingColor: 0x1a0a00,
    ambientColor: 0xff4400,
    fogColor: 0x1a0800,
    fogDensity: 0.015,
    enemyCount: 4,
    lootItem: "Mechero Ancestral",
    enemyNames: [
      "Ember Guardian",
      "Fire Wraith",
      "Magma Sentinel",
      "Lava Worm",
    ],
    enemyColor: 0xff4400,
    roomWidth: 40,
    roomDepth: 40,
  },
  crystal_caverns: {
    id: "crystal_caverns",
    name: "Crystal Caverns",
    wallColor: 0x1a2a3a,
    floorColor: 0x0a1a2a,
    ceilingColor: 0x0a1520,
    ambientColor: 0x4488cc,
    fogColor: 0x0a1a2a,
    fogDensity: 0.01,
    enemyCount: 3,
    lootItem: "Crystal Tear",
    enemyNames: ["Crystal Golem", "Frost Shade", "Ice Stalker"],
    enemyColor: 0x4488cc,
    roomWidth: 35,
    roomDepth: 45,
  },
};
