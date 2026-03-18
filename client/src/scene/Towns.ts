import * as THREE from 'three';
import type { Terrain } from './Terrain';
import { BiomeType, getDominantBiome } from './Biomes';

/**
 * Creates a small procedural town/settlement at the given position.
 * Returns the group and footprint so collision & vegetation can avoid it.
 *
 * Each town has:
 *  - 3-6 huts arranged in a cluster
 *  - A central feature (well, campfire, or market post)
 *  - Biome-themed architecture and colors
 */

export interface TownData {
  group: THREE.Group;
  footprint: { x: number; z: number; radius: number };
  /** World positions for spawning citizen NPCs */
  citizenSpots: { x: number; z: number }[];
}

export function createTown(
  scene: THREE.Scene,
  terrain: Terrain,
  x: number,
  z: number,
): TownData {
  const y = terrain.getHeightAt(x, z);
  const biome = getDominantBiome(x, z);
  const group = new THREE.Group();
  const citizenSpots: { x: number; z: number }[] = [];

  // Biome-specific palette
  let wallColor: number;
  let roofColor: number;
  let accentColor: number;
  let glowColor: number;

  switch (biome) {
    case BiomeType.EmberWastes:
      wallColor = 0x3a2010;
      roofColor = 0x8a2200;
      accentColor = 0x1a0a0a;
      glowColor = 0xff6600;
      break;
    case BiomeType.CrystalTundra:
      wallColor = 0x7a8a9a;
      roofColor = 0x4a6a8a;
      accentColor = 0xaabbcc;
      glowColor = 0x6699ff;
      break;
    case BiomeType.TwilightMarsh:
      wallColor = 0x2a3a1a;
      roofColor = 0x1a2a10;
      accentColor = 0x3a4a2a;
      glowColor = 0x44ff88;
      break;
    case BiomeType.SunlitMeadows:
      wallColor = 0x8a7a5a;
      roofColor = 0x6a5a3a;
      accentColor = 0xaa9a7a;
      glowColor = 0xffcc44;
      break;
    default: // Teldrassil
      wallColor = 0x3b2a1a;
      roofColor = 0x6a2fa0;
      accentColor = 0xd0d8e8;
      glowColor = 0xaa44ff;
  }

  const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.6 });

  // Deterministic seed from position
  let seed = Math.abs(Math.floor(x * 73 + z * 137)) % 2147483647;
  const rand = (): number => {
    seed = (seed * 16807 + 0) % 2147483647;
    return seed / 2147483647;
  };

  const hutCount = 3 + Math.floor(rand() * 4); // 3-6 huts
  const townRadius = 12 + hutCount * 2;

  // Place huts in a rough circle
  for (let i = 0; i < hutCount; i++) {
    const angle = (i / hutCount) * Math.PI * 2 + rand() * 0.5;
    const dist = 6 + rand() * (townRadius - 8);
    const hx = Math.cos(angle) * dist;
    const hz = Math.sin(angle) * dist;
    const hy = terrain.getHeightAt(x + hx, z + hz) - y;

    const hutGroup = createHut(wallMat, roofMat, rand);
    hutGroup.position.set(hx, hy, hz);
    hutGroup.rotation.y = rand() * Math.PI * 2;
    group.add(hutGroup);

    // Citizen spawn point near each hut
    const citizenAngle = angle + (rand() - 0.5) * 0.5;
    const citizenDist = dist - 2 - rand() * 2;
    citizenSpots.push({
      x: x + Math.cos(citizenAngle) * citizenDist,
      z: z + Math.sin(citizenAngle) * citizenDist,
    });
  }

  // Central feature: well or campfire
  if (rand() > 0.5) {
    // Stone well
    const wellBase = new THREE.CylinderGeometry(1.2, 1.4, 1.0, 8);
    const well = new THREE.Mesh(wellBase, accentMat);
    well.position.y = 0.5;
    well.castShadow = true;
    well.receiveShadow = true;
    group.add(well);

    // Water inside
    const wellWater = new THREE.CylinderGeometry(0.9, 0.9, 0.1, 8);
    const waterMat = new THREE.MeshStandardMaterial({
      color: glowColor,
      emissive: glowColor,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.7,
    });
    const water = new THREE.Mesh(wellWater, waterMat);
    water.position.y = 0.9;
    group.add(water);

    // Well posts and roof
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.5, 4);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, wallMat);
      post.position.set(side * 1.0, 2.25, 0);
      post.castShadow = true;
      group.add(post);
    }
    const wellRoof = new THREE.ConeGeometry(1.5, 0.8, 4);
    const roof = new THREE.Mesh(wellRoof, roofMat);
    roof.position.y = 3.8;
    roof.castShadow = true;
    group.add(roof);
  } else {
    // Campfire
    const fireBase = new THREE.CylinderGeometry(0.8, 1.0, 0.3, 8);
    const fireMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 1.0 });
    const base = new THREE.Mesh(fireBase, fireMat);
    base.position.y = 0.15;
    group.add(base);

    // Emissive flame
    const flameGeo = new THREE.ConeGeometry(0.4, 1.2, 6);
    const flameMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: 0xff4400,
      emissiveIntensity: 3.0,
      transparent: true,
      opacity: 0.8,
    });
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = 0.9;
    group.add(flame);

    // Fire light
    const fireLight = new THREE.PointLight(0xff6622, 2.5, 20);
    fireLight.position.y = 1.5;
    group.add(fireLight);

    // Log seats
    const logGeo = new THREE.CylinderGeometry(0.2, 0.25, 1.8, 5);
    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.95 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rand() * 0.3;
      const log = new THREE.Mesh(logGeo, logMat);
      log.position.set(Math.cos(a) * 2, 0.2, Math.sin(a) * 2);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = a;
      log.castShadow = true;
      group.add(log);
    }
  }

  // Fence posts around the perimeter (partial, for a rustic feel)
  const fencePostGeo = new THREE.CylinderGeometry(0.06, 0.08, 1.2, 4);
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 });
  const fenceCount = 6 + Math.floor(rand() * 6);
  const fenceArcStart = rand() * Math.PI * 2;
  const fenceArc = Math.PI * (0.8 + rand() * 0.8); // partial fence

  for (let i = 0; i < fenceCount; i++) {
    const a = fenceArcStart + (i / fenceCount) * fenceArc;
    const fr = townRadius - 1;
    const fx = Math.cos(a) * fr;
    const fz = Math.sin(a) * fr;
    const fy = terrain.getHeightAt(x + fx, z + fz) - y;

    const post = new THREE.Mesh(fencePostGeo, fenceMat);
    post.position.set(fx, fy + 0.6, fz);
    post.castShadow = true;
    group.add(post);
  }

  group.position.set(x, y, z);
  scene.add(group);

  return {
    group,
    footprint: { x, z, radius: townRadius },
    citizenSpots,
  };
}

/** Create a single hut (wall cylinder + cone roof). */
function createHut(
  wallMat: THREE.MeshStandardMaterial,
  roofMat: THREE.MeshStandardMaterial,
  rand: () => number,
): THREE.Group {
  const hut = new THREE.Group();

  const wallRadius = 1.2 + rand() * 0.8;
  const wallHeight = 2.0 + rand() * 1.0;
  const roofHeight = 1.5 + rand() * 1.0;

  // Walls
  const wallGeo = new THREE.CylinderGeometry(wallRadius, wallRadius * 1.05, wallHeight, 8);
  const wall = new THREE.Mesh(wallGeo, wallMat);
  wall.position.y = wallHeight * 0.5;
  wall.castShadow = true;
  wall.receiveShadow = true;
  hut.add(wall);

  // Roof
  const roofGeo = new THREE.ConeGeometry(wallRadius * 1.4, roofHeight, 8);
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.y = wallHeight + roofHeight * 0.5;
  roof.castShadow = true;
  hut.add(roof);

  // Door (small dark box)
  const doorGeo = new THREE.BoxGeometry(0.6, 1.2, 0.15);
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a1208, roughness: 0.95 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.position.set(0, 0.6, wallRadius);
  hut.add(door);

  // Window (small emissive square)
  const winGeo = new THREE.BoxGeometry(0.35, 0.35, 0.1);
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffcc88,
    emissive: 0xffcc88,
    emissiveIntensity: 0.6,
  });
  const win = new THREE.Mesh(winGeo, winMat);
  const winAngle = rand() * Math.PI * 2;
  win.position.set(
    Math.cos(winAngle) * wallRadius,
    wallHeight * 0.6,
    Math.sin(winAngle) * wallRadius,
  );
  win.lookAt(0, wallHeight * 0.6, 0);
  win.rotateY(Math.PI); // face outward
  hut.add(win);

  return hut;
}
