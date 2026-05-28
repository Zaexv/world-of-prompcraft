/**
 * Biome-specific procedural props and buildings.
 *
 * Design principles:
 *  • flatShading: true on every material — stylized, readable silhouettes
 *  • Max 8–10 mesh pieces per structure to keep draw-calls low
 *  • Strong silhouettes: tall spires, interesting rooflines, clear forms
 *  • isCollider:true on solid parts, noCollision:true on decorative/emissive parts
 */

import * as THREE from 'three';
import { BiomeType } from '../../../scene/Biomes';
import * as G from './geoCache';

// ── Material cache ────────────────────────────────────────────────────────────

const _cache = new Map<string, THREE.MeshStandardMaterial>();
function m(
  hex: number,
  rough = 0.82,
  metal = 0,
  emHex?: number,
  emInt?: number,
): THREE.MeshStandardMaterial {
  const key = `${hex}|${rough}|${metal}|${emHex ?? ''}|${emInt ?? ''}`;
  let mat = _cache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardMaterial({
      color: hex, roughness: rough, metalness: metal, flatShading: true,
    });
    if (emHex !== undefined) {
      mat.emissive = new THREE.Color(emHex);
      mat.emissiveIntensity = emInt ?? 1;
    }
    _cache.set(key, mat);
  }
  return mat;
}

// ── Mesh helpers ──────────────────────────────────────────────────────────────

type Geo = THREE.BufferGeometry;

function solid(
  g: THREE.Group,
  geo: Geo,
  mat: THREE.MeshStandardMaterial,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  g.add(mesh);
  return mesh;
}

function deco(
  g: THREE.Group,
  geo: Geo,
  mat: THREE.MeshStandardMaterial,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.userData.noCollision = true;
  g.add(mesh);
  return mesh;
}

interface Rng {
  next(): number;
  nextInt(n: number): number;
  nextRange(lo: number, hi: number): number;
  chance(p: number): boolean;
  pick<T>(arr: readonly T[]): T;
}

// ════════════════════════════════════════════════════════════════════════════
//  BUILDINGS — one per biome, 3 variants each
// ════════════════════════════════════════════════════════════════════════════

export function buildBiomeBuilding(
  biome: BiomeType,
  pos: THREE.Vector3,
  rng: Rng,
  dist: number,
): THREE.Group | null {
  switch (biome) {
    case BiomeType.Teldrassil:   return _teldrassil(pos, rng);
    case BiomeType.EmberWastes:  return _ember(pos, rng, dist);
    case BiomeType.CrystalTundra:return _tundra(pos, rng);
    case BiomeType.TwilightMarsh:return _marsh(pos, rng);
    case BiomeType.SunlitMeadows:return _meadow(pos, rng);
    case BiomeType.Desert:       return _desert(pos, rng);
    default: return null;
  }
}

// ── Teldrassil ────────────────────────────────────────────────────────────────

function _teldrassil(pos: THREE.Vector3, rng: Rng): THREE.Group {
  return [_elvenTower, _moonShrine, _ruinedOutpost][rng.nextInt(3)]!(pos);
}

function _elvenTower(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = m(0x556677, 0.75);
  const glowTeal = m(0x44ccaa, 0.15, 0, 0x22aa88, 1.6);
  const cap = m(0x334455, 0.8);
  // Base plinth
  solid(g, G.cylinder(1.8, 2.1, 0.6, 8), stone, 0, 0.3);
  // Tower shaft — tapered hexagonal
  solid(g, G.cylinder(0.9, 1.3, 6, 6), stone, 0, 3.6);
  // Pointed cap
  solid(g, G.cone(1.1, 2.2, 6), cap, 0, 7.7);
  // Three windows — glowing apertures
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    deco(g, G.box(0.25, 0.5, 0.12), glowTeal,
      Math.cos(a) * 0.9, 4.2, Math.sin(a) * 0.9);
  }
  // Orb at tip
  deco(g, G.octahedron(0.35, 1), glowTeal, 0, 9.1);
  return g;
}

function _moonShrine(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = m(0x7788aa, 0.78);
  const silver = m(0xaabbcc, 0.3, 0.5);
  const glow = m(0x8899ff, 0.1, 0, 0x4455cc, 1.3);
  // Circular platform
  solid(g, G.cylinder(2.4, 2.7, 0.35, 10), stone, 0, 0.17);
  // Four standing stones arranged in circle
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const px = Math.cos(a) * 1.8, pz = Math.sin(a) * 1.8;
    solid(g, G.box(0.45, 2.8 - (i % 2) * 0.6, 0.3), stone, px, 1.75, pz, 0, a);
  }
  // Lintel connecting two opposite stones
  solid(g, G.box(0.35, 0.35, 3.7), silver, 0, 2.95);
  // Glowing moon disc
  deco(g, G.cylinder(0.6, 0.6, 0.08, 12), glow, 0, 0.53);
  return g;
}

function _ruinedOutpost(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mossy = m(0x4a5a3a, 0.95);
  const dark = m(0x2a3a2a, 0.95);
  // L-shaped partial wall
  solid(g, G.box(4.2, 2.8, 0.55), mossy, 0, 1.4, -2);
  solid(g, G.box(0.55, 2.2, 3.0), mossy, -1.9, 1.1, -0.5);
  // Crumbled section — shorter wall
  solid(g, G.box(2.0, 1.4, 0.5), dark, 1.1, 0.7, 1.5);
  // Fallen column
  solid(g, G.cylinder(0.28, 0.33, 3.0, 7), mossy, 0.4, 0.3, 0.8, 0, 0, Math.PI / 2.5);
  // Floor slabs
  solid(g, G.box(3.5, 0.15, 3.5), dark, 0, 0.07);
  return g;
}

// ── Ember Wastes ─────────────────────────────────────────────────────────────

function _ember(pos: THREE.Vector3, rng: Rng, dist: number): THREE.Group {
  const v = dist > 280 ? 2 : rng.nextInt(3);
  return [_obsidianSpire, _forge, _fireTemple][v]!(pos);
}

function _obsidianSpire(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const obs = m(0x161625, 0.2, 0.65);
  const lava = m(0xff5500, 0.05, 0, 0xff2200, 2.8);
  const dark = m(0x222233, 0.4, 0.5);
  // Main spire — tall hexagonal shaft
  solid(g, G.cylinder(0.8, 1.4, 9, 6), obs, 0, 4.5);
  // Base buttresses (3)
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    solid(g, G.box(0.5, 3.0, 0.5), dark, Math.cos(a) * 1.5, 1.5, Math.sin(a) * 1.5);
  }
  // Battlements
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    solid(g, G.box(0.35, 0.7, 0.35), obs, Math.cos(a) * 0.75, 9.35, Math.sin(a) * 0.75);
  }
  // Lava runes — emissive stripes up the shaft
  for (let y = 1; y < 9; y += 2.5) {
    deco(g, G.torus(0.82, 0.04, 5, 12), lava, 0, y, 0, Math.PI / 2);
  }
  return g;
}

function _forge(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const obs = m(0x1a1a28, 0.3, 0.6);
  const iron = m(0x333344, 0.5, 0.8);
  const lava = m(0xff6600, 0.05, 0, 0xff3300, 2.4);
  // Thick walls of a square building
  const wall = G.box(0.4, 3.2, 4.4);
  solid(g, wall, obs, -2.0, 1.6, 0);
  solid(g, wall, obs,  2.0, 1.6, 0);
  solid(g, G.box(4.4, 3.2, 0.4), obs, 0, 1.6, -2.0);
  // Floor
  solid(g, G.box(4.4, 0.3, 4.4), iron, 0, 0.15);
  // Chimney
  solid(g, G.cylinder(0.4, 0.5, 4.5, 8), iron, 1.2, 2.5, -1.5);
  deco(g, G.cylinder(0.45, 0.45, 0.2, 8), lava, 1.2, 4.85, -1.5);
  // Central lava pool — emissive disc
  deco(g, G.cylinder(0.9, 1.0, 0.2, 10), lava, 0, 0.4, 0.3);
  return g;
}

function _fireTemple(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const dark = m(0x1a0800, 0.9);
  const stone = m(0x2a1510, 0.85);
  const lava = m(0xff7700, 0.05, 0, 0xff4400, 2.6);
  // 3-step pyramid
  const steps = [[3.0, 0.55, 0], [2.2, 0.55, 0.55], [1.4, 0.55, 1.1]] as const;
  steps.forEach(([r, h, y]) => solid(g, G.cylinder(r, r + 0.2, h, 8), dark, 0, y + h / 2));
  // Altar block
  solid(g, G.box(1.1, 0.6, 0.9), stone, 0, 1.95);
  // Lava chalice top
  deco(g, G.sphere(0.45, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), lava, 0, 2.58);
  // Four horn pillars
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * 2.2, pz = Math.sin(a) * 2.2;
    solid(g, G.cylinder(0.14, 0.2, 3.0, 5), dark, px, 1.5, pz);
    deco(g, G.cone(0.14, 0.5, 5), lava, px, 3.25, pz);
  }
  return g;
}

// ── Crystal Tundra ────────────────────────────────────────────────────────────

function _tundra(pos: THREE.Vector3, rng?: Rng): THREE.Group {
  const v = rng?.nextInt(3) ?? 0;
  return [_iceCastle, _frozenCaravan, _crystalSpire][v]!(pos);
}

function _iceCastle(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const ice = m(0x88bbdd, 0.07, 0.35, 0x55aacc, 0.25);
  const snow = m(0xddeeff, 0.95);
  const dark = m(0x334455, 0.85);
  // Main keep — thick walls
  solid(g, G.cylinder(1.6, 2.0, 5.5, 8), ice, 0, 2.75);
  // Battlements
  for (let i = 0; i < 8; i++) {
    if (i % 2 === 0) {
      const a = (i / 8) * Math.PI * 2;
      solid(g, G.box(0.5, 0.9, 0.5), dark, Math.cos(a) * 1.55, 5.95, Math.sin(a) * 1.55);
    }
  }
  // Conical roof
  solid(g, G.cone(1.75, 2.5, 8), ice, 0, 7.45);
  // Snow cap
  deco(g, G.sphere(1.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 3), snow, 0, 5.5);
  // Side tower (shorter)
  solid(g, G.cylinder(0.75, 0.95, 4, 6), dark, 2.2, 2, 0);
  solid(g, G.cone(0.85, 1.5, 6), ice, 2.2, 4.75);
  return g;
}

function _frozenCaravan(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const wood = m(0x3a2510, 0.95);
  const frost = m(0xbbddee, 0.08, 0.2, 0x88bbcc, 0.2);
  const snow = m(0xeef5f5, 0.95);
  const wheel = m(0x2a1a08, 0.9);
  // Wagon body
  solid(g, G.box(3.2, 1.1, 1.8), wood, 0, 0.85);
  // Arched canvas cover
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    const x = -1.4 + t * 2.8;
    const h = 0.8 * Math.sin(t * Math.PI);
    deco(g, G.cylinder(0.05, 0.05, 1.8, 5), wood, x, 1.5 + h, 0, Math.PI / 2);
  }
  deco(g, G.box(3.2, 0.06, 2.0), frost, 0, 2.15);
  // Wheels (buried in ice)
  const wg = G.torus(0.5, 0.09, 5, 10);
  for (const [wx, wz] of [[-1.2, -0.7], [-1.2, 0.7], [1.2, -0.7], [1.2, 0.7]] as [number, number][])
    solid(g, wg, wheel, wx, 0.5, wz, Math.PI / 2);
  // Snow drift on top
  deco(g, G.box(3.4, 0.35, 2.1), snow, 0, 2.4);
  return g;
}

function _crystalSpire(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const crystal = m(0x88ccff, 0.04, 0.45, 0x55aaee, 1.3);
  const darkIce = m(0x445566, 0.2, 0.4);
  // Central tall spire
  deco(g, G.cone(0.55, 7.5, 5), crystal, 0, 3.75);
  // Ringed ice base
  solid(g, G.cylinder(2.0, 2.3, 0.6, 8), darkIce, 0, 0.3);
  // Satellite crystals
  const offsets: [number, number, number, number][] = [
    [1.5, 0, 1.5, 4], [-1.4, 0, 0.8, 3], [0.6, 0, -1.7, 5], [-1.0, 0, -1.4, 3.5],
  ];
  offsets.forEach(([px, , pz, h]) => {
    deco(g, G.cone(0.22, h, 5), crystal, px, h / 2, pz);
  });
  return g;
}

// ── Twilight Marsh ────────────────────────────────────────────────────────────

function _marsh(pos: THREE.Vector3, rng?: Rng): THREE.Group {
  const v = rng?.nextInt(3) ?? 0;
  return [_swampHut, _drownedTemple, _witchTower][v]!(pos);
}

function _swampHut(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const darkWood = m(0x1c1208, 0.95);
  const thatch = m(0x2d3a1a, 0.92);
  const glow = m(0x44ff88, 0.05, 0, 0x22ee66, 1.8);
  // Four stilts
  const stilt = G.cylinder(0.1, 0.13, 2.8, 5);
  for (const [sx, sz] of [[-1.1, -0.9], [-1.1, 0.9], [1.1, -0.9], [1.1, 0.9]] as [number, number][])
    solid(g, stilt, darkWood, sx, 1.4, sz);
  // Floor & walls
  solid(g, G.box(2.6, 0.22, 1.9), darkWood, 0, 2.91);
  solid(g, G.box(2.6, 1.9, 0.18), darkWood, 0, 3.86, -0.86);
  solid(g, G.box(2.6, 1.9, 0.18), darkWood, 0, 3.86,  0.86);
  solid(g, G.box(0.18, 1.9, 1.9), darkWood, -1.21, 3.86);
  // Lean-to door cutout side (open)
  solid(g, G.box(0.18, 1.2, 1.9), darkWood, 1.21, 4.51);
  // Thatched cone roof
  solid(g, G.cone(1.8, 1.6, 5), thatch, 0, 5.6);
  // Glow orb inside — visible through cracks
  deco(g, G.sphere(0.22, 7, 7), glow, 0, 3.3);
  return g;
}

function _drownedTemple(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mossy = m(0x2d4a20, 0.95);
  const stone = m(0x3d4a45, 0.88);
  const algae = m(0x1a5a28, 0.7, 0, 0x0a3318, 0.2);
  // Sunken base (half below ground)
  solid(g, G.box(5.5, 1.8, 5.5), mossy, 0, -0.6);
  solid(g, G.box(4.5, 1.0, 4.5), stone, 0, 0.4);
  // Columns, some tilted by sinking
  const tilts = [0, 0.14, 0, -0.1, 0.06, 0, 0, -0.12] as const;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = i % 3 === 0 ? 1.4 : 3.2;
    solid(g, G.cylinder(0.27, 0.32, h, 7), stone,
      Math.cos(a) * 2.0, 1.0 + h / 2, Math.sin(a) * 2.0, tilts[i] ?? 0);
  }
  // Algae patches on floor
  for (let i = 0; i < 4; i++) {
    const ax = (i % 2 - 0.5) * 2, az = (Math.floor(i / 2) - 0.5) * 2;
    deco(g, G.cylinder(0.5, 0.65, 0.07, 8), algae, ax, 1.08, az);
  }
  return g;
}

function _witchTower(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const darkWood = m(0x1a1208, 0.9);
  const wicker = m(0x3a2a10, 0.92);
  const wisp = m(0x88ffaa, 0.05, 0, 0x44ee88, 2.2);
  // Twisted trunk-like shaft (tapered octagonal)
  solid(g, G.cylinder(0.55, 1.0, 7.5, 7), darkWood, 0, 3.75);
  // Wicker platform
  solid(g, G.cylinder(1.7, 1.7, 0.25, 10), wicker, 0, 7.62);
  // Pointed cap
  solid(g, G.cone(1.8, 2.2, 7), darkWood, 0, 8.85);
  // Hanging cage lanterns
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    deco(g, G.box(0.22, 0.3, 0.22), wicker, Math.cos(a) * 1.4, 7.3, Math.sin(a) * 1.4);
    deco(g, G.sphere(0.1, 6, 6), wisp, Math.cos(a) * 1.4, 7.05, Math.sin(a) * 1.4);
  }
  return g;
}

// ── Sunlit Meadows ────────────────────────────────────────────────────────────

function _meadow(pos: THREE.Vector3, rng?: Rng): THREE.Group {
  const v = rng?.nextInt(4) ?? 0;
  return [_inn, _windmill, _marketStall, _ruinedFarm][v]!(pos);
}

function _inn(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const plaster = m(0xd4b896, 0.88);
  const timber = m(0x5a3a1a, 0.88);
  const thatch = m(0x7a5a1a, 0.9);
  const lantern = m(0xffaa33, 0.05, 0, 0xff7700, 1.8);
  const stone = m(0x888880, 0.85);
  // Stone foundation
  solid(g, G.box(6.5, 0.4, 4.5), stone, 0, 0.2);
  // Walls
  solid(g, G.box(6.5, 3.8, 0.3), plaster, 0, 2.1, -2.1);
  solid(g, G.box(6.5, 3.8, 0.3), plaster, 0, 2.1,  2.1);
  solid(g, G.box(0.3, 3.8, 4.5), plaster, -3.1, 2.1);
  solid(g, G.box(0.3, 3.8, 4.5), plaster,  3.1, 2.1);
  // Timber cross-bracing (decorative, flat to wall)
  deco(g, G.box(6.3, 0.12, 0.1), timber, 0, 3.0, -2.05);
  deco(g, G.box(6.3, 0.12, 0.1), timber, 0, 1.5, -2.05);
  // Thatched gabled roof
  solid(g, G.box(6.9, 0.2, 4.9), thatch, 0, 4.1);
  solid(g, G.cylinder(0.1, 3.6, 2.0, 4), thatch, 0, 5.1, 0, 0, Math.PI / 4);
  // Chimney
  solid(g, G.box(0.75, 2.2, 0.75), stone, 1.8, 4.5, -1.6);
  // Lanterns flanking door
  deco(g, G.sphere(0.15, 7, 7), lantern, -0.7, 2.5, -2.1);
  deco(g, G.sphere(0.15, 7, 7), lantern,  0.7, 2.5, -2.1);
  return g;
}

function _windmill(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = m(0x887a68, 0.88);
  const wood = m(0x4a2e10, 0.9);
  const sail = m(0xd4c4a0, 0.88);
  // Tapered stone tower
  solid(g, G.cylinder(1.0, 1.5, 7, 10), stone, 0, 3.5);
  // Cone cap
  solid(g, G.cone(1.15, 1.8, 10), wood, 0, 7.9);
  // Door
  solid(g, G.box(0.7, 1.4, 0.2), stone, 0, 0.7, 1.52);
  // Sails — 4 boards
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const sx = Math.sin(a) * 2.2, sy = -Math.cos(a) * 2.2;
    deco(g, G.box(0.18, 2.8, 0.45), sail, sx, 7.5 + sy, 1.1, 0, 0, a);
  }
  return g;
}

function _marketStall(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const wood = m(0x5a3a1a, 0.9);
  const canvas = m(0xe8c87a, 0.88);
  const goods = m(0x8b4513, 0.9);
  const accent = m(0xcc6622, 0.8);
  // Four sturdy posts
  const post = G.cylinder(0.09, 0.12, 3.2, 6);
  for (const [px, pz] of [[-1.6, -1.1], [-1.6, 1.1], [1.6, -1.1], [1.6, 1.1]] as [number, number][])
    solid(g, post, wood, px, 1.6, pz);
  // Awning — slightly sloped
  deco(g, G.box(3.5, 0.12, 2.5), canvas, 0, 3.25, 0, 0.12, 0);
  // Fringe stripe
  deco(g, G.box(3.5, 0.18, 0.12), accent, 0, 3.1, -1.27);
  // Counter
  solid(g, G.box(3.0, 0.18, 0.7), wood, 0, 1.15, -0.8);
  solid(g, G.box(3.0, 0.9, 0.45), wood, 0, 0.57, -0.8);
  // Goods on counter (5 barrels/crates)
  const crate = G.box(0.38, 0.38, 0.38);
  for (let i = 0; i < 4; i++) {
    deco(g, crate, goods, -1.2 + i * 0.8, 1.44, -0.78);
  }
  return g;
}

function _ruinedFarm(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stone = m(0x7a6a5a, 0.92);
  const moss = m(0x3a5a28, 0.95);
  // L-shaped partial walls
  solid(g, G.box(5.0, 2.4, 0.5), stone, 0, 1.2, -2.2);
  solid(g, G.box(0.5, 3.0, 4.0), stone, -2.2, 1.5, -0.2);
  solid(g, G.box(2.5, 1.4, 0.45), stone, 0.8, 0.7, 2.2);
  // Fallen wall segment
  solid(g, G.box(2.0, 0.5, 0.45), stone, -0.2, 0.25, 2.2, Math.PI / 12);
  // Moss overgrowth on floor
  solid(g, G.box(4.5, 0.12, 4.5), moss, 0, 0.06);
  // Collapsed chimney pile
  for (let i = 0; i < 3; i++) {
    solid(g, G.box(0.55, 0.35, 0.55), stone, 1.8 + (Math.random() - 0.5) * 0.3, 0.17 + i * 0.35, -1.5 + (Math.random() - 0.5) * 0.3);
  }
  return g;
}

// ── Desert ────────────────────────────────────────────────────────────────────

function _desert(pos: THREE.Vector3, rng?: Rng): THREE.Group {
  const v = rng?.nextInt(3) ?? 0;
  return [_pyramid, _ancientGate, _obelisk][v]!(pos);
}

function _pyramid(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const sand = m(0xc8904a, 0.88);
  const dark = m(0x1a0800, 0.85);
  const gold = m(0xffdd55, 0.12, 0.7, 0xddaa00, 0.8);
  // Main pyramid body
  solid(g, G.cone(4.5, 4.8, 4), sand, 0, 2.4, 0, 0, Math.PI / 4);
  // Entrance
  solid(g, G.box(1.1, 1.6, 0.4), dark, 0, 0.8, 3.18);
  // Decorative step bands
  for (let i = 1; i <= 3; i++) {
    const r = 4.5 - i * 1.05;
    const y = i * 1.12;
    deco(g, G.cylinder(r + 0.05, r + 0.05, 0.1, 4), sand, 0, y, 0, 0, Math.PI / 4);
  }
  // Golden capstone
  deco(g, G.octahedron(0.38), gold, 0, 5.15);
  return g;
}

function _ancientGate(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const sand = m(0xc09040, 0.88);
  const dark = m(0x1a0800, 0.88);
  const gold = m(0xffdd44, 0.12, 0.7, 0xddbb00, 0.6);
  // Two massive pillars
  for (const ox of [-2.3, 2.3]) {
    solid(g, G.box(1.2, 6.5, 1.2), sand, ox, 3.25);
    solid(g, G.box(1.5, 0.55, 1.5), sand, ox, 6.8);
  }
  // Lintel
  solid(g, G.box(5.3, 0.9, 1.0), sand, 0, 7.35);
  // Carved inscription (gold strip)
  deco(g, G.box(4.0, 0.22, 0.15), gold, 0, 7.35, -0.51);
  // Fallen debris
  for (const [dx, dz, r] of [[1.5, 1.0, 0.4], [-2.0, 0.5, 0.55], [0.8, -1.2, 0.35]] as [number,number,number][])
    solid(g, G.box(r * 2, r * 0.6, r * 1.5), sand, dx, r * 0.3, dz);
  // Hieroglyph panel leaning against pillar
  solid(g, G.box(0.8, 1.5, 0.12), dark, -3.0, 0.75, 0, 0.15);
  return g;
}

function _obelisk(pos: THREE.Vector3): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const sand = m(0xbb8840, 0.88);
  const gold = m(0xffee55, 0.12, 0.7, 0xddcc00, 0.9);
  // Two obelisks — one intact, one cracked
  for (const [ox, h] of [[-2.6, 7.5], [2.4, 5.0]] as [number, number][]) {
    solid(g, G.box(0.95, h, 0.95), sand, ox, h / 2);
    solid(g, G.box(1.2, 0.45, 1.2), sand, ox, 0.22);
    deco(g, G.cone(0.5, 0.9, 4), gold, ox, h + 0.45, 0, 0, Math.PI / 4);
  }
  // Linking pedestal
  solid(g, G.box(5.5, 0.3, 1.0), sand, 0, 0.15);
  // Cracked chunk on ground
  solid(g, G.box(1.0, 0.7, 0.95), sand, 3.4, 0.35, 0.4, 0.3);
  return g;
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
