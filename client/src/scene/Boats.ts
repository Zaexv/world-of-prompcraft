import * as THREE from 'three';
import type { Terrain } from './Terrain';
import { Water } from './Water';

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
    const boat = new THREE.Group();

    const hullMaterial = new THREE.MeshStandardMaterial({
      color: 0x3d2a1a,
      roughness: 0.8,
      metalness: 0.05,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x6b4a2a,
      roughness: 0.7,
      metalness: 0.05,
    });
    const sailMaterial = new THREE.MeshStandardMaterial({
      color: 0xc8cedd,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    const glowMaterial = new THREE.MeshStandardMaterial({
      color: 0x44ff88,
      emissive: 0x44ff88,
      emissiveIntensity: 0.8,
      roughness: 0.25,
    });

    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 6.8, 7, 16), hullMaterial);
    hull.rotation.z = Math.PI / 2;
    hull.scale.y = 0.7;
    hull.position.y = 0.55;
    hull.castShadow = true;
    hull.receiveShadow = true;
    hull.userData.isCollider = true;
    boat.add(hull);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.35, 1.9), trimMaterial);
    deck.position.y = 1.15;
    deck.castShadow = true;
    deck.receiveShadow = true;
    deck.userData.isCollider = true;
    boat.add(deck);

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 4.6, 10), trimMaterial);
    mast.position.set(0.35, 3.4, 0);
    mast.castShadow = true;
    mast.receiveShadow = true;
    mast.userData.isCollider = true;
    boat.add(mast);

    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.7, 8), trimMaterial);
    boom.rotation.z = Math.PI / 2;
    boom.position.set(-0.1, 4.3, 0);
    boom.castShadow = true;
    boom.receiveShadow = true;
    boat.add(boom);

    const sail = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.1), sailMaterial);
    sail.position.set(-0.85, 3.25, 0);
    sail.castShadow = true;
    sail.receiveShadow = true;
    boat.add(sail);

    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMaterial);
    lantern.position.set(2.7, 1.45, 0);
    lantern.castShadow = true;
    lantern.receiveShadow = true;
    boat.add(lantern);

    const bowRune = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 14), glowMaterial);
    bowRune.rotation.y = Math.PI / 2;
    bowRune.position.set(3.4, 0.95, 0);
    bowRune.castShadow = true;
    bowRune.receiveShadow = true;
    boat.add(bowRune);

    boat.position.set(x, Water.LEVEL + 0.25, z);
    boat.rotation.y = -Math.PI * 0.35;

    scene.add(boat);
    this.groups.push(boat);
  }
}
