import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import type { Rng } from '../../../systems/worldbuilder/RngTypes';

/**
 * Torre del Mago — a tall, WoW-styled high-elven mage spire.
 *
 * Flat-shaded stylized look (no PBR texture maps), real walkable interior:
 *  • Hollow octagonal shaft with a door gap on the ground tier.
 *  • Spiral staircase pulled well clear of the walls so the player never snags.
 *  • Genuine window openings (holes in the wall) with recessed glowing panes.
 *  • Clean open rooftop platform at the very top for an NPC.
 *
 * Collision is triangle-precise (BVH boundsTree), so the door and windows are real
 * openings and the stairs are real walking surfaces. Distant LODs collapse to a
 * solid silhouette.
 */

const SEGS = 8;             // octagonal footprint
const INNER_R = 5;          // interior radius
const WALL_THK = 0.6;
const FLOOR_H = 6;          // height of one wall tier
const FLOORS = 5;           // → shaft is 30 tall before the crown
const DOOR_SEG = 0;         // ground-floor face holding the doorway

// Flat stylized palette — solid colours, flatShading, no texture maps.
function makeMaterials() {
  const flat = (color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...opts });
  return {
    stone: flat(0x9aa6c2),
    stoneDark: flat(0x646f8c),
    gold: flat(0xe8c674, { roughness: 0.4, metalness: 0.6 }),
    roof: flat(0x52308f),
    glow: flat(0x9ffff0, { emissive: new THREE.Color(0x33e6cf), emissiveIntensity: 2.0, roughness: 0.4 }),
    glowGold: flat(0xfff0c0, { emissive: new THREE.Color(0xffc54d), emissiveIntensity: 1.6, roughness: 0.4 }),
    crystal: flat(0xb98cff, { emissive: new THREE.Color(0x7a3bff), emissiveIntensity: 2.2, roughness: 0.3 }),
  };
}
type Mats = ReturnType<typeof makeMaterials>;

function solid(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.isCollider = true;
  g.add(mesh);
  return mesh;
}

function deco(g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.Material,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.userData.noCollision = true;
  g.add(mesh);
  return mesh;
}

const apothem = INNER_R + WALL_THK / 2;
const faceW = 2 * INNER_R * Math.tan(Math.PI / SEGS) * 1.04; // slight overlap hides corner seams

/** Solid (windowless) wall face. */
function solidFace(g: THREE.Group, mats: Mats, a: number, baseY: number): void {
  solid(g, new THREE.BoxGeometry(faceW, FLOOR_H, WALL_THK), mats.stone,
    Math.cos(a) * apothem, baseY + FLOOR_H / 2, Math.sin(a) * apothem, 0, -a, 0);
}

/** Wall face with a real window hole: built from frame pieces around the opening. */
function windowFace(g: THREE.Group, mats: Mats, a: number, baseY: number): void {
  const ww = 1.1, wh = 2.2;                 // opening size
  const wy = baseY + FLOOR_H * 0.5;         // opening centre height
  const cx = Math.cos(a), cz = Math.sin(a);
  const sillH = (wy - wh / 2) - baseY;      // wall below the opening
  const lintelH = (baseY + FLOOR_H) - (wy + wh / 2); // wall above
  const jambW = (faceW - ww) / 2;           // wall left/right of the opening
  // below + above
  solid(g, new THREE.BoxGeometry(faceW, sillH, WALL_THK), mats.stone,
    cx * apothem, baseY + sillH / 2, cz * apothem, 0, -a, 0);
  solid(g, new THREE.BoxGeometry(faceW, lintelH, WALL_THK), mats.stone,
    cx * apothem, baseY + FLOOR_H - lintelH / 2, cz * apothem, 0, -a, 0);
  // left + right jambs (offset along the tangent)
  const tx = -Math.sin(a), tz = Math.cos(a); // tangent unit
  const off = (ww + jambW) / 2;
  for (const s of [-1, 1]) {
    solid(g, new THREE.BoxGeometry(jambW, wh, WALL_THK), mats.stone,
      cx * apothem + tx * off * s, wy, cz * apothem + tz * off * s, 0, -a, 0);
  }
  // recessed glowing pane + gold pointed arch trim
  deco(g, new THREE.BoxGeometry(ww * 0.85, wh * 0.9, 0.12), mats.glow,
    cx * (apothem - 0.18), wy, cz * (apothem - 0.18), 0, -a, 0);
  deco(g, new THREE.TorusGeometry(ww * 0.55, 0.09, 6, 10, Math.PI), mats.gold,
    cx * (apothem + 0.05), wy + wh / 2, cz * (apothem + 0.05), 0, -a, 0);
}

/** Door face: opening to the ground with a pointed lintel above. */
function doorFace(g: THREE.Group, mats: Mats, a: number, baseY: number): void {
  const cx = Math.cos(a), cz = Math.sin(a);
  const dw = 1.8;
  const lintelH = FLOOR_H * 0.3;
  const jambW = (faceW - dw) / 2;
  solid(g, new THREE.BoxGeometry(faceW, lintelH, WALL_THK), mats.stone,
    cx * apothem, baseY + FLOOR_H - lintelH / 2, cz * apothem, 0, -a, 0);
  const tx = -Math.sin(a), tz = Math.cos(a);
  const doorH = FLOOR_H - lintelH;
  const off = (dw + jambW) / 2;
  for (const s of [-1, 1]) {
    solid(g, new THREE.BoxGeometry(jambW, doorH, WALL_THK), mats.stone,
      cx * apothem + tx * off * s, baseY + doorH / 2, cz * apothem + tz * off * s, 0, -a, 0);
  }
  deco(g, new THREE.TorusGeometry(dw * 0.55, 0.11, 6, 10, Math.PI), mats.gold,
    cx * (apothem + 0.05), baseY + doorH, cz * (apothem + 0.05), 0, -a, 0);
}

/** One octagonal wall tier. Ground tier carries the door; upper tiers get windows. */
function wallTier(g: THREE.Group, mats: Mats, baseY: number, isGround: boolean): void {
  for (let i = 0; i < SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    if (isGround && i === DOOR_SEG) { doorFace(g, mats, a, baseY); continue; }
    if (i % 2 === 1) windowFace(g, mats, a, baseY);
    else solidFace(g, mats, a, baseY);
  }
}

/** Slender corner ribs running the full shaft — buttresses + seam cover. */
function cornerRibs(g: THREE.Group, mats: Mats, top: number): void {
  const r = INNER_R + WALL_THK;
  for (let i = 0; i < SEGS; i++) {
    const a = ((i + 0.5) / SEGS) * Math.PI * 2;
    solid(g, new THREE.CylinderGeometry(0.26, 0.38, top, 6), mats.stoneDark,
      Math.cos(a) * r, top / 2, Math.sin(a) * r);
    deco(g, new THREE.OctahedronGeometry(0.28), mats.gold, Math.cos(a) * r, top + 0.28, Math.sin(a) * r);
  }
}

// Vertical-circulation geometry. The shaft keeps a continuous open central well
// (the "cavity") so the stairs run all the way up and out through the roof oculus.
const STAIR_R = 2.4;          // tread centre radius
const TREAD_W = 1.7, TREAD_D = 1.0;
const WELL_INNER = 3.5;       // oculus / balcony inner radius — wide, easily passable
const STEP_RISE = 0.4;        // below the capsule step-detector's 0.5 limit, so it always climbs

/**
 * Spiral staircase, clear of the walls, winding around a central newel.
 * Climbs until its top tread surface is flush with `deckY`. Returns the angle of
 * the final tread so the caller can drop a landing that bridges onto the deck.
 */
function spiralStairs(g: THREE.Group, mats: Mats, deckY: number): number {
  const stepsPerRev = 22;
  const steps = Math.max(1, Math.round((deckY - 0.3) / STEP_RISE));
  let a = Math.PI;
  for (let i = 0; i <= steps; i++) {
    a = (i / stepsPerRev) * Math.PI * 2 + Math.PI; // begin near the door
    const y = i * STEP_RISE + 0.3;
    solid(g, new THREE.BoxGeometry(TREAD_W, 0.3, TREAD_D), mats.stoneDark,
      Math.cos(a) * STAIR_R, y, Math.sin(a) * STAIR_R, 0, -a, 0);
  }
  // Central newel — stops below the deck so it never blocks the roof exit.
  const newelH = deckY - 1.5;
  solid(g, new THREE.CylinderGeometry(0.45, 0.55, newelH, 8), mats.stone, 0, newelH / 2, 0);
  return a;
}

/** Annular balcony ledge against the wall; leaves the central well fully open. */
function balcony(g: THREE.Group, mats: Mats, y: number): void {
  const ledge = new THREE.RingGeometry(WELL_INNER, INNER_R - 0.1, SEGS, 1);
  solid(g, ledge, mats.stoneDark, 0, y, 0, -Math.PI / 2, 0, 0);
}

/** Random floating arcane items orbiting the tower — pure decoration, no collision. */
function floatingItems(g: THREE.Group, mats: Mats, rng?: Rng): void {
  const rnd = makeRnd(rng);
  const palette = [mats.crystal, mats.glow, mats.glowGold, mats.gold];
  const shapes = [
    () => new THREE.OctahedronGeometry(0.35 + rnd() * 0.4),
    () => new THREE.IcosahedronGeometry(0.3 + rnd() * 0.3),
    () => new THREE.TorusGeometry(0.4 + rnd() * 0.3, 0.08, 6, 14),
    () => new THREE.BoxGeometry(0.5, 0.7, 0.12), // floating spellbook
    () => new THREE.TetrahedronGeometry(0.4 + rnd() * 0.3),
  ];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const rad = INNER_R + 2.5 + rnd() * 7;       // orbit outside the walls
    const y = 4 + rnd() * (FLOOR_H * FLOORS + 4); // anywhere up the shaft
    const mat = palette[Math.floor(rnd() * palette.length)];
    const geo = shapes[Math.floor(rnd() * shapes.length)]();
    deco(g, geo, mat, Math.cos(a) * rad, y, Math.sin(a) * rad,
      rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
  }
}

/** Use the seeded Rng when present; otherwise a fixed LCG for deterministic decor. */
function makeRnd(rng?: Rng): () => number {
  if (rng) return () => rng.next();
  let s = 0x6d61676f; // "mago"
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const PLAT_R = INNER_R + 0.6;

/**
 * Clean open rooftop. The deck walking surface sits exactly at `deckY` (flush with
 * the stair top). It is an annulus with a central oculus (the cavity), plus a solid
 * landing slab at `landingAngle` that bridges the last tread onto the deck ring so
 * the player walks straight off the stairs onto the roof. NPC stands on the ring.
 */
function crown(g: THREE.Group, mats: Mats, deckY: number, landingAngle: number): void {
  // Annular deck — open oculus in the middle, solid ring to walk on. Top at deckY.
  solid(g, new THREE.RingGeometry(WELL_INNER, PLAT_R, SEGS, 1), mats.stone,
    0, deckY, 0, -Math.PI / 2, 0, 0);
  // Thin rim skirt under the deck edge — OPEN-ENDED (no caps) so it never seals
  // the oculus. A capped cylinder here would be a circular ceiling over the well.
  solid(g, new THREE.CylinderGeometry(PLAT_R, PLAT_R + 0.3, 0.5, SEGS, 1, true), mats.stone, 0, deckY - 0.25, 0);

  // Landing slab: bridges the oculus → deck at the stair's exit, flush with deckY.
  const landR = (1.4 + PLAT_R) / 2;
  solid(g, new THREE.BoxGeometry(2.4, 0.3, PLAT_R - 1.4), mats.stone,
    Math.cos(landingAngle) * landR, deckY - 0.15, Math.sin(landingAngle) * landR, 0, -landingAngle, 0);

  deco(g, new THREE.TorusGeometry(PLAT_R + 0.1, 0.12, 8, SEGS * 3), mats.gold,
    0, deckY, 0, Math.PI / 2, 0, 0);
  // Glowing ring around the oculus rim.
  deco(g, new THREE.TorusGeometry(WELL_INNER, 0.1, 8, SEGS * 3), mats.glow,
    0, deckY + 0.05, 0, Math.PI / 2, 0, 0);
  // Low battlement merlons around the rim (skip the landing sector so it stays open).
  for (let i = 0; i < SEGS; i++) {
    const a = (i / SEGS) * Math.PI * 2;
    solid(g, new THREE.BoxGeometry(0.9, 1.1, 0.45), mats.stone,
      Math.cos(a) * PLAT_R, deckY + 0.55, Math.sin(a) * PLAT_R, 0, -a, 0);
  }
  // Four corner finials with glowing crystal tips.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = Math.cos(a) * (PLAT_R - 0.2), pz = Math.sin(a) * (PLAT_R - 0.2);
    deco(g, new THREE.ConeGeometry(0.4, 3.0, 6), mats.roof, px, deckY + 2.0, pz);
    deco(g, new THREE.OctahedronGeometry(0.3), mats.crystal, px, deckY + 3.8, pz);
  }
}

function buildFull(scale: number, rng?: Rng): THREE.Group {
  const g = new THREE.Group();
  const mats = makeMaterials();
  const shaftTop = FLOOR_H * FLOORS; // 30
  const base = 2;                    // wall start height (atop plinth)

  // Stepped base plinth.
  solid(g, new THREE.CylinderGeometry(INNER_R + 2.4, INNER_R + 3.2, 1.0, SEGS), mats.stoneDark, 0, 0.5, 0);
  solid(g, new THREE.CylinderGeometry(INNER_R + 1.6, INNER_R + 2.4, 0.8, SEGS), mats.stone, 0, 1.3, 0);
  deco(g, new THREE.TorusGeometry(INNER_R + 1.9, 0.12, 8, SEGS * 3), mats.glow, 0, 1.75, 0, Math.PI / 2, 0, 0);

  for (let f = 0; f < FLOORS; f++) {
    wallTier(g, mats, base + f * FLOOR_H, f === 0);
    if (f > 0) balcony(g, mats, base + f * FLOOR_H + 0.3);
    deco(g, new THREE.TorusGeometry(apothem + 0.05, 0.13, 8, SEGS * 3), mats.gold,
      0, base + f * FLOOR_H, 0, Math.PI / 2, 0, 0);
  }

  cornerRibs(g, mats, base + shaftTop);
  const deckY = base + shaftTop;
  const landingAngle = spiralStairs(g, mats, deckY);  // stairs climb flush to the deck
  crown(g, mats, deckY, landingAngle);
  floatingItems(g, mats, rng);

  g.scale.setScalar(scale);
  // NPC stands on the deck ring opposite the landing, clear of the oculus.
  const anchorR = (WELL_INNER + PLAT_R) / 2;
  g.userData.npcAnchor = new THREE.Vector3(
    Math.cos(landingAngle + Math.PI) * anchorR * scale,
    (deckY + 0.9) * scale,
    Math.sin(landingAngle + Math.PI) * anchorR * scale,
  );
  return g;
}

/** Cheap distant silhouette. */
function buildLOD(scale: number): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x9aa6c2, roughness: 0.85, flatShading: true });
  const shaftTop = FLOOR_H * FLOORS;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(INNER_R + 0.6, INNER_R + 2.0, shaftTop + 4, SEGS), stone);
  body.position.y = (shaftTop + 4) / 2;
  body.castShadow = true;
  body.userData.isCollider = true;
  g.add(body);
  g.scale.setScalar(scale);
  return g;
}

export class MageTower extends Mesh {
  static readonly type = 'mage_tower';
  static readonly category = 'building' as const;
  static readonly aliases = ['torre_del_mago'] as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale, rng } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);
    lod.addLevel(buildFull(scale, rng), 0);   // Full interior (0–260)
    lod.addLevel(buildLOD(scale), 260);  // Solid silhouette (260+)
    return lod;
  }
}

registerMesh(MageTower);
