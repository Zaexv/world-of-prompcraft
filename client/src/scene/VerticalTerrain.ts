import type { Terrain } from './Terrain';
import type { WorldManifest } from '../state/WorldManifest';

let worldManifest: WorldManifest | null = null;

export function setWorldManifest(wm: WorldManifest): void {
  worldManifest = wm;
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Returns true if any terrain feature can affect the given AABB. Cheap pre-check. */
export function hasLiftInBounds(minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  if (!worldManifest) return false;
  for (const place of worldManifest.getTerrainFeatures()) {
    const outerRadius = place.radii.outer;
    const dx = Math.max(0, Math.max(minX - place.transform.x, place.transform.x - maxX));
    const dz = Math.max(0, Math.max(minZ - place.transform.z, place.transform.z - maxZ));
    if (dx * dx + dz * dz < outerRadius * outerRadius) return true;
  }
  return false;
}

export function getVerticalLiftAt(x: number, z: number): number {
  if (!worldManifest) return 0;
  
  let lift = 0;
  const places = worldManifest.getTerrainFeatures();
  
  for (const place of places) {
    const shape = place.shape ?? 'circle';
    
    if (shape === 'circle') {
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
    } else {
      // OBB Rectangular lift
      const dx = x - place.transform.x;
      const dz = z - place.transform.z;
      const rot = place.transform.rotation ?? 0;
      
      const localX = Math.abs(dx * Math.cos(-rot) - dz * Math.sin(-rot));
      const localZ = Math.abs(dx * Math.sin(-rot) + dz * Math.cos(-rot));
      
      const halfW = (place.width ?? (place.radii.inner * 2)) / 2;
      const halfD = (place.depth ?? (place.radii.inner * 2)) / 2;
      
      const distX = Math.max(0, localX - halfW);
      const distZ = Math.max(0, localZ - halfD);
      const dist = Math.sqrt(distX * distX + distZ * distZ);
      
      const blendWidth = place.radii.outer - place.radii.inner;
      if (dist >= blendWidth) continue;
      
      if (dist <= 0) {
        lift = Math.max(lift, place.height);
      } else {
        const t = dist / blendWidth;
        const localLift = place.height * (1 - smoothstep(Math.min(1, Math.max(0, t))));
        lift = Math.max(lift, localLift);
      }
    }
  }
  return lift;
}

export function getWorldHeightAt(terrain: Terrain, x: number, z: number): number {
  // terrain.getHeightAt already includes vertical lift — this function is a
  // clean alias kept for call-site readability.
  return terrain.getHeightAt(x, z);
}
