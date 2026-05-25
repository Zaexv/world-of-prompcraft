/**
 * CaveSpawner — Helper for WorldGenerator dungeon entrance spawning.
 *
 * Encapsulates cave/dungeon entrance placement logic.
 */

import * as THREE from 'three';
import type { Terrain } from '../../scene/Terrain';

export interface CaveConfig {
  x: number;
  z: number;
  depth: number;
  scale: number;
}

/**
 * Create a procedural cave entrance mesh.
 */
export function createCaveEntrance(config: CaveConfig): THREE.Group {
  const group = new THREE.Group();
  group.position.set(config.x, 0, config.z);

  // Stone arch (torus)
  const stoneMatTop = new THREE.MeshStandardMaterial({
    color: 0x4a4a4a,
    roughness: 0.9,
    metalness: 0,
  });

  const archGeo = new THREE.TorusGeometry(config.scale * 1.2, config.scale * 0.3, 16, 8, Math.PI);
  const arch = new THREE.Mesh(archGeo, stoneMatTop);
  arch.rotation.x = Math.PI / 2;
  arch.position.y = config.scale * 1.5;
  group.add(arch);

  // Entrance hole (dark)
  const holeMat = new THREE.MeshStandardMaterial({
    color: 0x1a1a1a,
    roughness: 1,
    emissive: 0x0a0a0a,
  });
  const holeGeo = new THREE.ConeGeometry(config.scale * 0.8, config.depth * 2, 32);
  const hole = new THREE.Mesh(holeGeo, holeMat);
  hole.position.y = 0;
  hole.rotation.x = Math.PI * 1.5; // Point down
  group.add(hole);

  // Ambient glow
  const glowLight = new THREE.PointLight(0x6600ff, 0.5, config.scale * 4);
  glowLight.position.y = config.scale * 0.5;
  group.add(glowLight);

  return group;
}

/**
 * Determine cave entrance placement based on terrain.
 */
export function shouldSpawnCaveEntrance(x: number, z: number, terrain: Terrain): boolean {
  // Caves spawn on slopes/elevated terrain
  const height = terrain.getHeightAt(x, z);
  return height > 5 && Math.random() < 0.08; // 8% spawn chance on hills
}
