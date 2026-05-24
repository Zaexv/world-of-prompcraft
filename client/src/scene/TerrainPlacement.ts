import type { Terrain } from './Terrain';

interface TerrainStats {
  min: number;
  max: number;
  avg: number;
}

/**
 * Samples terrain heights around a circular footprint.
 * Useful for placing larger structures without visible floating edges.
 */
export function sampleTerrainHeightStats(
  terrain: Terrain,
  x: number,
  z: number,
  radius: number,
  samples = 12,
): TerrainStats {
  let min = terrain.getHeightAt(x, z);
  let max = min;
  let sum = min;
  let count = 1;

  for (let i = 0; i < samples; i++) {
    const angle = (i / samples) * Math.PI * 2;
    const sx = x + Math.cos(angle) * radius;
    const sz = z + Math.sin(angle) * radius;
    const h = terrain.getHeightAt(sx, sz);
    min = Math.min(min, h);
    max = Math.max(max, h);
    sum += h;
    count++;
  }

  return { min, max, avg: sum / count };
}

export function smoothHeightSeries(
  values: number[],
  iterations = 10,
  blend = 0.35,
): number[] {
  if (values.length < 3) return [...values];
  let current = [...values];

  for (let iter = 0; iter < iterations; iter++) {
    const next = [...current];
    for (let i = 1; i < current.length - 1; i++) {
      const neighborAvg = (current[i - 1] + current[i + 1]) * 0.5;
      next[i] = current[i] * (1 - blend) + neighborAvg * blend;
    }
    current = next;
  }

  return current;
}

export function getAnchoredTerrainY(
  terrain: Terrain,
  x: number,
  z: number,
  footprintRadius: number,
): number {
  const stats = sampleTerrainHeightStats(terrain, x, z, footprintRadius);
  return stats.avg * 0.55 + stats.min * 0.45;
}
