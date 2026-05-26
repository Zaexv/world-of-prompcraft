import type { Terrain } from './Terrain';

export interface VerticalPlace {
  id: string;
  centerX: number;
  centerZ: number;
  innerRadius: number;
  outerRadius: number;
  height: number;
}

// Shared authored vertical places. All runtime height queries should use this.
export const VERTICAL_PLACES: VerticalPlace[] = [
  {
    id: 'blasted-suarezlands-mountain',
    centerX: -140,
    centerZ: -245,
    innerRadius: 26,
    outerRadius: 74,
    height: 16,
  },
];

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function getVerticalLiftAt(x: number, z: number): number {
  let lift = 0;
  for (const place of VERTICAL_PLACES) {
    const dx = x - place.centerX;
    const dz = z - place.centerZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= place.outerRadius) continue;
    if (dist <= place.innerRadius) {
      lift = Math.max(lift, place.height);
      continue;
    }
    const t = (dist - place.innerRadius) / (place.outerRadius - place.innerRadius);
    const localLift = place.height * (1 - smoothstep(Math.min(1, Math.max(0, t))));
    lift = Math.max(lift, localLift);
  }
  return lift;
}

export function getWorldHeightAt(terrain: Terrain, x: number, z: number): number {
  return terrain.getHeightAt(x, z) + getVerticalLiftAt(x, z);
}
