import * as THREE from 'three';
import { Terrain } from './Terrain';

interface Footprint {
  x: number;
  z: number;
  radius: number;
}

/**
 * Teldrassil-themed vegetation: massive ancient trees, medium trees,
 * glowing mushrooms, ferns/bushes, and hanging vines.
 */
export class Vegetation {
  /** Massive ancient tree groups, exposed for mesh-based collision. */
  public readonly massiveTreeGroups: THREE.Group[] = [];

  constructor(
    _scene: THREE.Scene,
    _terrain: Terrain,
    _buildingFootprints: Footprint[],
  ) {
    // Procedural generation disabled to enforce Tabula Rasa baseline.
    // Vegetation will be spawned via the WorldManifest in the future.
  }
}
