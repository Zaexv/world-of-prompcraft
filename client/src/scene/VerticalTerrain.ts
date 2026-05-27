import type { Terrain } from './Terrain';
import type { WorldManifest } from '../state/WorldManifest';

let worldManifest: WorldManifest | null = null;

export function setWorldManifest(wm: WorldManifest): void {
  worldManifest = wm;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export function getVerticalLiftAt(x: number, z: number): number {
  if (!worldManifest) return 0;
  
  let lift = 0;
  const places = worldManifest.getTerrainFeatures();
  
  for (const place of places) {
    const dx = x - place.transform.x;
    const dz = z - place.transform.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist >= place.radii.outer) continue;
    if (dist <= place.radii.inner) {
      lift = Math.max(lift, place.height);
      continue;
    }
    const t = (dist - place.radii.inner) / (place.radii.outer - place.radii.inner);
    const localLift = place.height * (1 - smoothstep(Math.min(1, Math.max(0, t))));
    lift = Math.max(lift, localLift);
  }
  return lift;
}

export function getWorldHeightAt(terrain: Terrain, x: number, z: number): number {
  // terrain.getHeightAt already includes vertical lift — this function is a
  // clean alias kept for call-site readability.
  return terrain.getHeightAt(x, z);
}
