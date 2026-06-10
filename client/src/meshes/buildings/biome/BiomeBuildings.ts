/**
 * Biome → building-variant catalog + selection.
 *
 * Replaces the old `buildBiomeBuilding()` switch. The data table maps each biome
 * to the list of mesh `type` strings that may spawn there; `selectBiomeBuildingType`
 * picks one with the seeded RNG. RNG draw order is preserved exactly so procedural
 * layouts stay deterministic across the refactor.
 */

import { BiomeType } from '../../../scene/Biomes';
import type { Rng } from '../../../systems/worldbuilder/RngTypes';

/** Each biome's procedural building variants, in their original selection order. */
export const BIOME_BUILDINGS: Partial<Record<BiomeType, readonly string[]>> = {
  [BiomeType.Teldrassil]: ['biome_elven_tower', 'biome_moon_shrine', 'biome_forest_sanctuary', 'biome_ruined_outpost'],
  [BiomeType.BlastedSuarezLands]: ['biome_obsidian_spire', 'biome_forge', 'biome_fire_temple', 'biome_volcano'],
  [BiomeType.CrystalTundra]: ['biome_ice_castle', 'biome_frozen_caravan', 'biome_crystal_spire'],
  [BiomeType.MoinSwamps]: ['biome_swamp_hut', 'biome_drowned_temple', 'biome_witch_tower'],
  [BiomeType.MalakaArea]: ['biome_inn', 'biome_windmill', 'biome_market_stall', 'biome_ruined_farm'],
  [BiomeType.TanisDesert]: ['biome_pyramid', 'biome_ancient_gate', 'biome_obelisk'],
};

/**
 * Pick a building `type` for a biome, or null if the biome has none.
 *
 * Blasted Suarezlands distance gate: beyond 280 units it yields a towering
 * landmark — a Volcano or the Fire Temple. Closer in it picks among the smaller
 * volcanic structures (spire / forge / fire temple).
 */
export function selectBiomeBuildingType(biome: BiomeType, rng: Rng, dist: number): string | null {
  const variants = BIOME_BUILDINGS[biome];
  if (!variants || variants.length === 0) return null;

  if (biome === BiomeType.BlastedSuarezLands) {
    // Far out: alternate big landmarks (volcano index 3 / fire temple index 2).
    // Near: smaller structures only (indices 0..2).
    const v = dist > 280 ? (rng.nextInt(2) === 0 ? 3 : 2) : rng.nextInt(3);
    return variants[v] ?? null;
  }

  return variants[rng.nextInt(variants.length)] ?? null;
}
