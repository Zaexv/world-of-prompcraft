/**
 * Encounter geometry builders.
 *
 * Each exported function builds and returns a THREE.Group for one encounter type.
 * Solid meshes → userData.isCollider = true
 * Decorative/emissive → userData.noCollision = true
 */

import * as THREE from 'three';
import type { Rng } from '../RngTypes';

// ── Material helper (flat shading, cached) ────────────────────────────────────
const _mc = new Map<string, THREE.MeshStandardMaterial>();
function mat(hex: number, rough = 0.82, metal = 0, emHex?: number, emI?: number): THREE.MeshStandardMaterial {
  const k = `${hex}|${rough}|${metal}|${emHex}|${emI}`;
  if (!_mc.has(k)) {
    const m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: metal, flatShading: true });
    if (emHex !== undefined) { m.emissive = new THREE.Color(emHex); m.emissiveIntensity = emI ?? 1; }
    _mc.set(k, m);
  }
  return _mc.get(k)!;
}

function add(g: THREE.Group, geo: THREE.BufferGeometry, material: THREE.MeshStandardMaterial,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, collide = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true; m.receiveShadow = true;
  if (collide) { m.userData.isCollider = true; } else { m.userData.noCollision = true; }
  g.add(m); return m;
}

// ════════════════════════════════════════════════════════════════════════════
//  CAMPSITE
// ════════════════════════════════════════════════════════════════════════════

/** Cosy campsite: fire ring, log seats, tent, scattered gear. */
export function buildCampsite(anchor: THREE.Vector3, _rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const log = mat(0x3a2510, 0.95);
  const stone = mat(0x666655, 0.9);
  const canvas = mat(0xc8b080, 0.88);
  const metal = mat(0x444433, 0.6, 0.5);
  const fire = mat(0xff6600, 0.05, 0, 0xff3300, 3.0);
  const embers = mat(0xff2200, 0.05, 0, 0xff0000, 2.2);

  // ── Fire ring ──
  const fireRing = new THREE.TorusGeometry(0.55, 0.12, 5, 10);
  add(g, fireRing, stone, 0, 0.12, 0, Math.PI / 2);
  // Firewood logs
  add(g, new THREE.CylinderGeometry(0.07, 0.09, 0.9, 6), log, -0.3, 0.09, 0, 0, 0, Math.PI / 2.5);
  add(g, new THREE.CylinderGeometry(0.07, 0.09, 0.85, 6), log, 0.3, 0.09, 0.1, 0, 0.8, Math.PI / 2.3);
  // Flames (emissive cones)
  add(g, new THREE.ConeGeometry(0.22, 0.7, 6), fire, 0, 0.55, 0, 0, 0, 0, false);
  add(g, new THREE.ConeGeometry(0.14, 0.5, 5), embers, 0.08, 0.65, 0.05, 0.2, 0, 0, false);
  // Embers glow on ground
  add(g, new THREE.CylinderGeometry(0.42, 0.42, 0.04, 10), embers, 0, 0.02, 0, 0, 0, 0, false);

  // ── Log seats (3 around fire) ──
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const sx = Math.cos(a) * 1.4, sz = Math.sin(a) * 1.4;
    add(g, new THREE.CylinderGeometry(0.18, 0.22, 0.9, 8), log, sx, 0.22, sz, 0, 0, Math.PI / 2);
  }

  // ── Tent ──
  const tentMat = canvas;
  const ridge = 1.8;
  // Tent body (two triangular panels as wedge)
  add(g, new THREE.CylinderGeometry(0.02, 0.02, ridge * 2, 4), mat(0x5a3a1a, 0.9), 2.4, 1.15, 0, 0, 0, Math.PI / 2);
  // Tent side faces
  add(g, new THREE.ConeGeometry(1.1, 1.3, 4), tentMat, 2.4, 0.65, 0, 0, Math.PI / 4, 0);
  // Tent ground pegs
  for (const [px, pz] of [[-1.1, -0.8], [-1.1, 0.8], [1.1, -0.8], [1.1, 0.8]] as [number,number][])
    add(g, new THREE.CylinderGeometry(0.03, 0.04, 0.25, 4), log, 2.4 + px * 0.7, 0.12, pz * 0.7, 0.3);

  // ── Camp gear ──
  // Iron pot on tripod
  add(g, new THREE.CylinderGeometry(0.16, 0.12, 0.22, 8), metal, -1.4, 0.52, 0.8);
  add(g, new THREE.CylinderGeometry(0.12, 0.12, 0.04, 8), metal, -1.4, 0.44, 0.8, 0, 0, 0, false);
  // Tripod legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    add(g, new THREE.CylinderGeometry(0.018, 0.025, 0.55, 4), log, -1.4 + Math.cos(a) * 0.16, 0.27, 0.8 + Math.sin(a) * 0.16, 0.35, a);
  }

  // Bedroll (flat and rolled)
  add(g, new THREE.CylinderGeometry(0.22, 0.22, 1.6, 8), canvas, 1.8, 0.22, -1.1, 0, 0, Math.PI / 2);

  // Supply sack
  add(g, new THREE.SphereGeometry(0.28, 7, 6), mat(0x7a5a30, 0.92), -1.9, 0.3, -0.5);

  // Lantern on stick
  add(g, new THREE.CylinderGeometry(0.04, 0.05, 1.5, 5), log, 1.6, 0.75, 0.8);
  add(g, new THREE.BoxGeometry(0.18, 0.22, 0.18), metal, 1.6, 1.63, 0.8, 0, 0, 0, false);
  add(g, new THREE.BoxGeometry(0.1, 0.14, 0.1), mat(0xffee88, 0.05, 0, 0xffcc00, 1.8), 1.6, 1.63, 0.8, 0, 0, 0, false);

  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  BANDIT CAMP
// ════════════════════════════════════════════════════════════════════════════

/** Rough bandit encampment: palisade section, fire, rough shelters. */
export function buildBanditCamp(anchor: THREE.Vector3, _rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const darkWood = mat(0x2a1a08, 0.95);
  const rough = mat(0x4a3520, 0.92);
  const iron = mat(0x333333, 0.55, 0.5);
  const fire = mat(0xff5500, 0.05, 0, 0xff2200, 2.8);
  const bone = mat(0xd4c8a0, 0.9);

  // ── Palisade arc ──
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 3 + (i / 6) * (Math.PI * 2 / 3);
    const r = 3.2;
    const px = Math.cos(a) * r, pz = Math.sin(a) * r;
    const h = 1.8 + Math.sin(i * 1.7) * 0.3; // irregular heights
    add(g, new THREE.CylinderGeometry(0.12, 0.16, h, 5), darkWood, px, h / 2, pz);
  }

  // ── Watchtower stub ──
  add(g, new THREE.CylinderGeometry(0.6, 0.75, 4, 6), darkWood, -3.5, 2);
  add(g, new THREE.CylinderGeometry(0.95, 0.95, 0.3, 6), rough, -3.5, 4.15);
  add(g, new THREE.ConeGeometry(1.1, 0.9, 6), darkWood, -3.5, 4.6);

  // ── Central fire ──
  add(g, new THREE.TorusGeometry(0.45, 0.1, 5, 8), mat(0x555544, 0.9), 0, 0.1, 0, Math.PI / 2);
  add(g, new THREE.ConeGeometry(0.2, 0.65, 6), fire, 0, 0.5, 0, 0, 0, 0, false);
  add(g, new THREE.CylinderGeometry(0.35, 0.35, 0.04, 8), mat(0xff1100, 0.05, 0, 0xff0000, 1.8), 0, 0.02, 0, 0, 0, 0, false);

  // ── Loot crates & barrels ──
  add(g, new THREE.BoxGeometry(0.7, 0.7, 0.7), rough, 1.5, 0.35, 1.2);
  add(g, new THREE.BoxGeometry(0.7, 0.7, 0.7), rough, 1.5, 1.05, 1.2);
  add(g, new THREE.CylinderGeometry(0.3, 0.32, 0.7, 10), rough, 2.4, 0.35, 0.5);
  add(g, new THREE.CylinderGeometry(0.3, 0.32, 0.7, 10), rough, 2.4, 0.35, 1.4);

  // ── Weapon rack ──
  add(g, new THREE.BoxGeometry(0.08, 1.8, 0.08), iron, -1.8, 0.9, 1.5);
  add(g, new THREE.BoxGeometry(0.08, 1.8, 0.08), iron, -1.4, 0.9, 1.5);
  add(g, new THREE.BoxGeometry(0.55, 0.08, 0.08), iron, -1.6, 1.4, 1.5);
  // Swords leaning
  for (let i = 0; i < 3; i++)
    add(g, new THREE.BoxGeometry(0.04, 1.1, 0.04), iron, -1.85 + i * 0.175, 0.6, 1.5, 0.15, 0, 0);

  // ── Skull on pole (intimidation) ──
  add(g, new THREE.CylinderGeometry(0.04, 0.05, 2.2, 5), darkWood, 2.5, 1.1, -1.8);
  add(g, new THREE.SphereGeometry(0.18, 8, 7), bone, 2.5, 2.28, -1.8, 0, 0, 0, false);

  // ── Rough lean-to shelter ──
  add(g, new THREE.CylinderGeometry(0.07, 0.09, 2.2, 5), darkWood, 1.0, 1.1, -2.0);
  add(g, new THREE.CylinderGeometry(0.07, 0.09, 2.2, 5), darkWood, -1.0, 1.1, -2.0);
  add(g, new THREE.BoxGeometry(2.2, 0.1, 1.5), rough, 0, 2.15, -2.4, -0.25);

  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  MERCHANT CARAVAN
// ════════════════════════════════════════════════════════════════════════════

/** Two wagons, canopy, goods piled up, merchant stall setup. */
export function buildMerchantCaravan(anchor: THREE.Vector3, _rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const wood = mat(0x5a3a1a, 0.9);
  const canvas = mat(0xe8c880, 0.88);
  const goods = mat(0x8b4513, 0.9);
  const red = mat(0xcc3322, 0.88);
  const rope = mat(0xaa8833, 0.92);
  const metal = mat(0x444433, 0.6, 0.5);
  const lantern = mat(0xffaa33, 0.05, 0, 0xff7700, 1.8);

  // ── Wagon 1 (main goods wagon) ──
  add(g, new THREE.BoxGeometry(3.8, 1.0, 2.2), wood, 0, 0.8);
  add(g, new THREE.BoxGeometry(3.8, 1.0, 0.22), wood, 0, 1.5, -1.0);
  add(g, new THREE.BoxGeometry(3.8, 1.0, 0.22), wood, 0, 1.5,  1.0);
  add(g, new THREE.BoxGeometry(0.22, 1.0, 2.2), wood, -1.78, 1.5);
  // Canopy arch
  for (let i = 0; i < 5; i++) {
    const x = -1.4 + i * 0.7;
    add(g, new THREE.CylinderGeometry(0.04, 0.05, 2.4, 5), wood, x, 2.0, 0, Math.PI / 2, 0, 0, false);
  }
  add(g, new THREE.BoxGeometry(3.6, 0.08, 2.6), canvas, 0, 2.25, 0, 0, 0, 0, false);
  // Wagon wheels (4)
  const wg = new THREE.TorusGeometry(0.55, 0.1, 5, 12);
  for (const [wx, wz] of [[-1.6, -0.9], [-1.6, 0.9], [1.6, -0.9], [1.6, 0.9]] as [number,number][])
    add(g, wg, wood, wx, 0.55, wz, Math.PI / 2);

  // ── Wagon 2 (smaller, angled) ──
  add(g, new THREE.BoxGeometry(2.8, 0.85, 1.8), goods, 5.0, 0.7, 0.5, 0, 0.35, 0);
  const wg2 = new THREE.TorusGeometry(0.45, 0.09, 5, 10);
  for (const [wx, wz] of [[-1.1, -0.7], [-1.1, 0.7], [1.1, -0.7], [1.1, 0.7]] as [number,number][])
    add(g, wg2, wood, 5.0 + wx, 0.45, 0.5 + wz, Math.PI / 2);

  // ── Goods piled ──
  for (let i = 0; i < 4; i++) {
    const bx = -1.2 + (i % 2) * 0.8, bz = Math.floor(i / 2) * 0.7 - 0.35;
    add(g, new THREE.BoxGeometry(0.6, 0.6, 0.6), goods, bx, 1.6, bz);
  }
  // Colourful sacks
  for (let i = 0; i < 3; i++)
    add(g, new THREE.SphereGeometry(0.28, 7, 6), i % 2 === 0 ? red : canvas, -1.0 + i * 0.7, 2.05, 0.2);

  // ── Market stall between wagons ──
  add(g, new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), wood, 2.5, 1.25, -1.8);
  add(g, new THREE.CylinderGeometry(0.06, 0.07, 2.5, 6), wood, 2.5, 1.25,  1.8);
  add(g, new THREE.BoxGeometry(0.08, 2.0, 0.08), rope, 2.5, 2.8, 0);
  // Awning
  add(g, new THREE.BoxGeometry(0.12, 0.12, 3.9), rope, 2.5, 2.88, 0, 0, 0, 0, false);
  add(g, new THREE.BoxGeometry(3.2, 0.08, 1.8), canvas, 2.5, 2.7, 0, -0.18, 0, 0, false);
  // Display counter
  add(g, new THREE.BoxGeometry(2.8, 0.18, 0.65), wood, 2.5, 1.2, -1.1);
  add(g, new THREE.BoxGeometry(2.8, 0.85, 0.4), wood, 2.5, 0.6, -1.1);

  // ── Lanterns ──
  add(g, new THREE.BoxGeometry(0.2, 0.25, 0.2), metal, 1.8, 2.8, -1.8, 0, 0, 0, false);
  add(g, new THREE.SphereGeometry(0.1, 7, 7), lantern, 1.8, 2.65, -1.8, 0, 0, 0, false);
  add(g, new THREE.BoxGeometry(0.2, 0.25, 0.2), metal, 3.2, 2.8, -1.8, 0, 0, 0, false);
  add(g, new THREE.SphereGeometry(0.1, 7, 7), lantern, 3.2, 2.65, -1.8, 0, 0, 0, false);

  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  HERMIT'S DWELLING
// ════════════════════════════════════════════════════════════════════════════

/** Solitary hermit hut — crude but lived-in, with garden and tools. */
export function buildHermitDwelling(anchor: THREE.Vector3, _rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const darkWood = mat(0x2a1a08, 0.96);
  const mud = mat(0x6a5040, 0.95);
  const thatch = mat(0x4a5020, 0.92);
  const stone = mat(0x777060, 0.9);
  const glow = mat(0xffaa33, 0.05, 0, 0xff8800, 1.5);
  const garden = mat(0x2a5a18, 0.95);
  const herb = mat(0x3a7a22, 0.88, 0, 0x1a4010, 0.12);
  const tool = mat(0x555544, 0.5, 0.5);

  // ── Hut walls (rubble & log hybrid) ──
  add(g, new THREE.BoxGeometry(3.2, 2.2, 0.35), mud, 0, 1.1, -1.6);
  add(g, new THREE.BoxGeometry(3.2, 2.2, 0.35), mud, 0, 1.1,  1.6);
  add(g, new THREE.BoxGeometry(0.35, 2.2, 3.2), mud, -1.6, 1.1);
  add(g, new THREE.BoxGeometry(0.35, 2.2, 3.2), mud,  1.6, 1.1);
  // Floor
  add(g, new THREE.BoxGeometry(3.2, 0.18, 3.2), stone, 0, 0.09);
  // Thatched roof
  add(g, new THREE.BoxGeometry(3.6, 0.15, 3.6), thatch, 0, 2.3);
  add(g, new THREE.CylinderGeometry(0.1, 2.0, 1.6, 4), thatch, 0, 3.1, 0, 0, Math.PI / 4);
  // Door opening
  add(g, new THREE.BoxGeometry(0.8, 1.5, 0.1), darkWood, 0, 0.75, -1.65);
  // Window (tiny)
  add(g, new THREE.BoxGeometry(0.4, 0.4, 0.1), glow, 1.0, 1.2, -1.65, 0, 0, 0, false);
  // Chimney
  add(g, new THREE.CylinderGeometry(0.2, 0.25, 1.2, 7), stone, 1.0, 2.9, 1.0);
  add(g, new THREE.SphereGeometry(0.12, 6, 5), mat(0x223322, 0.9, 0, 0x112211, 0.2), 1.0, 3.65, 1.0, 0, 0, 0, false);

  // ── Herb garden (fenced square) ──
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const fx = Math.cos(a) * 2.5, fz = Math.sin(a) * 2.5 - 1.5;
    add(g, new THREE.BoxGeometry(0.08, 0.45, 2.2), darkWood, fx, 0.22, fz, 0, a);
  }
  add(g, new THREE.BoxGeometry(2.4, 0.12, 2.4), garden, 0, 0.06, -1.5);
  // Herbs
  for (let i = 0; i < 9; i++) {
    const hx = -0.85 + (i % 3) * 0.85, hz = -2.25 + Math.floor(i / 3) * 0.85;
    add(g, new THREE.CylinderGeometry(0.06, 0.08, 0.3 + Math.random() * 0.2, 5), herb, hx, 0.22, hz, 0, 0, 0, false);
  }

  // ── Tools leaning on wall ──
  add(g, new THREE.CylinderGeometry(0.025, 0.03, 1.6, 5), darkWood, 1.7, 0.8, -1.58, 0.12);
  add(g, new THREE.BoxGeometry(0.22, 0.12, 0.04), tool, 1.7, 1.6, -1.58, 0, 0, 0.5);
  add(g, new THREE.CylinderGeometry(0.025, 0.03, 1.5, 5), darkWood, -1.7, 0.75, -1.58, 0.1);
  add(g, new THREE.BoxGeometry(0.04, 0.18, 0.04), tool, -1.7, 1.5, -1.58);

  // ── Water barrel ──
  add(g, new THREE.CylinderGeometry(0.35, 0.38, 0.8, 10), darkWood, -2.0, 0.4, 0.5);
  add(g, new THREE.TorusGeometry(0.38, 0.04, 4, 10), tool, -2.0, 0.55, 0.5, Math.PI / 2);

  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  MINE ENTRANCE
// ════════════════════════════════════════════════════════════════════════════

/** Abandoned mine entrance with timber frame, cart, lantern. */
export function buildMineEntrance(anchor: THREE.Vector3, _rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const timber = mat(0x3a2510, 0.92);
  const rock = mat(0x556655, 0.9);
  const iron = mat(0x333333, 0.55, 0.5);
  const lantern = mat(0xffcc44, 0.05, 0, 0xffaa00, 1.8);
  const dark = mat(0x0a0808, 0.95);

  // ── Tunnel portal ──
  add(g, new THREE.BoxGeometry(0.4, 3.5, 0.5), timber, -1.4, 1.75, 0);
  add(g, new THREE.BoxGeometry(0.4, 3.5, 0.5), timber,  1.4, 1.75, 0);
  add(g, new THREE.BoxGeometry(3.2, 0.45, 0.5), timber, 0, 3.45, 0);
  // Diagonal braces
  add(g, new THREE.BoxGeometry(0.2, 1.8, 0.25), timber, -0.85, 2.1, 0, 0, 0, 0.6);
  add(g, new THREE.BoxGeometry(0.2, 1.8, 0.25), timber,  0.85, 2.1, 0, 0, 0, -0.6);
  // Dark tunnel interior (visual depth)
  add(g, new THREE.BoxGeometry(2.2, 2.8, 2.0), dark, 0, 1.4, -1.0, 0, 0, 0, false);
  // Rock pile at base
  for (let i = 0; i < 5; i++) {
    const rx = (Math.random() - 0.5) * 1.5, rz = 0.4 + Math.random() * 0.6;
    const rs = 0.15 + Math.random() * 0.2;
    add(g, new THREE.DodecahedronGeometry(rs, 0), rock, rx, rs, rz);
  }

  // ── Minecart on track ──
  add(g, new THREE.BoxGeometry(1.0, 0.65, 0.75), iron, 2.2, 0.52, 0.3);
  add(g, new THREE.BoxGeometry(1.0, 0.12, 0.75), iron, 2.2, 0.85, 0.3);
  // Wheels
  const cartWheel = new THREE.TorusGeometry(0.22, 0.06, 5, 8);
  for (const [cw, cz] of [[-0.38, -0.28], [-0.38, 0.58], [0.38, -0.28], [0.38, 0.58]] as [number, number][])
    add(g, cartWheel, iron, 2.2 + cw, 0.22, 0.3 + cz, Math.PI / 2);
  // Track rails
  add(g, new THREE.BoxGeometry(4.5, 0.06, 0.06), iron, 0.4, 0.06, 0.6);
  add(g, new THREE.BoxGeometry(4.5, 0.06, 0.06), iron, 0.4, 0.06, 0.0);
  // Track ties
  for (let i = 0; i < 5; i++)
    add(g, new THREE.BoxGeometry(0.08, 0.06, 0.75), timber, -1.8 + i * 0.9, 0.03, 0.3);

  // ── Lantern on post ──
  add(g, new THREE.CylinderGeometry(0.04, 0.05, 2.0, 5), timber, 1.7, 1.0, 0.9);
  add(g, new THREE.BoxGeometry(0.2, 0.24, 0.2), iron, 1.7, 2.1, 0.9, 0, 0, 0, false);
  add(g, new THREE.SphereGeometry(0.1, 6, 6), lantern, 1.7, 2.0, 0.9, 0, 0, 0, false);

  // ── Crates ──
  add(g, new THREE.BoxGeometry(0.65, 0.65, 0.65), timber, 2.8, 0.32, -0.8);
  add(g, new THREE.BoxGeometry(0.65, 0.65, 0.65), timber, 2.8, 0.97, -0.8);
  add(g, new THREE.BoxGeometry(0.65, 0.65, 0.65), timber, 3.5, 0.32, -0.8);

  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  BATTLEFIELD REMNANT
// ════════════════════════════════════════════════════════════════════════════

/** Ancient battlefield — scattered weapons, broken shields, grave markers. */
export function buildBattlefieldRemnant(anchor: THREE.Vector3, rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const iron = mat(0x444444, 0.55, 0.45);
  const rusty = mat(0x6a3a22, 0.8, 0.2);
  const wood = mat(0x3a2510, 0.95);
  const stone = mat(0x666655, 0.9);
  const bone = mat(0xe8dcc0, 0.9);

  // ── Scattered weapons (8 swords/spears in ground) ──
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng.next() * 0.8;
    const r = 1.5 + rng.next() * 2.0;
    const wx = Math.cos(a) * r, wz = Math.sin(a) * r;
    const isSpear = i % 3 === 0;
    const lean = 0.15 + rng.next() * 0.3;
    if (isSpear) {
      add(g, new THREE.CylinderGeometry(0.03, 0.04, 1.8, 5), wood, wx, 0.9, wz, lean, rng.next() * Math.PI * 2, 0);
      add(g, new THREE.ConeGeometry(0.05, 0.3, 4), rusty, wx + Math.cos(a) * 0.03, 1.88, wz + Math.sin(a) * 0.03, lean, 0, 0);
    } else {
      add(g, new THREE.BoxGeometry(0.06, 1.2, 0.04), rusty, wx, 0.7, wz, lean, rng.next() * Math.PI * 2, 0);
    }
  }

  // ── Broken shields ──
  for (let i = 0; i < 3; i++) {
    const sx = (i - 1) * 1.8, sz = rng.nextRange(-0.8, 0.8);
    add(g, new THREE.BoxGeometry(0.7, 0.85, 0.06), rusty, sx, 0.04, sz, 0.05, rng.next() * Math.PI * 2, 0.1 * (Math.random() - 0.5));
    // Crack splinter (second piece)
    add(g, new THREE.BoxGeometry(0.35, 0.4, 0.06), rusty, sx + 0.25, 0.04, sz + 0.2, 0.1, 0, 0.4);
  }

  // ── Grave markers (5 rough stones) ──
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const gx = Math.cos(a) * 2.8, gz = Math.sin(a) * 2.8;
    const gh = 0.5 + rng.next() * 0.4;
    add(g, new THREE.BoxGeometry(0.35, gh, 0.2), stone, gx, gh / 2, gz, 0, rng.next() * 0.4 - 0.2, 0);
  }

  // ── Helmet ──
  add(g, new THREE.SphereGeometry(0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6), iron, 0.5, 0.18, 1.2);

  // ── Bones ──
  for (let i = 0; i < 4; i++) {
    const bx = (rng.next() - 0.5) * 4, bz = (rng.next() - 0.5) * 4;
    add(g, new THREE.CylinderGeometry(0.05, 0.07, 0.7, 5), bone, bx, 0.04, bz, 0, rng.next() * Math.PI * 2, Math.PI / 2);
  }

  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  FISHING SPOT
// ════════════════════════════════════════════════════════════════════════════

/** A small jetty with fishing equipment. */
export function buildFishingSpot(anchor: THREE.Vector3, _rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const wood = mat(0x5a3a1a, 0.9);
  const rope = mat(0xaa8833, 0.92);
  const water = mat(0x226688, 0.05, 0.4, 0x1144aa, 0.3);
  const iron = mat(0x444433, 0.6, 0.5);
  const canvas = mat(0xcc9966, 0.88);

  // ── Jetty planks ──
  add(g, new THREE.BoxGeometry(1.0, 0.18, 4.5), wood, 0, 0.09, -2.2);
  // Planks detail
  for (let i = 0; i < 6; i++)
    add(g, new THREE.BoxGeometry(1.05, 0.12, 0.08), wood, 0, 0.19, -0.2 - i * 0.7);
  // Support posts
  for (const [px, pz] of [[-0.42, -0.5], [0.42, -0.5], [-0.42, -4.2], [0.42, -4.2]] as [number,number][])
    add(g, new THREE.CylinderGeometry(0.09, 0.12, 1.2, 6), wood, px, -0.5, pz);

  // ── Boat (small rowboat alongside) ──
  add(g, new THREE.BoxGeometry(0.9, 0.4, 2.4), wood, -1.5, 0.2, -1.8);
  add(g, new THREE.BoxGeometry(0.9, 0.06, 2.4), water, -1.5, 0.42, -1.8, 0, 0, 0, false);
  // Oars
  add(g, new THREE.CylinderGeometry(0.03, 0.04, 2.0, 5), wood, -1.0, 0.35, -1.8, 0, 0, Math.PI / 6);
  add(g, new THREE.BoxGeometry(0.25, 0.04, 0.08), wood, -0.15, 0.45, -1.8, 0, 0, Math.PI / 6, false);

  // ── Fishing gear ──
  // Rod on the jetty end
  add(g, new THREE.CylinderGeometry(0.022, 0.03, 2.8, 5), wood, 0.35, 1.5, -4.0, 0.35, 0, 0, false);
  add(g, new THREE.CylinderGeometry(0.012, 0.012, 2.0, 4), rope, 0.35 + 1.2, 0.85, -4.0, Math.PI / 2.2, 0, 0, false);

  // Bucket with fish
  add(g, new THREE.CylinderGeometry(0.2, 0.17, 0.32, 8), iron, -0.3, 0.26, -1.0);
  add(g, new THREE.CylinderGeometry(0.17, 0.17, 0.06, 8), water, -0.3, 0.44, -1.0, 0, 0, 0, false);

  // Net hanging from post
  add(g, new THREE.CylinderGeometry(0.06, 0.07, 1.4, 5), wood, 0.4, 0.7, 0.2);
  add(g, new THREE.BoxGeometry(0.9, 0.8, 0.05), canvas, 0.4 + 0.2, 0.5, 0.2, 0.1, 0, 0.2, false);

  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  ANCIENT RITUAL SITE
// ════════════════════════════════════════════════════════════════════════════

/** Circle of menhirs with glowing altar at centre. */
export function buildRitualSite(anchor: THREE.Vector3, _rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const stone = mat(0x7788aa, 0.8);
  const dark = mat(0x445566, 0.85);
  const rune = mat(0x9966ff, 0.12, 0, 0x6644cc, 1.4);
  const gold = mat(0xffdd44, 0.12, 0.7, 0xddaa00, 0.9);
  const circle = mat(0x8855dd, 0.05, 0, 0x6633bb, 0.8);

  // ── Ground circle ──
  add(g, new THREE.TorusGeometry(3.5, 0.08, 5, 30), dark, 0, 0.05, 0, Math.PI / 2);
  add(g, new THREE.CylinderGeometry(3.55, 3.55, 0.04, 30), circle, 0, 0.02, 0, 0, 0, 0, false);

  // ── Menhirs (8 standing stones) ──
  const heights = [3.8, 3.2, 4.0, 2.9, 3.5, 3.8, 3.0, 3.6];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const px = Math.cos(a) * 3.5, pz = Math.sin(a) * 3.5;
    const h = heights[i]!;
    const lean = i % 3 === 1 ? 0.08 : 0;
    add(g, new THREE.BoxGeometry(0.5 + (i % 2) * 0.1, h, 0.3 + (i % 2) * 0.1), stone, px, h / 2, pz, lean, a, 0);
    // Rune glyph on facing side
    add(g, new THREE.BoxGeometry(0.18, h * 0.45, 0.06), rune, px - Math.cos(a) * 0.22, h * 0.55, pz - Math.sin(a) * 0.22, lean, a, 0, false);
  }

  // ── Central altar ──
  add(g, new THREE.CylinderGeometry(0.9, 1.1, 0.5, 8), dark, 0, 0.25);
  add(g, new THREE.BoxGeometry(1.2, 0.35, 0.9), stone, 0, 0.68);
  // Altar glow
  add(g, new THREE.CylinderGeometry(0.55, 0.55, 0.1, 10), circle, 0, 0.87, 0, 0, 0, 0, false);
  // Gold offering bowl
  add(g, new THREE.SphereGeometry(0.3, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), gold, 0, 0.9, 0, 0, 0, 0, false);
  add(g, new THREE.CylinderGeometry(0.28, 0.28, 0.04, 8), gold, 0, 1.05, 0, 0, 0, 0, false);

  return g;
}

// ════════════════════════════════════════════════════════════════════════════
//  CRASHED WAGON
// ════════════════════════════════════════════════════════════════════════════

/** Overturned wagon, spilled cargo, maybe a survivor. */
export function buildCrashedWagon(anchor: THREE.Vector3, _rng: Rng): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(anchor);

  const wood = mat(0x4a2e10, 0.92);
  const goods = mat(0x7a5030, 0.9);
  const iron = mat(0x444433, 0.6, 0.5);
  const canvas = mat(0xcc9966, 0.88);

  // ── Overturned wagon body (rotated ~45°) ──
  add(g, new THREE.BoxGeometry(3.5, 0.95, 2.0), wood, 0, 0.5, 0, 0, 0, 0.65);
  add(g, new THREE.BoxGeometry(3.5, 0.95, 0.2), wood, 0, 1.2, -0.85, 0, 0, 0.65);

  // ── Broken wheels ──
  const bwg = new THREE.TorusGeometry(0.52, 0.09, 5, 10);
  add(g, bwg, wood, -1.5, 0.55, -0.8, Math.PI / 2, 0, 0.65);
  add(g, bwg, wood,  1.5, 0.55, 0.8, Math.PI / 2, 0.3, 0.65);
  // Cracked wheel on ground
  add(g, new THREE.TorusGeometry(0.52, 0.09, 5, 10), wood, -2.2, 0.52, 1.5, Math.PI / 2, 0);
  add(g, new THREE.BoxGeometry(0.9, 0.09, 0.09), wood, -2.2, 0.52, 1.5, 0, 0.4, Math.PI / 5);

  // ── Spilled cargo ──
  for (let i = 0; i < 5; i++) {
    const sx = (Math.random() - 0.5) * 3.5, sz = (Math.random() - 0.5) * 2.5;
    add(g, new THREE.BoxGeometry(0.55, 0.55, 0.55), goods, sx, 0.27 + (Math.random() * 0.2), sz, 0, Math.random() * Math.PI * 2, Math.random() * 0.3 - 0.15);
  }
  // Sacks
  add(g, new THREE.SphereGeometry(0.3, 6, 5), canvas, 1.8, 0.32, -1.5);
  add(g, new THREE.SphereGeometry(0.25, 6, 5), canvas, 2.3, 0.27, -0.8);

  // ── Broken axle ──
  add(g, new THREE.CylinderGeometry(0.06, 0.08, 2.4, 6), iron, 0, 0.08, -0.2, 0, 0, Math.PI / 2 + 0.3);

  // ── Scattered tools/items ──
  add(g, new THREE.CylinderGeometry(0.025, 0.03, 1.5, 5), wood, -1.8, 0.1, -2.0, 0, 0, Math.PI / 2.2);
  add(g, new THREE.CylinderGeometry(0.22, 0.24, 0.65, 8), goods, 2.5, 0.32, 1.2);

  return g;
}
