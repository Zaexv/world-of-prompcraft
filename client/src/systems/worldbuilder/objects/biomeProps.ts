/**
 * Biome-specific procedural props and buildings for the ProceduralPopulator.
 *
 * All solid meshes carry userData.isCollider = true.
 * All purely visual meshes carry userData.noCollision = true.
 */

import * as THREE from 'three';
import { BiomeType } from '../../../scene/Biomes';

// ── Shared material helpers ──────────────────────────────────────────────────

const MAT_CACHE = new Map<string, THREE.MeshStandardMaterial>();
function mat(hex: number, rough = 0.8, metal = 0, emHex?: number, emInt?: number): THREE.MeshStandardMaterial {
  const key = `${hex}_${rough}_${metal}_${emHex}_${emInt}`;
  let m = MAT_CACHE.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal });
    if (emHex !== undefined) { m.emissive = new THREE.Color(emHex); m.emissiveIntensity = emInt ?? 1; }
    MAT_CACHE.set(key, m);
  }
  return m;
}

function addMesh(parent: THREE.Group, geo: THREE.BufferGeometry, material: THREE.MeshStandardMaterial,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, solid = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  m.userData.isCollider = solid;
  if (!solid) m.userData.noCollision = true;
  parent.add(m);
  return m;
}

/** A PRNG duck-type that only needs next() returning [0,1). */
interface Rng { next(): number; nextRange(lo: number, hi: number): number; nextInt(n: number): number; }

// ════════════════════════════════════════════════════════════════════════════
//  BUILDINGS
// ════════════════════════════════════════════════════════════════════════════

export function buildBiomeBuilding(
  biome: BiomeType,
  pos: THREE.Vector3,
  rng: Rng,
  distFromOrigin: number,
): THREE.Group | null {
  switch (biome) {
    case BiomeType.Teldrassil:  return buildTeldrassilStructure(pos, rng);
    case BiomeType.EmberWastes: return buildEmberStructure(pos, rng, distFromOrigin);
    case BiomeType.CrystalTundra: return buildTundraStructure(pos, rng);
    case BiomeType.TwilightMarsh: return buildMarshStructure(pos, rng);
    case BiomeType.SunlitMeadows: return buildMeadowStructure(pos, rng);
    case BiomeType.Desert:      return buildDesertStructure(pos, rng);
    default: return null;
  }
}

// ── Teldrassil: Elven Ruins & Moon Shrines ───────────────────────────────────

function buildTeldrassilStructure(pos: THREE.Vector3, rng: Rng): THREE.Group {
  const pick = Math.floor(rng.next() * 3);
  switch (pick) {
    case 0: return buildElvenShrine(pos);
    case 1: return buildMossyRuins(pos);
    default: return buildAncientPillarCircle(pos);
  }
}

function buildElvenShrine(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = mat(0x8899aa, 0.75);
  const glowMat = mat(0x99aaff, 0.2, 0, 0x5566ff, 1.4);
  // Base
  addMesh(g, new THREE.CylinderGeometry(1.8, 2.2, 0.4, 8), stone, 0, 0.2);
  addMesh(g, new THREE.CylinderGeometry(0.9, 1.0, 0.25, 8), stone, 0, 0.6);
  // Central obelisk
  addMesh(g, new THREE.CylinderGeometry(0.18, 0.22, 3.5, 6), stone, 0, 2.15);
  // Top crystal
  addMesh(g, new THREE.OctahedronGeometry(0.4), glowMat, 0, 4.1, 0, 0, 0, 0, false);
  // Ring of small pillars
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const px = Math.cos(a) * 1.4, pz = Math.sin(a) * 1.4;
    addMesh(g, new THREE.CylinderGeometry(0.08, 0.10, 1.2, 6), stone, px, 0.8, pz);
  }
  return g;
}

function buildMossyRuins(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = mat(0x667755, 0.9);
  // Partial wall sections
  addMesh(g, new THREE.BoxGeometry(3, 2.5, 0.5), stone, 0, 1.25, -1.2);
  addMesh(g, new THREE.BoxGeometry(0.5, 1.8, 2.5), stone, 1.25, 0.9, 0);
  addMesh(g, new THREE.BoxGeometry(1.2, 1.0, 0.5), stone, -0.9, 0.5, 1.5);
  // Fallen column
  addMesh(g, new THREE.CylinderGeometry(0.3, 0.35, 2.5, 8), stone, -0.6, 0.3, 0.5, 0, 0, Math.PI / 2.2);
  // Floor stones
  for (let i = 0; i < 5; i++) {
    const fx = (i % 3 - 1) * 0.8, fz = Math.floor(i / 3) * 0.8 - 0.4;
    addMesh(g, new THREE.BoxGeometry(0.7, 0.12, 0.65), stone, fx, 0.06, fz);
  }
  return g;
}

function buildAncientPillarCircle(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = mat(0x7788aa, 0.8);
  const glow = mat(0x2244ff, 0.15, 0, 0x1133cc, 0.8);
  // Floor circle
  addMesh(g, new THREE.CylinderGeometry(3, 3.2, 0.18, 12), stone, 0, 0.09);
  // 8 standing pillars, some broken
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.cos(a) * 2.5, pz = Math.sin(a) * 2.5;
    const h = i % 3 === 0 ? 1.2 : 2.8; // some broken
    addMesh(g, new THREE.CylinderGeometry(0.22, 0.25, h, 6), stone, px, h / 2, pz);
  }
  // Central glowing rune stone
  addMesh(g, new THREE.OctahedronGeometry(0.5), glow, 0, 0.5, 0, 0, 0, 0, false);
  return g;
}

// ── Ember Wastes: Volcanic Forges & Obsidian Towers ──────────────────────────

function buildEmberStructure(pos: THREE.Vector3, rng: Rng, dist: number): THREE.Group {
  const pick = dist > 300 ? 2 : Math.floor(rng.next() * 3);
  switch (pick) {
    case 0: return buildAbandonedForge(pos);
    case 1: return buildLavaShrine(pos);
    default: return buildObsidianWatchtower(pos);
  }
}

function buildAbandonedForge(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const obsidian = mat(0x1a1a2a, 0.3, 0.6);
  const iron = mat(0x444455, 0.5, 0.8);
  const lava = mat(0xff4400, 0.1, 0, 0xff2200, 2.2);
  // Building walls
  addMesh(g, new THREE.BoxGeometry(4, 0.3, 3.5), obsidian, 0, 0.15);
  addMesh(g, new THREE.BoxGeometry(0.35, 3, 3.5), obsidian, -1.8, 1.5);
  addMesh(g, new THREE.BoxGeometry(0.35, 3, 3.5), obsidian,  1.8, 1.5);
  addMesh(g, new THREE.BoxGeometry(4, 3, 0.35), obsidian, 0, 1.5, -1.6);
  // Chimney
  addMesh(g, new THREE.CylinderGeometry(0.35, 0.4, 3, 8), iron, 1.2, 1.5, -1.2);
  // Lava pool inside
  addMesh(g, new THREE.CylinderGeometry(0.8, 0.9, 0.3, 10), lava, 0, 0.45, 0.3, 0, 0, 0, false);
  // Anvil shape
  addMesh(g, new THREE.BoxGeometry(0.6, 0.6, 0.9), iron, -0.8, 0.6, 0.5);
  addMesh(g, new THREE.BoxGeometry(0.9, 0.2, 0.7), iron, -0.8, 1.0, 0.5);
  return g;
}

function buildLavaShrine(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const dark = mat(0x220a00, 0.9);
  const obsidian = mat(0x111122, 0.2, 0.7);
  const lava = mat(0xff6600, 0.05, 0, 0xff3300, 2.5);
  // Stepped base
  addMesh(g, new THREE.CylinderGeometry(2.5, 3, 0.5, 8), dark, 0, 0.25);
  addMesh(g, new THREE.CylinderGeometry(1.8, 2.0, 0.5, 8), dark, 0, 0.75);
  addMesh(g, new THREE.CylinderGeometry(1.0, 1.2, 0.5, 8), dark, 0, 1.25);
  // Altar top
  addMesh(g, new THREE.BoxGeometry(1.2, 0.3, 0.9), obsidian, 0, 1.65);
  // Lava bowl on top
  addMesh(g, new THREE.SphereGeometry(0.5, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), lava, 0, 1.95, 0, 0, 0, 0, false);
  // 4 horn pillars
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * 2, pz = Math.sin(a) * 2;
    addMesh(g, new THREE.CylinderGeometry(0.15, 0.2, 2.5, 5), dark, px, 1.25, pz);
    addMesh(g, new THREE.ConeGeometry(0.15, 0.6, 5), dark, px, 2.8, pz);
  }
  return g;
}

function buildObsidianWatchtower(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const obsidian = mat(0x1a1020, 0.25, 0.7);
  const iron = mat(0x222244, 0.5, 0.8);
  const torch = mat(0xff8800, 0.1, 0, 0xff4400, 2.0);
  // Main tower shaft
  addMesh(g, new THREE.CylinderGeometry(1.2, 1.5, 8, 8), obsidian, 0, 4);
  // Battlement top
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.cos(a) * 1.1, pz = Math.sin(a) * 1.1;
    if (i % 2 === 0) addMesh(g, new THREE.BoxGeometry(0.4, 0.8, 0.4), obsidian, px, 8.4, pz);
  }
  // Floor ring
  addMesh(g, new THREE.CylinderGeometry(1.8, 1.8, 0.2, 8), iron, 0, 8.1);
  // Door arch
  addMesh(g, new THREE.BoxGeometry(0.6, 1.8, 0.2), obsidian, 0, 0.9, 1.5);
  // Torches on sides
  for (let i = 0; i < 2; i++) {
    const px = (i === 0 ? -1 : 1) * 1.3;
    addMesh(g, new THREE.CylinderGeometry(0.06, 0.06, 0.6, 5), iron, px, 5.3, 1.2, 0, 0, 0, false);
    addMesh(g, new THREE.SphereGeometry(0.12, 6, 6), torch, px, 5.75, 1.2, 0, 0, 0, false);
  }
  return g;
}

// ── Crystal Tundra: Ice Structures ───────────────────────────────────────────

function buildTundraStructure(pos: THREE.Vector3, _rng?: Rng): THREE.Group {
  const pick = Math.floor((_rng?.next() ?? Math.random()) * 3);
  switch (pick) {
    case 0: return buildIceFortressRuin(pos);
    case 1: return buildFrozenCaravan(pos);
    default: return buildCrystalObservatory(pos);
  }
}

function buildIceFortressRuin(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const ice = mat(0x88bbdd, 0.05, 0.3, 0x6699cc, 0.3);
  const snow = mat(0xddeeee, 0.95);
  // Partial wall
  addMesh(g, new THREE.BoxGeometry(5, 3, 0.6), ice, 0, 1.5, -2);
  addMesh(g, new THREE.BoxGeometry(0.6, 4, 3.5), ice, 2.2, 2, 0);
  addMesh(g, new THREE.BoxGeometry(0.6, 2, 3.5), ice, -2.2, 1, 0);
  // Snow on top
  addMesh(g, new THREE.BoxGeometry(5.2, 0.3, 0.8), snow, 0, 3.15, -2, 0, 0, 0, false);
  // Ice pillars
  for (let i = 0; i < 3; i++) {
    const px = (i - 1) * 1.8;
    addMesh(g, new THREE.CylinderGeometry(0.25, 0.35, 2 + i * 0.5, 6), ice, px, (2 + i * 0.5) / 2, -0.5);
  }
  // Floor slab
  addMesh(g, new THREE.BoxGeometry(5, 0.2, 4), snow, 0, 0.1);
  return g;
}

function buildFrozenCaravan(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const wood = mat(0x4a3520, 0.9);
  const canvas = mat(0xccddee, 0.85, 0, 0x8899aa, 0.05);
  const ice = mat(0xaaccdd, 0.1, 0.2);
  const snow = mat(0xeef5f5, 0.95);
  // Wagon body
  addMesh(g, new THREE.BoxGeometry(3, 1.2, 1.8), wood, 0, 0.8);
  // Wheels (4, half buried)
  const wGeo = new THREE.TorusGeometry(0.55, 0.1, 6, 12);
  for (const [wx, wz] of [[-1.1, -0.7], [-1.1, 0.7], [1.1, -0.7], [1.1, 0.7]] as [number,number][]) {
    addMesh(g, wGeo, wood, wx, 0.55, wz, Math.PI / 2);
  }
  // Tarp / canvas cover
  addMesh(g, new THREE.BoxGeometry(2.8, 0.8, 1.6), canvas, 0, 1.8, 0, 0, 0, 0, false);
  // Snow accumulation
  addMesh(g, new THREE.BoxGeometry(3.2, 0.25, 2), snow, 0, 2.3, 0, 0, 0, 0, false);
  // Ice encroachment
  addMesh(g, new THREE.SphereGeometry(1.2, 8, 8), ice, -1.5, 0, 0.5, 0, 0, 0, false);
  addMesh(g, new THREE.SphereGeometry(0.8, 8, 8), ice, 1.2, 0, -0.8, 0, 0, 0, false);
  return g;
}

function buildCrystalObservatory(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = mat(0x667788, 0.7);
  const crystal = mat(0x88ccff, 0.05, 0.4, 0x44aaee, 1.2);
  // Dome base
  addMesh(g, new THREE.CylinderGeometry(2.5, 2.8, 1, 12), stone, 0, 0.5);
  addMesh(g, new THREE.CylinderGeometry(2, 2.5, 0.5, 12), stone, 0, 1.25);
  // Dome (glass-like crystal)
  addMesh(g, new THREE.SphereGeometry(2, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), crystal, 0, 1.5, 0, 0, 0, 0, false);
  // Central crystal spire through dome
  addMesh(g, new THREE.CylinderGeometry(0.15, 0.25, 4, 6), crystal, 0, 3.5, 0, 0, 0, 0, false);
  addMesh(g, new THREE.ConeGeometry(0.3, 1, 6), crystal, 0, 5.5, 0, 0, 0, 0, false);
  // Outer ring of smaller crystals
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.cos(a) * 2.2, pz = Math.sin(a) * 2.2;
    const h = 0.6 + (i % 3) * 0.3;
    addMesh(g, new THREE.ConeGeometry(0.1, h, 5), crystal, px, h / 2 + 0.3, pz, 0, 0, 0, false);
  }
  return g;
}

// ── Twilight Marsh: Swamp Structures ─────────────────────────────────────────

function buildMarshStructure(pos: THREE.Vector3, _rng?: Rng): THREE.Group {
  const pick = Math.floor((_rng?.next() ?? Math.random()) * 3);
  switch (pick) {
    case 0: return buildSwampHut(pos);
    case 1: return buildDrownedTemple(pos);
    default: return buildWillowLanternPost(pos);
  }
}

function buildSwampHut(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const darkWood = mat(0x1a1208, 0.95);
  const thatch = mat(0x2d3a1a, 0.9);
  const bone = mat(0xc8c8a8, 0.85);
  const glow = mat(0x44ff88, 0.2, 0, 0x22ee66, 1.5);
  // Stilts (4 legs lifting the hut)
  for (const [sx, sz] of [[-1.2,-1],[-1.2,1],[1.2,-1],[1.2,1]] as [number,number][]) {
    addMesh(g, new THREE.CylinderGeometry(0.12, 0.15, 2.5, 6), darkWood, sx, 1.25, sz);
  }
  // Floor
  addMesh(g, new THREE.BoxGeometry(2.8, 0.25, 2.2), darkWood, 0, 2.62);
  // Walls
  addMesh(g, new THREE.BoxGeometry(2.8, 1.8, 0.2), darkWood, 0, 3.65, -1);
  addMesh(g, new THREE.BoxGeometry(2.8, 1.8, 0.2), darkWood, 0, 3.65,  1);
  addMesh(g, new THREE.BoxGeometry(0.2, 1.8, 2.2), darkWood, -1.3, 3.65, 0);
  addMesh(g, new THREE.BoxGeometry(0.2, 1.8, 2.2), darkWood,  1.3, 3.65, 0);
  // Roof
  addMesh(g, new THREE.ConeGeometry(2.2, 1.5, 4), thatch, 0, 5.3, 0, 0, Math.PI / 4);
  // Hanging bones / charms
  for (let i = 0; i < 3; i++) {
    const bx = (i - 1) * 0.8;
    addMesh(g, new THREE.SphereGeometry(0.08, 5, 5), bone, bx, 4.5, -1.1, 0, 0, 0, false);
    addMesh(g, new THREE.CylinderGeometry(0.04, 0.04, 0.5, 4), bone, bx, 4.2, -1.1, 0, 0, 0, false);
  }
  // Glow orb inside (visible through gaps)
  addMesh(g, new THREE.SphereGeometry(0.25, 8, 8), glow, 0, 3.3, 0, 0, 0, 0, false);
  return g;
}

function buildDrownedTemple(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mossy = mat(0x2d4a20, 0.95);
  const stone = mat(0x445555, 0.85);
  const algae = mat(0x1a5520, 0.7, 0, 0x0a3310, 0.2);
  // Partially sunk base (at/below ground level to simulate sinking)
  addMesh(g, new THREE.BoxGeometry(5, 1.5, 5), mossy, 0, -0.5);
  addMesh(g, new THREE.BoxGeometry(4, 1, 4), stone, 0, 0.5);
  // Columns (some tilted from sinking)
  const angles = [0, 0.12, 0, -0.08, 0.05, 0, 0, -0.1];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.cos(a) * 1.8, pz = Math.sin(a) * 1.8;
    const h = 1.5 + (i % 3 === 0 ? 0 : 1.8);
    addMesh(g, new THREE.CylinderGeometry(0.25, 0.3, h, 8), stone, px, 1 + h / 2, pz, angles[i] ?? 0);
  }
  // Algae on ground
  for (let i = 0; i < 6; i++) {
    const ax = (Math.random() - 0.5) * 3.5, az = (Math.random() - 0.5) * 3.5;
    addMesh(g, new THREE.CylinderGeometry(0.4 + Math.random() * 0.3, 0.5, 0.05, 8), algae, ax, 1.05, az, 0, 0, 0, false);
  }
  return g;
}

function buildWillowLanternPost(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const darkWood = mat(0x1a1a0a, 0.9);
  const lanternGlow = mat(0x88ffaa, 0.1, 0, 0x44ee88, 2.0);
  const chain = mat(0x333333, 0.5, 0.7);
  // Cluster of 3 posts at different heights
  const heights = [3.5, 2.8, 4.2];
  const offsets: [number,number][] = [[0,0],[-1.0,0.6],[0.8,-0.8]];
  for (let i = 0; i < 3; i++) {
    const [ox, oz] = offsets[i]!;
    const h = heights[i]!;
    addMesh(g, new THREE.CylinderGeometry(0.08, 0.12, h, 6), darkWood, ox, h / 2, oz);
    // Lantern cage
    addMesh(g, new THREE.BoxGeometry(0.3, 0.35, 0.3), lanternGlow, ox, h + 0.2, oz, 0, 0, 0, false);
    // Chain
    addMesh(g, new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4), chain, ox, h - 0.1, oz, 0, 0, 0, false);
  }
  return g;
}

// ── Sunlit Meadows: Cozy Settlements ────────────────────────────────────────

function buildMeadowStructure(pos: THREE.Vector3, _rng?: Rng): THREE.Group {
  const pick = Math.floor((_rng?.next() ?? Math.random()) * 4);
  switch (pick) {
    case 0: return buildRoadsideInn(pos);
    case 1: return buildMarketStall(pos);
    case 2: return buildStoneWindmill(pos);
    default: return buildFarmhouseRuin(pos);
  }
}

function buildRoadsideInn(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const plaster = mat(0xd4b896, 0.88);
  const timber = mat(0x5a3a1a, 0.85);
  const thatch = mat(0x7a5a1a, 0.92);
  const sign = mat(0x8b5e2f, 0.85);
  const lanternGlow = mat(0xffaa33, 0.1, 0, 0xff7700, 1.6);
  const stone = mat(0x888888, 0.8);
  // Foundation
  addMesh(g, new THREE.BoxGeometry(6, 0.35, 4), stone, 0, 0.17);
  // Walls
  addMesh(g, new THREE.BoxGeometry(6, 3.5, 0.3), plaster, 0, 1.75+0.17, -1.85);
  addMesh(g, new THREE.BoxGeometry(6, 3.5, 0.3), plaster, 0, 1.75+0.17,  1.85);
  addMesh(g, new THREE.BoxGeometry(0.3, 3.5, 4), plaster, -2.85, 1.75+0.17);
  addMesh(g, new THREE.BoxGeometry(0.3, 3.5, 4), plaster,  2.85, 1.75+0.17);
  // Timber cross-beams on front wall
  for (let i = 0; i < 3; i++) {
    addMesh(g, new THREE.BoxGeometry(0.12, 0.12, 3.7), timber, (i-1)*2.2, 1.5+0.17, -1.85);
  }
  addMesh(g, new THREE.BoxGeometry(6, 0.12, 0.12), timber, 0, 2.8+0.17, -1.85);
  // Thatched roof (gabled)
  addMesh(g, new THREE.BoxGeometry(6.4, 0.2, 4.4), thatch, 0, 3.55);
  addMesh(g, new THREE.CylinderGeometry(0.1, 3.6, 1.8, 4), thatch, 0, 4.55, 0, 0, Math.PI/4);
  // Chimney
  addMesh(g, new THREE.BoxGeometry(0.7, 2, 0.7), stone, 1.8, 4, -1.2);
  // Sign post
  addMesh(g, new THREE.CylinderGeometry(0.06, 0.07, 3, 6), timber, 2.5, 1.5, -1.5);
  addMesh(g, new THREE.BoxGeometry(1.2, 0.5, 0.1), sign, 2.5, 2.8, -1.5);
  // Lanterns flanking door
  for (const lx of [-0.6, 0.6]) {
    addMesh(g, new THREE.SphereGeometry(0.15, 8, 8), lanternGlow, lx, 2.2, -1.85, 0, 0, 0, false);
  }
  return g;
}

function buildMarketStall(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const wood = mat(0x5a3a1a, 0.9);
  const canvas = mat(0xe8c87a, 0.85);
  const goods = mat(0x8b4513, 0.9);
  // 4 poles
  for (const [px, pz] of [[-1.5,-1],[-1.5,1],[1.5,-1],[1.5,1]] as [number,number][]) {
    addMesh(g, new THREE.CylinderGeometry(0.07, 0.09, 3, 6), wood, px, 1.5, pz);
  }
  // Awning
  addMesh(g, new THREE.BoxGeometry(3.2, 0.1, 2.2), canvas, 0, 3.1, 0, 0.15, 0, 0, false);
  // Counter
  addMesh(g, new THREE.BoxGeometry(2.8, 0.15, 0.6), wood, 0, 1.1, -0.7);
  addMesh(g, new THREE.BoxGeometry(2.8, 0.9, 0.4), wood, 0, 0.6, -0.7);
  // Goods on counter
  for (let i = 0; i < 5; i++) {
    const gx = (i - 2) * 0.5;
    const h = 0.1 + Math.random() * 0.2;
    addMesh(g, new THREE.CylinderGeometry(0.12, 0.14, h, 6), goods, gx, 1.25 + h / 2, -0.65, 0, 0, 0, false);
  }
  return g;
}

function buildStoneWindmill(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = mat(0x888070, 0.85);
  const wood = mat(0x4a2e10, 0.92);
  const canvas = mat(0xd8c8a0, 0.88);
  // Tower
  addMesh(g, new THREE.CylinderGeometry(1.2, 1.6, 6, 12), stone, 0, 3);
  // Cap
  addMesh(g, new THREE.ConeGeometry(1.4, 2, 12), wood, 0, 7);
  // Door
  addMesh(g, new THREE.BoxGeometry(0.65, 1.2, 0.25), stone, 0, 0.6, 1.55);
  // Sails (4) — visual only
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const sx = Math.cos(a) * 2, sy = Math.sin(a) * 2;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(0.15, 2.5, 0.5), canvas);
    slab.position.set(sx, 7 + sy, 1.3);
    slab.rotation.z = a;
    slab.castShadow = true;
    slab.userData.noCollision = true;
    g.add(slab);
  }
  return g;
}

function buildFarmhouseRuin(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = mat(0x7a6a5a, 0.9);
  const moss = mat(0x3a5a2a, 0.95);
  // Partial walls
  addMesh(g, new THREE.BoxGeometry(4.5, 2, 0.4), stone, 0, 1, -2);
  addMesh(g, new THREE.BoxGeometry(0.4, 2.8, 4.5), stone, -2, 1.4, 0);
  addMesh(g, new THREE.BoxGeometry(2, 1.2, 0.4), stone, 1, 0.6, 2);
  // Fallen roof beam
  addMesh(g, new THREE.CylinderGeometry(0.15, 0.18, 4, 7), stone, 0.5, 0.35, 0, 0, 0, Math.PI / 2.5);
  // Moss on top of walls
  addMesh(g, new THREE.BoxGeometry(4.7, 0.2, 0.5), moss, 0, 2.1, -2, 0, 0, 0, false);
  addMesh(g, new THREE.BoxGeometry(0.5, 0.2, 4.7), moss, -2, 2.9, 0, 0, 0, 0, false);
  // Overgrown floor
  addMesh(g, new THREE.BoxGeometry(4, 0.15, 4), moss, 0, 0.07, 0, 0, 0, 0, false);
  return g;
}

// ── Desert: Ancient Ruins & Tombs ───────────────────────────────────────────

function buildDesertStructure(pos: THREE.Vector3, _rng?: Rng): THREE.Group {
  const pick = Math.floor((_rng?.next() ?? Math.random()) * 3);
  switch (pick) {
    case 0: return buildSandTomb(pos);
    case 1: return buildObeliskPair(pos);
    default: return buildAncientGate(pos);
  }
}

function buildSandTomb(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const sandstone = mat(0xd4a850, 0.9);
  const dark = mat(0x1a0a00, 0.85);
  const glow = mat(0xffcc00, 0.1, 0, 0xdd9900, 1.0);
  // Main pyramid
  addMesh(g, new THREE.ConeGeometry(4, 4, 4), sandstone, 0, 2, 0, 0, Math.PI / 4);
  // Door
  addMesh(g, new THREE.BoxGeometry(1, 1.5, 0.5), dark, 0, 0.75, 2.8);
  // Hieroglyph tablets (flat stones leaning against pyramid)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const px = Math.cos(a) * 2.5, pz = Math.sin(a) * 2.5;
    addMesh(g, new THREE.BoxGeometry(0.7, 1.2, 0.15), sandstone, px, 0.6, pz, 0, -a);
  }
  // Gold capstone
  addMesh(g, new THREE.OctahedronGeometry(0.3), glow, 0, 4.2, 0, 0, 0, 0, false);
  return g;
}

function buildObeliskPair(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const sandstone = mat(0xcc9940, 0.85);
  const gold = mat(0xffdd44, 0.2, 0.8, 0xddaa00, 0.5);
  const base = mat(0xaa7830, 0.9);
  // Two obelisks
  for (const ox of [-2.5, 2.5]) {
    addMesh(g, new THREE.BoxGeometry(0.9, 0.4, 0.9), base, ox, 0.2);
    addMesh(g, new THREE.BoxGeometry(0.7, 5, 0.7), sandstone, ox, 2.9);
    addMesh(g, new THREE.ConeGeometry(0.45, 0.8, 4), gold, ox, 6.2, 0, 0, Math.PI / 4, 0, false);
  }
  // Linking stone arch base
  addMesh(g, new THREE.BoxGeometry(5.4, 0.35, 0.6), sandstone, 0, 5.2);
  return g;
}

function buildAncientGate(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const sandstone = mat(0xc8904a, 0.88);
  const dark = mat(0x1a0500, 0.9);
  const gold = mat(0xffee55, 0.1, 0.8, 0xddcc00, 0.8);
  // Two pillars
  for (const ox of [-2, 2]) {
    addMesh(g, new THREE.BoxGeometry(1.1, 5.5, 1.1), sandstone, ox, 2.75);
    addMesh(g, new THREE.BoxGeometry(1.3, 0.4, 1.3), sandstone, ox, 5.7);
  }
  // Lintel
  addMesh(g, new THREE.BoxGeometry(4.5, 0.8, 1.0), sandstone, 0, 6.1);
  // Arch detail
  addMesh(g, new THREE.BoxGeometry(4.5, 0.2, 0.8), dark, 0, 5.5, 0, 0, 0, 0, false);
  // Gold rune carvings on lintel
  addMesh(g, new THREE.BoxGeometry(3.5, 0.3, 0.15), gold, 0, 6.1, -0.48, 0, 0, 0, false);
  // Scattered debris
  for (let i = 0; i < 4; i++) {
    const dx = (Math.random() - 0.5) * 5, dz = (Math.random() - 0.5) * 2;
    addMesh(g, new THREE.BoxGeometry(0.4 + Math.random() * 0.4, 0.2, 0.4 + Math.random() * 0.3), sandstone, dx, 0.1, dz);
  }
  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  AMBIENT PROPS
// ════════════════════════════════════════════════════════════════════════════

export function buildBiomeProp(
  biome: BiomeType,
  pos: THREE.Vector3,
  scale: number,
  _rng: Rng,
): THREE.Group | null {
  switch (biome) {
    case BiomeType.Teldrassil:  return buildTeldrassilProp(pos, scale, _rng);
    case BiomeType.EmberWastes: return buildEmberProp(pos, scale, _rng);
    case BiomeType.CrystalTundra: return buildTundraProp(pos, scale, _rng);
    case BiomeType.TwilightMarsh: return buildMarshProp(pos, scale, _rng);
    case BiomeType.SunlitMeadows: return buildMeadowProp(pos, scale, _rng);
    case BiomeType.Desert:      return buildDesertProp(pos, scale, _rng);
    default: return null;
  }
}

function buildTeldrassilProp(pos: THREE.Vector3, scale: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const pick = rng.nextInt(4);
  if (pick === 0) {
    // Giant mushroom
    const stem = mat(0xc8b090, 0.8);
    const cap = mat(0x6622aa, 0.6, 0, 0x440088, 0.6);
    addMesh(g, new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 2 * scale, 7), stem, 0, scale);
    addMesh(g, new THREE.SphereGeometry(0.9 * scale, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 2.1 * scale, 0, 0, 0, 0, false);
    // Spore particles
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2, r = 0.6 * scale;
      addMesh(g, new THREE.SphereGeometry(0.06 * scale, 5, 5), cap, Math.cos(a) * r, (1.8 + Math.random() * 0.4) * scale, Math.sin(a) * r, 0, 0, 0, false);
    }
  } else if (pick === 1) {
    // Moonstone pillar
    const stone = mat(0x8899bb, 0.5, 0.3, 0x5566aa, 0.3);
    addMesh(g, new THREE.CylinderGeometry(0.35 * scale, 0.45 * scale, 2.5 * scale, 6), stone, 0, 1.25 * scale);
    addMesh(g, new THREE.OctahedronGeometry(0.4 * scale), stone, 0, 2.8 * scale, 0, 0, 0, 0, false);
  } else if (pick === 2) {
    // Glowing root cluster
    const root = mat(0x3a2210, 0.95);
    const glow = mat(0xaaddff, 0.2, 0, 0x66aaff, 0.8);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const rx = Math.cos(a) * 0.5 * scale, rz = Math.sin(a) * 0.5 * scale;
      addMesh(g, new THREE.CylinderGeometry(0.1 * scale, 0.18 * scale, 0.6 * scale + Math.random() * 0.4 * scale, 5), root, rx, 0.3 * scale, rz, Math.random() * 0.3, 0, 0);
    }
    addMesh(g, new THREE.SphereGeometry(0.22 * scale, 7, 7), glow, 0, 0.22 * scale, 0, 0, 0, 0, false);
  } else {
    // Ancient tree stump
    const stump = mat(0x3a2510, 0.95);
    const moss = mat(0x2a5a1a, 0.9);
    addMesh(g, new THREE.CylinderGeometry(0.55 * scale, 0.7 * scale, 1.0 * scale, 10), stump, 0, 0.5 * scale);
    addMesh(g, new THREE.CylinderGeometry(0.6 * scale, 0.6 * scale, 0.15 * scale, 10), moss, 0, 1.07 * scale, 0, 0, 0, 0, false);
  }
  return g;
}

function buildEmberProp(pos: THREE.Vector3, scale: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const pick = rng.nextInt(3);
  if (pick === 0) {
    // Obsidian boulder cluster
    const obs = mat(0x111122, 0.2, 0.7);
    for (let i = 0; i < 3; i++) {
      const ox = (Math.random() - 0.5) * scale, oz = (Math.random() - 0.5) * scale;
      const s = (0.4 + Math.random() * 0.5) * scale;
      addMesh(g, new THREE.DodecahedronGeometry(s, 0), obs, ox, s * 0.5, oz);
    }
  } else if (pick === 1) {
    // Lava fissure (crack in ground with emissive glow)
    const rock = mat(0x1a0800, 0.9);
    const lava = mat(0xff5500, 0.05, 0, 0xff2200, 3.0);
    addMesh(g, new THREE.BoxGeometry(2.5 * scale, 0.3, 0.4 * scale), rock, 0, 0.15, 0, 0, 0.1, 0);
    addMesh(g, new THREE.BoxGeometry(2 * scale, 0.1, 0.25 * scale), lava, 0, 0.1, 0, 0, 0, 0, false);
    // Ember particles above fissure
    for (let i = 0; i < 4; i++) {
      const ex = (Math.random() - 0.5) * 1.5 * scale;
      addMesh(g, new THREE.SphereGeometry(0.05 * scale, 4, 4), lava, ex, 0.3 + Math.random() * 0.4, 0, 0, 0, 0, false);
    }
  } else {
    // Bone pile
    const bone = mat(0xc8c0a0, 0.9);
    for (let i = 0; i < 5; i++) {
      const bx = (Math.random() - 0.5) * 1.5 * scale;
      const bz = (Math.random() - 0.5) * 1.0 * scale;
      const blen = (0.3 + Math.random() * 0.4) * scale;
      addMesh(g, new THREE.CylinderGeometry(0.05 * scale, 0.08 * scale, blen, 5), bone, bx, 0.05 * scale, bz, 0, 0, Math.random() * Math.PI, false);
    }
    // Skull
    addMesh(g, new THREE.SphereGeometry(0.2 * scale, 8, 8), bone, 0, 0.2 * scale, 0, 0, 0, 0, false);
  }
  return g;
}

function buildTundraProp(pos: THREE.Vector3, scale: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const pick = rng.nextInt(3);
  if (pick === 0) {
    // Ice shard cluster
    const ice = mat(0x88ccee, 0.05, 0.4, 0x55aacc, 0.6);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const r = 0.3 * scale, h = (0.4 + Math.random() * 0.8) * scale;
      addMesh(g, new THREE.ConeGeometry(0.12 * scale, h, 5), ice, Math.cos(a) * r, h / 2, Math.sin(a) * r, Math.random() * 0.2, 0, 0, false);
    }
    addMesh(g, new THREE.ConeGeometry(0.2 * scale, 1.5 * scale, 5), ice, 0, 0.75 * scale, 0, 0, 0, 0, false);
  } else if (pick === 1) {
    // Frozen tree
    const bark = mat(0x334455, 0.9);
    const frost = mat(0xcceeee, 0.1, 0.1);
    addMesh(g, new THREE.CylinderGeometry(0.2 * scale, 0.3 * scale, 3 * scale, 7), bark, 0, 1.5 * scale);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, h = (1 + i * 0.6) * scale;
      addMesh(g, new THREE.CylinderGeometry(0.08 * scale, 0.12 * scale, 1.2 * scale, 5), bark, Math.cos(a) * 0.4 * scale, h, Math.sin(a) * 0.4 * scale, 0, 0, Math.PI / 6);
    }
    addMesh(g, new THREE.SphereGeometry(1.0 * scale, 8, 6), frost, 0, 3.5 * scale, 0, 0, 0, 0, false);
  } else {
    // Snowdrift over rock
    const rock = mat(0x556677, 0.85);
    const snow = mat(0xeef5f5, 0.95);
    addMesh(g, new THREE.SphereGeometry(0.7 * scale, 8, 8), rock, 0, 0.4 * scale);
    addMesh(g, new THREE.SphereGeometry(0.75 * scale, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), snow, 0, 0.7 * scale, 0, 0, 0, 0, false);
  }
  return g;
}

function buildMarshProp(pos: THREE.Vector3, scale: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const pick = rng.nextInt(3);
  if (pick === 0) {
    // Gnarled bog log
    const log = mat(0x1a1208, 0.95);
    const moss = mat(0x1a4a12, 0.9);
    addMesh(g, new THREE.CylinderGeometry(0.25 * scale, 0.3 * scale, 2.5 * scale, 7), log, 0, 0.25 * scale, 0, 0, 0, Math.PI / 2.2);
    // Moss patches
    for (let i = 0; i < 3; i++) {
      addMesh(g, new THREE.SphereGeometry(0.28 * scale, 6, 5, 0, Math.PI * 2, 0, Math.PI / 2), moss, (i - 1) * 0.6 * scale, 0.4 * scale, 0, 0, 0, 0, false);
    }
  } else if (pick === 1) {
    // Will-o-wisp orb on stake
    const wood = mat(0x1a0f08, 0.95);
    const wisp = mat(0x88ffaa, 0.05, 0, 0x44ee88, 2.8);
    addMesh(g, new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 2 * scale, 5), wood, 0, scale);
    addMesh(g, new THREE.SphereGeometry(0.22 * scale, 8, 8), wisp, 0, 2.3 * scale, 0, 0, 0, 0, false);
  } else {
    // Mushroom ring
    const stem = mat(0xd4c490, 0.8);
    const cap = mat(0x228833, 0.7, 0, 0x114422, 0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = 0.8 * scale;
      const h = (0.25 + Math.random() * 0.25) * scale;
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      addMesh(g, new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, h, 6), stem, px, h / 2, pz, 0, 0, 0, false);
      addMesh(g, new THREE.SphereGeometry(0.22 * scale, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), cap, px, h, pz, 0, 0, 0, false);
    }
  }
  return g;
}

function buildMeadowProp(pos: THREE.Vector3, scale: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const pick = rng.nextInt(4);
  if (pick === 0) {
    // Wildflower cluster
    const stem = mat(0x3a6a20, 0.9);
    const flower = mat(0xee6644, 0.7, 0, 0xdd4422, 0.15);
    const flower2 = mat(0xeecc22, 0.7, 0, 0xddaa00, 0.1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = Math.random() * 0.6 * scale;
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      const h = (0.3 + Math.random() * 0.4) * scale;
      addMesh(g, new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, h, 4), stem, px, h / 2, pz, 0, 0, 0, false);
      const fMat = i % 2 === 0 ? flower : flower2;
      addMesh(g, new THREE.SphereGeometry(0.1 * scale, 6, 5), fMat, px, h, pz, 0, 0, 0, false);
    }
  } else if (pick === 1) {
    // Stone wall section
    const stone = mat(0x887766, 0.92);
    addMesh(g, new THREE.BoxGeometry(2.5 * scale, 0.9 * scale, 0.4 * scale), stone, 0, 0.45 * scale);
    // Irregular top stones
    for (let i = 0; i < 5; i++) {
      const sx = (i - 2) * 0.45 * scale, sy = (0.1 + Math.random() * 0.15) * scale;
      addMesh(g, new THREE.BoxGeometry(0.4 * scale, sy, 0.38 * scale), stone, sx, 0.9 * scale + sy / 2);
    }
  } else if (pick === 2) {
    // Hay bale
    const hay = mat(0xd4aa44, 0.9);
    addMesh(g, new THREE.CylinderGeometry(0.7 * scale, 0.7 * scale, 1.2 * scale, 12), hay, 0, 0.7 * scale, 0, 0, 0, Math.PI / 2);
    // Binding twine rings
    const twine = mat(0x8a6a20, 0.95);
    for (const ty of [0.3, 0.9]) {
      addMesh(g, new THREE.TorusGeometry(0.72 * scale, 0.03 * scale, 5, 12), twine, 0, ty * scale + 0.15, 0, Math.PI / 2, 0, 0, false);
    }
  } else {
    // Old well
    const stone = mat(0x887766, 0.88);
    const wood = mat(0x5a3a1a, 0.9);
    const rope = mat(0xaa8833, 0.95);
    addMesh(g, new THREE.CylinderGeometry(0.7 * scale, 0.8 * scale, 0.9 * scale, 10), stone, 0, 0.45 * scale);
    // Rim
    addMesh(g, new THREE.TorusGeometry(0.75 * scale, 0.08 * scale, 6, 12), stone, 0, 0.94 * scale, 0, Math.PI / 2, 0, 0);
    // Posts
    addMesh(g, new THREE.CylinderGeometry(0.06 * scale, 0.07 * scale, 1.5 * scale, 6), wood, -0.65 * scale, 1.65 * scale, 0);
    addMesh(g, new THREE.CylinderGeometry(0.06 * scale, 0.07 * scale, 1.5 * scale, 6), wood, 0.65 * scale, 1.65 * scale, 0);
    // Crossbar
    addMesh(g, new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 1.5 * scale, 6), wood, 0, 2.35 * scale, 0, 0, 0, Math.PI / 2);
    // Bucket rope
    addMesh(g, new THREE.CylinderGeometry(0.02 * scale, 0.02 * scale, 0.8 * scale, 4), rope, 0, 1.95 * scale, 0, 0, 0, 0, false);
  }
  return g;
}

function buildDesertProp(pos: THREE.Vector3, scale: number, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const pick = rng.nextInt(3);
  if (pick === 0) {
    // Sandstone boulder
    const sand = mat(0xc8a050, 0.88);
    addMesh(g, new THREE.DodecahedronGeometry(0.8 * scale, 0), sand, 0, 0.6 * scale);
    addMesh(g, new THREE.DodecahedronGeometry(0.5 * scale, 0), sand, 0.7 * scale, 0.4 * scale, -0.3 * scale);
  } else if (pick === 1) {
    // Cactus cluster (Desert biome exists but hasn't specific procedural spawns yet)
    const cactus = mat(0x2a6a1a, 0.8);
    const bloom = mat(0xff4466, 0.7, 0, 0xee2244, 0.5);
    addMesh(g, new THREE.CylinderGeometry(0.18 * scale, 0.2 * scale, 2.5 * scale, 6), cactus, 0, 1.25 * scale);
    // Arms
    for (const [cx, cy, cz, rx] of [[0.4, 0.6, 0, 0], [-0.35, 0.8, 0, 0]] as [number,number,number,number][]) {
      addMesh(g, new THREE.CylinderGeometry(0.12 * scale, 0.14 * scale, scale, 5), cactus, cx * scale, cy * scale + scale * 0.5, cz, rx + Math.PI / 2.5, 0, 0);
    }
    addMesh(g, new THREE.SphereGeometry(0.14 * scale, 6, 6), bloom, 0, 2.65 * scale, 0, 0, 0, 0, false);
  } else {
    // Sun-bleached skeleton
    const bone = mat(0xe8dcc0, 0.9);
    addMesh(g, new THREE.SphereGeometry(0.22 * scale, 7, 7), bone, 0, 0.22 * scale);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bx = Math.cos(a) * 0.6 * scale, bz = Math.sin(a) * 0.6 * scale;
      addMesh(g, new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 0.9 * scale, 5), bone, bx, 0.1, bz, 0, 0, Math.PI / 2 + a, false);
    }
  }
  return g;
}
