/**
 * Biome-specific procedural ambient props.
 *
 * Buildings have moved to class-based meshes under `client/src/meshes/buildings/biome/`
 * (selected via `selectBiomeBuildingType`). This module now holds only the smaller
 * ambient props scattered around each biome. They share the same material cache and
 * mesh helpers via `BiomeKit`.
 *
 * Design principles:
 *  • flatShading: true on every material — stylized, readable silhouettes
 *  • Max 8–10 mesh pieces per structure to keep draw-calls low
 *  • isCollider:true on solid parts, noCollision:true on decorative/emissive parts
 */

import * as THREE from 'three';
import { BiomeType } from '../../../scene/Biomes';
import * as G from './geoCache';
import { m, solid, deco } from '../../../meshes/buildings/biome/BiomeKit';

interface Rng {
  next(): number;
  nextInt(n: number): number;
  nextRange(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
}

// ════════════════════════════════════════════════════════════════════════════
//  AMBIENT PROPS
// ════════════════════════════════════════════════════════════════════════════

export function buildBiomeProp(
  biome: BiomeType,
  pos: THREE.Vector3,
  scale: number,
  rng: Rng,
): THREE.Group | null {
  switch (biome) {
    case BiomeType.Teldrassil:   return _propTeld(pos, scale, rng);
    case BiomeType.EmberWastes:  return _propEmber(pos, scale, rng);
    case BiomeType.CrystalTundra:return _propTundra(pos, scale, rng);
    case BiomeType.TwilightMarsh:return _propMarsh(pos, scale, rng);
    case BiomeType.SunlitMeadows:return _propMeadow(pos, scale, rng);
    case BiomeType.Desert:       return _propDesert(pos, scale, rng);
    default: return null;
  }
}

function _propTeld(pos: THREE.Vector3, s: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const v = rng.nextInt(4);
  if (v === 0) {
    // Giant mushroom
    const stem = m(0xc8b090, 0.82);
    const cap = m(0x7733bb, 0.62, 0, 0x551199, 0.7);
    solid(g, G.cylinder(0.22 * s, 0.3 * s, 2.0 * s, 7), stem, 0, s);
    deco(g, G.sphere(0.9 * s, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 2.1 * s);
  } else if (v === 1) {
    // Moonstone shard cluster
    const crystal = m(0x8899dd, 0.2, 0.4, 0x5566bb, 0.5);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, h = (0.8 + i * 0.3) * s;
      deco(g, G.cone(0.18 * s, h, 5), crystal, Math.cos(a) * 0.35 * s, h / 2, Math.sin(a) * 0.35 * s);
    }
    solid(g, G.cylinder(0.5 * s, 0.6 * s, 0.2 * s, 8), m(0x6677aa, 0.78), 0, 0.1 * s);
  } else if (v === 2) {
    // Ancient stump with glowing core
    const bark = m(0x3a2510, 0.95);
    const glow = m(0x88aaff, 0.1, 0, 0x5577dd, 0.9);
    solid(g, G.cylinder(0.55 * s, 0.72 * s, 1.0 * s, 9), bark, 0, 0.5 * s);
    deco(g, G.cylinder(0.3 * s, 0.3 * s, 0.1 * s, 9), glow, 0, 1.05 * s);
  } else {
    // Mossy rock pile
    const rock = m(0x556644, 0.9);
    solid(g, G.dodecahedron(0.65 * s, 0), rock, 0, 0.5 * s);
    solid(g, G.dodecahedron(0.4 * s, 0), rock, 0.5 * s, 0.3 * s, -0.2 * s);
  }
  return g;
}

function _propEmber(pos: THREE.Vector3, s: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const v = rng.nextInt(3);
  if (v === 0) {
    // Obsidian shard cluster
    const obs = m(0x111122, 0.18, 0.72);
    solid(g, G.cone(0.28 * s, 1.8 * s, 5), obs, 0, 0.9 * s);
    solid(g, G.cone(0.2 * s, 1.2 * s, 5), obs, 0.5 * s, 0.6 * s, 0.2 * s, 0, 0, 0.3);
    solid(g, G.cone(0.15 * s, 0.9 * s, 5), obs, -0.4 * s, 0.45 * s, -0.2 * s, 0, 0, -0.25);
  } else if (v === 1) {
    // Lava crack
    const basalt = m(0x1a0800, 0.92);
    const lava = m(0xff5500, 0.04, 0, 0xff2200, 3.0);
    solid(g, G.box(2.4 * s, 0.28, 0.4 * s), basalt, 0, 0.14);
    deco(g, G.box(2.0 * s, 0.08, 0.24 * s), lava, 0, 0.08);
  } else {
    // Scorched boulder
    const scorch = m(0x221100, 0.88);
    solid(g, G.dodecahedron(0.7 * s, 0), scorch, 0, 0.6 * s);
  }
  return g;
}

function _propTundra(pos: THREE.Vector3, s: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const v = rng.nextInt(3);
  if (v === 0) {
    // Ice spike cluster
    const ice = m(0x88ccee, 0.04, 0.42, 0x55aacc, 0.65);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2, h = (0.5 + Math.random() * 0.9) * s;
      deco(g, G.cone(0.13 * s, h, 5), ice, Math.cos(a) * 0.28 * s, h / 2, Math.sin(a) * 0.28 * s);
    }
    deco(g, G.cone(0.2 * s, 1.4 * s, 5), ice, 0, 0.7 * s);
  } else if (v === 1) {
    // Snow-buried rock
    const rock = m(0x556677, 0.88);
    const snow = m(0xddeeff, 0.95);
    solid(g, G.sphere(0.7 * s, 8, 8), rock, 0, 0.4 * s);
    deco(g, G.sphere(0.75 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), snow, 0, 0.72 * s);
  } else {
    // Frozen tree stub
    const bark = m(0x334455, 0.92);
    solid(g, G.cylinder(0.22 * s, 0.3 * s, 2.5 * s, 7), bark, 0, 1.25 * s);
    deco(g, G.sphere(0.85 * s, 7, 5), m(0xbbddee, 0.1, 0.15), 0, 2.7 * s);
  }
  return g;
}

function _propMarsh(pos: THREE.Vector3, s: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const v = rng.nextInt(3);
  if (v === 0) {
    // Rotting log with mushrooms
    const log = m(0x1a1208, 0.95);
    const cap = m(0x228833, 0.72, 0, 0x114422, 0.25);
    solid(g, G.cylinder(0.3 * s, 0.36 * s, 2.5 * s, 8), log, 0, 0.3 * s, 0, 0, 0, Math.PI / 2.1);
    for (let i = 0; i < 3; i++) {
      const bx = (-1 + i) * 0.6 * s;
      const h = 0.25 * s;
      deco(g, G.cylinder(0.06 * s, 0.08 * s, h, 6), m(0xd4c090, 0.82), bx, 0.5 * s);
      deco(g, G.sphere(0.22 * s, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), cap, bx, 0.5 * s + h);
    }
  } else if (v === 1) {
    // Wisp lantern on post
    const wood = m(0x1a0f08, 0.95);
    const wisp = m(0x88ffaa, 0.04, 0, 0x44ee88, 3.0);
    solid(g, G.cylinder(0.07 * s, 0.1 * s, 2.2 * s, 6), wood, 0, 1.1 * s);
    deco(g, G.octahedron(0.22 * s), wisp, 0, 2.4 * s);
  } else {
    // Algae-covered boulder
    const algae = m(0x1a4a20, 0.9, 0, 0x0a2a10, 0.15);
    solid(g, G.sphere(0.7 * s, 8, 8), algae, 0, 0.55 * s);
  }
  return g;
}

function _propMeadow(pos: THREE.Vector3, s: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const v = rng.nextInt(4);
  if (v === 0) {
    // Wildflower cluster
    const stem = m(0x3a6a20, 0.9);
    const f1 = m(0xff6644, 0.72, 0, 0xee4422, 0.18);
    const f2 = m(0xeecc22, 0.72, 0, 0xddaa00, 0.12);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = (0.1 + Math.random() * 0.55) * s;
      const h = (0.3 + Math.random() * 0.4) * s;
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      deco(g, G.cylinder(0.03 * s, 0.04 * s, h, 4), stem, px, h / 2, pz);
      deco(g, G.sphere(0.1 * s, 6, 5), i % 2 ? f1 : f2, px, h, pz);
    }
  } else if (v === 1) {
    // Hay bale
    const hay = m(0xd4aa44, 0.9);
    const twine = m(0x8a6a20, 0.95);
    solid(g, G.cylinder(0.7 * s, 0.7 * s, 1.2 * s, 11), hay, 0, 0.7 * s, 0, 0, 0, Math.PI / 2);
    for (const ty of [0.35, 0.85]) {
      deco(g, G.torus(0.72 * s, 0.04 * s, 5, 11), twine, 0, ty * s + 0.15, 0, Math.PI / 2);
    }
  } else if (v === 2) {
    // Stone wall section
    const stone = m(0x887766, 0.92);
    solid(g, G.box(2.5 * s, 0.85 * s, 0.42 * s), stone, 0, 0.42 * s);
    // Top stones
    for (let i = 0; i < 5; i++) {
      const h = (0.08 + (i % 2) * 0.12) * s;
      solid(g, G.box(0.42 * s, h, 0.38 * s), stone, (i - 2) * 0.46 * s, 0.88 * s + h / 2);
    }
  } else {
    // Wooden signpost
    const wood = m(0x5a3a1a, 0.9);
    solid(g, G.cylinder(0.08 * s, 0.1 * s, 2.0 * s, 6), wood, 0, s);
    solid(g, G.box(1.1 * s, 0.45 * s, 0.12 * s), wood, 0.2 * s, 1.75 * s, 0, 0, 0.15);
    solid(g, G.box(0.9 * s, 0.38 * s, 0.12 * s), wood, -0.1 * s, 1.3 * s, 0, 0, -0.1);
  }
  return g;
}

function _propDesert(pos: THREE.Vector3, s: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const v = rng.nextInt(3);
  if (v === 0) {
    // Sandstone boulder(s)
    const sand = m(0xc8a050, 0.88);
    solid(g, G.dodecahedron(0.8 * s, 0), sand, 0, 0.65 * s);
    solid(g, G.dodecahedron(0.5 * s, 0), sand, 0.75 * s, 0.4 * s, 0.2 * s);
  } else if (v === 1) {
    // Cactus (multi-segment)
    const cactus = m(0x2a6a1a, 0.82);
    const bloom = m(0xff4466, 0.72, 0, 0xee2244, 0.6);
    solid(g, G.cylinder(0.2 * s, 0.25 * s, 2.5 * s, 7), cactus, 0, 1.25 * s);
    solid(g, G.cylinder(0.13 * s, 0.16 * s, s, 6), cactus, 0.42 * s, 0.8 * s, 0, 0, 0, Math.PI / 2.3);
    solid(g, G.cylinder(0.13 * s, 0.16 * s, s, 6), cactus, -0.38 * s, 1.1 * s, 0, 0, 0, -Math.PI / 2.2);
    deco(g, G.sphere(0.15 * s, 6, 6), bloom, 0, 2.65 * s);
  } else {
    // Sun-bleached bones
    const bone = m(0xe8dcc0, 0.9);
    solid(g, G.sphere(0.22 * s, 7, 7), bone, 0, 0.22 * s);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      deco(g, G.cylinder(0.05 * s, 0.07 * s, 0.85 * s, 5), bone,
        Math.cos(a) * 0.55 * s, 0.1, Math.sin(a) * 0.55 * s, 0, 0, Math.PI / 2 + a);
    }
  }
  return g;
}
