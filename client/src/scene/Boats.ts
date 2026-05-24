import * as THREE from 'three';
import type { Terrain } from './Terrain';
import { Water } from './Water';
import { createBoatModel } from './BoatModel';

/**
 * Small dock-style boats that float on the world water surface.
 */
export class Boats {
  /** Boat groups added to the scene, exposed for collision registration. */
  public readonly groups: THREE.Group[] = [];

  constructor(scene: THREE.Scene, terrain: Terrain) {
    const spawn = this.findWaterSpawn(terrain);
    if (!spawn) return;
    this.createBoat(scene, spawn.x, spawn.z);
  }

  private findWaterSpawn(terrain: Terrain): { x: number; z: number } | null {
    const preferred: Array<{ x: number; z: number }> = [
      { x: -140, z: 40 },
      { x: -180, z: 90 },
      { x: -110, z: -30 },
      { x: 80, z: -170 },
    ];

    for (const candidate of preferred) {
      if (terrain.getHeightAt(candidate.x, candidate.z) < Water.LEVEL - 0.2) {
        return candidate;
      }
    }

    for (let radius = 32; radius <= 240; radius += 16) {
      for (let step = 0; step < 24; step++) {
        const angle = (step / 24) * Math.PI * 2;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        if (terrain.getHeightAt(x, z) < Water.LEVEL - 0.2) {
          return { x, z };
        }
      }
    }

    return null;
  }

  private createBoat(scene: THREE.Scene, x: number, z: number): void {
    const boat = createBoatModel({ scale: 1, withSail: true, markColliders: true });

    boat.position.set(x, Water.LEVEL + 0.7, z);
    boat.rotation.y = -Math.PI * 0.35 + Math.PI / 2;

    scene.add(boat);
    this.groups.push(boat);
  }
}
