/**
 * BuildingSpawner — Helper for WorldGenerator town/building spawning.
 *
 * Encapsulates building placement logic and mesh creation.
 */

import * as THREE from 'three';
import type { Terrain } from '../../scene/Terrain';

export interface BuildingConfig {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  roofColor?: number;
  wallColor?: number;
}

/**
 * Create a simple procedural building mesh.
 */
export function createProcedualBuilding(config: BuildingConfig): THREE.Group {
  const group = new THREE.Group();
  group.position.set(config.x, 0, config.z);

  // Walls
  const wallMat = new THREE.MeshStandardMaterial({
    color: config.wallColor ?? 0x8b7355,
    roughness: 0.8,
  });
  const wallGeo = new THREE.BoxGeometry(config.width, config.height, config.depth);
  const walls = new THREE.Mesh(wallGeo, wallMat);
  walls.position.y = config.height / 2;
  group.add(walls);

  // Roof (pyramid)
  const roofMat = new THREE.MeshStandardMaterial({
    color: config.roofColor ?? 0xa0522d,
    roughness: 0.7,
  });
  const roofGeo = new THREE.ConeGeometry(
    Math.max(config.width, config.depth) * 0.6,
    config.height * 0.5,
    4
  );
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = config.height + config.height * 0.25;
  roof.rotation.y = Math.PI / 4;
  group.add(roof);

  // Door
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x3d2817,
    roughness: 0.9,
  });
  const doorGeo = new THREE.BoxGeometry(0.8, 1.8, 0.1);
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.9, config.depth / 2 + 0.05);
  group.add(door);

  return group;
}

/**
 * Determine building placement based on terrain.
 */
export function shouldSpawnBuilding(x: number, z: number, terrain: Terrain): boolean {
  // Buildings spawn in valleys/flat areas (simplified check)
  const height = terrain.getHeightAt(x, z);
  return height < 2 && Math.random() < 0.15; // 15% spawn chance on flat terrain
}
