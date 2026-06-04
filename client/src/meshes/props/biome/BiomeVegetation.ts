import { BiomeType } from '../../../scene/Biomes';
import type { Rng } from '../../../systems/worldbuilder/RngTypes';

export const BIOME_VEGETATION: Partial<Record<BiomeType, readonly string[]>> = {
  [BiomeType.Teldrassil]: [
    'ancient_tree',
    'mushroom_cluster',
    'crystal_cluster',
    'biome_prop_forest_grass',
    'biome_prop_forest_orb',
  ],
  [BiomeType.BlastedSuarezLands]: [
    'biome_prop_lava_crack',
    'biome_prop_obsidian_shards',
    'biome_prop_scorched_boulder',
  ],
  [BiomeType.CrystalTundra]: [
    'crystal_cluster',
    'biome_prop_ice_spikes',
    'biome_prop_frozen_stump',
    'biome_prop_snow_buried_rock',
  ],
  [BiomeType.MoinSwamps]: [
    'mushroom_cluster',
    'biome_prop_rotting_log',
    'biome_prop_wisp_lantern',
    'biome_prop_algae_boulder',
  ],
  [BiomeType.MalakaArea]: [
    'ancient_tree',
    'biome_prop_wildflowers',
    'biome_prop_hay_bale',
    'biome_prop_stone_wall',
  ],
  [BiomeType.TanisDesert]: [
    'biome_prop_cactus',
    'biome_prop_desert_rock',
    'biome_prop_sandstone_boulders',
    'biome_prop_bleached_bones',
  ],
};

export function selectBiomeVegetationType(biome: BiomeType, rng: Rng): string | null {
  const variants = BIOME_VEGETATION[biome];
  if (!variants || variants.length === 0) return null;
  return variants[rng.nextInt(variants.length)] ?? null;
}
