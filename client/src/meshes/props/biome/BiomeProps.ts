/**
 * Biome → ambient-prop catalog + selection.
 *
 * Replaces the old `buildBiomeProp()` switch. Maps each biome to the list of
 * prop `type` strings that may scatter there; `selectBiomePropType` picks one with
 * the seeded RNG. RNG draw order is preserved (one `nextInt(N)` per prop) so
 * procedural prop layouts stay deterministic across the refactor.
 */

import { BiomeType } from '../../../scene/Biomes';
import type { Rng } from '../../../systems/worldbuilder/RngTypes';

/** Each biome's ambient prop variants, in their original selection order. */
export const BIOME_PROPS: Partial<Record<BiomeType, readonly string[]>> = {
  [BiomeType.Teldrassil]: [
    'biome_prop_giant_mushroom',
    'biome_prop_moonstone_shards',
    'biome_prop_glowing_stump',
    'biome_prop_mossy_rock_pile',
  ],
  [BiomeType.BlastedSuarezLands]: [
    'biome_prop_obsidian_shards',
    'biome_prop_lava_crack',
    'biome_prop_scorched_boulder',
  ],
  [BiomeType.CrystalTundra]: [
    'biome_prop_ice_spikes',
    'biome_prop_snow_buried_rock',
    'biome_prop_frozen_stump',
  ],
  [BiomeType.MoinSwamps]: [
    'biome_prop_rotting_log',
    'biome_prop_wisp_lantern',
    'biome_prop_algae_boulder',
  ],
  [BiomeType.MalakaArea]: [
    'biome_prop_wildflowers',
    'biome_prop_hay_bale',
    'biome_prop_stone_wall',
    'biome_prop_signpost',
  ],
  [BiomeType.TanisDesert]: [
    'biome_prop_sandstone_boulders',
    'biome_prop_cactus',
    'biome_prop_bleached_bones',
  ],
};

/** Pick an ambient-prop `type` for a biome, or null if the biome has none. */
export function selectBiomePropType(biome: BiomeType, rng: Rng): string | null {
  const variants = BIOME_PROPS[biome];
  if (!variants || variants.length === 0) return null;
  return variants[rng.nextInt(variants.length)] ?? null;
}
