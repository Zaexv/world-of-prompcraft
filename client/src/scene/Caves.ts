import * as THREE from 'three';
import type { Terrain } from './Terrain';
import { BiomeType, getDominantBiome } from './Biomes';

/**
 * Creates a cave entrance at the given world position.
 * Returns the group so it can be added to collision if desired.
 *
 * Biome-themed:
 *  - Teldrassil: mossy stone arch with purple rune glow
 *  - Ember Wastes: obsidian arch with lava glow
 *  - Crystal Tundra: ice arch with blue shimmer
 *  - Twilight Marsh: gnarled root arch with green glow
 *  - Sunlit Meadows: warm sandstone arch with golden glow
 */
export function createCaveEntrance(
  scene: THREE.Scene,
  terrain: Terrain,
  x: number,
  z: number,
): THREE.Group {
  const y = terrain.getHeightAt(x, z);
  const biome = getDominantBiome(x, z);
  const group = new THREE.Group();

  // Biome-specific colors
  let rockColor: number;
  let glowColor: number;
  let glowIntensity: number;

  switch (biome) {
    case BiomeType.EmberWastes:
      rockColor = 0x1a0a0a;
      glowColor = 0xff4400;
      glowIntensity = 2.0;
      break;
    case BiomeType.CrystalTundra:
      rockColor = 0x6a7a8a;
      glowColor = 0x4488ff;
      glowIntensity = 1.5;
      break;
    case BiomeType.TwilightMarsh:
      rockColor = 0x2a3a1a;
      glowColor = 0x33ff66;
      glowIntensity = 1.2;
      break;
    case BiomeType.SunlitMeadows:
      rockColor = 0x8a7a5a;
      glowColor = 0xffaa33;
      glowIntensity = 1.0;
      break;
    default: // Teldrassil
      rockColor = 0x3a3a4a;
      glowColor = 0xaa44ff;
      glowIntensity = 1.5;
  }

  const rockMat = new THREE.MeshStandardMaterial({
    color: rockColor,
    roughness: 0.95,
    metalness: 0.05,
  });

  // Left rock pillar
  const leftPillarGeo = new THREE.CylinderGeometry(1.2, 1.8, 6, 7);
  const leftPillar = new THREE.Mesh(leftPillarGeo, rockMat);
  leftPillar.position.set(-2.5, 3, 0);
  leftPillar.rotation.z = 0.1;
  leftPillar.castShadow = true;
  leftPillar.receiveShadow = true;
  group.add(leftPillar);

  // Right rock pillar
  const rightPillarGeo = new THREE.CylinderGeometry(1.0, 1.6, 6.5, 7);
  const rightPillar = new THREE.Mesh(rightPillarGeo, rockMat);
  rightPillar.position.set(2.5, 3.25, 0);
  rightPillar.rotation.z = -0.12;
  rightPillar.castShadow = true;
  rightPillar.receiveShadow = true;
  group.add(rightPillar);

  // Arch top (torus arc connecting pillars)
  const archGeo = new THREE.TorusGeometry(2.8, 0.8, 6, 10, Math.PI);
  const arch = new THREE.Mesh(archGeo, rockMat);
  arch.position.set(0, 5.5, 0);
  arch.rotation.set(0, 0, 0);
  arch.castShadow = true;
  group.add(arch);

  // Rock slabs around entrance for natural look
  for (let i = 0; i < 5; i++) {
    const slabW = 0.8 + Math.random() * 1.2;
    const slabH = 0.5 + Math.random() * 0.8;
    const slabD = 0.6 + Math.random() * 0.8;
    const slabGeo = new THREE.BoxGeometry(slabW, slabH, slabD);
    const slab = new THREE.Mesh(slabGeo, rockMat);
    const side = i < 3 ? -1 : 1;
    slab.position.set(
      side * (2.5 + Math.random() * 2),
      slabH * 0.5 + Math.random() * 1.5,
      (Math.random() - 0.5) * 2,
    );
    slab.rotation.set(
      (Math.random() - 0.5) * 0.3,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 0.3,
    );
    slab.castShadow = true;
    group.add(slab);
  }

  // Dark interior (a dark box recessed behind the arch)
  const interiorGeo = new THREE.BoxGeometry(4, 5, 5);
  const interiorMat = new THREE.MeshStandardMaterial({
    color: 0x050505,
    roughness: 1.0,
  });
  const interior = new THREE.Mesh(interiorGeo, interiorMat);
  interior.position.set(0, 2.5, -3);
  group.add(interior);

  // Glowing crystals/runes inside the cave
  const crystalMat = new THREE.MeshStandardMaterial({
    color: glowColor,
    emissive: glowColor,
    emissiveIntensity: glowIntensity,
    roughness: 0.2,
    transparent: true,
    opacity: 0.9,
  });

  for (let i = 0; i < 4; i++) {
    const cH = 0.3 + Math.random() * 0.6;
    const crystalGeo = new THREE.ConeGeometry(0.12, cH, 5);
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystal.position.set(
      (Math.random() - 0.5) * 3,
      0.5 + Math.random() * 3,
      -1.5 - Math.random() * 2,
    );
    crystal.rotation.set(
      (Math.random() - 0.5) * 0.5,
      Math.random() * Math.PI,
      (Math.random() - 0.5) * 1.0,
    );
    group.add(crystal);
  }

  // Point light inside for glow effect
  const caveLight = new THREE.PointLight(glowColor, 1.5, 12);
  caveLight.position.set(0, 2.5, -2);
  group.add(caveLight);

  // Face a random direction
  group.rotation.y = Math.random() * Math.PI * 2;
  group.position.set(x, y, z);
  scene.add(group);

  return group;
}
