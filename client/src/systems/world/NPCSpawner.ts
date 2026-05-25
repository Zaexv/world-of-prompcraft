/**
 * NPCSpawner — Helper for WorldGenerator NPC spawning.
 *
 * Encapsulates NPC placement logic and configuration.
 */

export interface NPCSpawnConfig {
  id: string;
  x: number;
  z: number;
  role: string;
  biome: string;
}

/**
 * Determine if NPC should spawn at location.
 */
export function shouldSpawnNPC(x: number, z: number, biome: string): boolean {
  // NPCs spawn in clusters (settlements, villages)
  // 12% chance in villages, 5% in wilderness
  const spawnChance = biome === 'teldrassil' ? 0.12 : 0.05;
  return Math.random() < spawnChance;
}

/**
 * Select NPC role based on biome.
 */
export function selectNPCRole(biome: string): string {
  const rolesByBiome: Record<string, string[]> = {
    teldrassil: ['merchant', 'guard', 'healer'],
    ember_wastes: ['pyromancer', 'warrior'],
    crystal_tundra: ['sage', 'cryomancer'],
    twilight_marsh: ['undead', 'orc'],
    sunlit_meadows: ['healer', 'ranger'],
  };

  const roles = rolesByBiome[biome] ?? ['merchant', 'guard'];
  return roles[Math.floor(Math.random() * roles.length)];
}

/**
 * Generate unique NPC ID for spawned NPC.
 */
export function generateNPCId(chunkX: number, chunkZ: number, spawnIndex: number): string {
  return `npc_${chunkX}_${chunkZ}_${spawnIndex}`;
}
