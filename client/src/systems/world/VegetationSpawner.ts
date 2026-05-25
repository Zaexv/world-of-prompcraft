/**
 * VegetationSpawner — Helper for WorldGenerator tree spawning.
 *
 * Handles tree generation, LOD optimization, and material management.
 */

import * as THREE from 'three';
import { BiomeType } from '../../scene/Biomes';

export interface BiomeMaterials {
  trunk: THREE.MeshStandardMaterial;
  canopy: THREE.MeshStandardMaterial[];
}

/**
 * Create biome-specific tree materials.
 */
export function createBiomeMaterials(biome: BiomeType): BiomeMaterials | null {
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 });
  const canopyMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x2d5016, roughness: 0.85 }),
    new THREE.MeshStandardMaterial({ color: 0x3d6b1f, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ color: 0x1d4010, roughness: 0.9 }),
  ];

  switch (biome) {
    case BiomeType.EmberWastes:
      return {
        trunk: new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.95 }),
        canopy: [
          new THREE.MeshStandardMaterial({ color: 0x3a1a0a, roughness: 0.8 }),
          new THREE.MeshStandardMaterial({ color: 0x4a2010, roughness: 0.8 }),
          new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.85 }),
        ],
      };
    case BiomeType.CrystalTundra:
      return {
        trunk: new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.7 }),
        canopy: [
          new THREE.MeshStandardMaterial({ color: 0x6a8aaa, roughness: 0.6, emissive: 0x112233, emissiveIntensity: 0.3 }),
          new THREE.MeshStandardMaterial({ color: 0x8aaabb, roughness: 0.55 }),
          new THREE.MeshStandardMaterial({ color: 0x5a7a9a, roughness: 0.65 }),
        ],
      };
    case BiomeType.TwilightMarsh:
      return {
        trunk: new THREE.MeshStandardMaterial({ color: 0x1a2a10, roughness: 0.95 }),
        canopy: [
          new THREE.MeshStandardMaterial({ color: 0x1a3a15, roughness: 0.9 }),
          new THREE.MeshStandardMaterial({ color: 0x0a2a0a, roughness: 0.9 }),
          new THREE.MeshStandardMaterial({ color: 0x2a3a20, roughness: 0.85, emissive: 0x112a11, emissiveIntensity: 0.2 }),
        ],
      };
    case BiomeType.SunlitMeadows:
      return {
        trunk: new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.85 }),
        canopy: [
          new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.75 }),
          new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.7 }),
          new THREE.MeshStandardMaterial({ color: 0x6a8a4a, roughness: 0.75 }),
        ],
      };
    case BiomeType.Teldrassil:
    default:
      return { trunk: trunkMaterial, canopy: canopyMaterials };
  }
}

/**
 * Seeded random for deterministic tree placement.
 */
export function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822519);
    state = Math.imul(state ^ (state >>> 13), 3266489917);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}
