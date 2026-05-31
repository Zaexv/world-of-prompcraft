import { BiomeType } from '../../../scene/Biomes';
import type { Rng } from '../../../systems/worldbuilder/RngTypes';

export const BIOME_VEGETATION: Partial<Record<BiomeType, readonly string[]>> = {
  [BiomeType.Teldrassil]: [
    'ancient_tree',
    'mushroom_cluster',
    'biome_prop_forest_grass',
    'biome_prop_forest_orb',
  ],
  [BiomeType.Desert]: [
    'biome_prop_cactus',
    'biome_prop_desert_rock',
  ],
};

export function selectBiomeVegetationType(biome: BiomeType, rng: Rng): string | null {
  const variants = BIOME_VEGETATION[biome];
  if (!variants || variants.length === 0) return null;
  return variants[rng.nextInt(variants.length)] ?? null;
}
