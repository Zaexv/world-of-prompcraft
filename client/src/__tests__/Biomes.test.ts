// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import {
  BiomeType,
  getDominantBiome,
  getBiomeWeights,
  BIOME_ZONE_NAMES,
  lavaField,
} from '../scene/Biomes';

describe('biome partition (radial sectors)', () => {
  it('center is Teldrassil', () => {
    expect(getDominantBiome(0, 0)).toBe(BiomeType.Teldrassil);
  });

  it('outer ring resolves to the directional biome', () => {
    expect(getDominantBiome(300, 0)).toBe(BiomeType.BlastedSuarezLands);  // east
    expect(getDominantBiome(0, 300)).toBe(BiomeType.CrystalTundra);       // north
    expect(getDominantBiome(0, -300)).toBe(BiomeType.MoinSwamps);         // south
    expect(getDominantBiome(-212, -212)).toBe(BiomeType.MalakaArea);      // sw
    expect(getDominantBiome(-212, 212)).toBe(BiomeType.TanisDesert);      // nw
  });

  it('weights are normalized (sum to 1)', () => {
    for (const [x, z] of [[0, 0], [300, 0], [-150, 200], [400, -400]]) {
      const w = getBiomeWeights(x!, z!);
      const sum = Object.values(w).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });

  it('narrow sectors leave a Teldrassil-forest buffer between biomes on 90° gaps', () => {
    // Midway between east (Blasted, 0°) and north (Tundra, 90°) is 45° — outside
    // both 36° half-widths, so the neutral forest separates them.
    const mid = getDominantBiome(Math.cos(Math.PI / 4) * 300, Math.sin(Math.PI / 4) * 300);
    expect(mid).toBe(BiomeType.Teldrassil);
  });

  it('BIOME_ZONE_NAMES covers every biome type', () => {
    for (const t of [
      BiomeType.Teldrassil, BiomeType.BlastedSuarezLands, BiomeType.CrystalTundra,
      BiomeType.MoinSwamps, BiomeType.MalakaArea, BiomeType.TanisDesert,
    ]) {
      expect(typeof BIOME_ZONE_NAMES[t]).toBe('string');
      expect(BIOME_ZONE_NAMES[t].length).toBeGreaterThan(0);
    }
  });
});

describe('lavaField (terrain-baked lava)', () => {
  it('stays within [0,1] across a dense sample', () => {
    for (let x = -500; x <= 500; x += 13) {
      for (let z = -500; z <= 500; z += 17) {
        const v = lavaField(x, z);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('is thresholded — lava is pools/veins, not a uniform wash (<60% coverage)', () => {
    let hot = 0;
    let total = 0;
    for (let x = -500; x <= 500; x += 7) {
      for (let z = -500; z <= 500; z += 7) {
        total++;
        if (lavaField(x, z) > 0.5) hot++;
      }
    }
    expect(hot / total).toBeLessThan(0.6);
  });

  it('is deterministic', () => {
    expect(lavaField(123, -456)).toBe(lavaField(123, -456));
  });
});
