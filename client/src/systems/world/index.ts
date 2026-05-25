/**
 * WorldGenerator helpers — Organized spawning utilities.
 */

export { createBiomeMaterials, seededRandom, type BiomeMaterials } from './VegetationSpawner';
export { ChunkManager } from './ChunkManager';
export { createProcedualBuilding, shouldSpawnBuilding, type BuildingConfig } from './BuildingSpawner';
export { createCaveEntrance, shouldSpawnCaveEntrance, type CaveConfig } from './CaveSpawner';
export {
  shouldSpawnNPC,
  selectNPCRole,
  generateNPCId,
  type NPCSpawnConfig,
} from './NPCSpawner';
