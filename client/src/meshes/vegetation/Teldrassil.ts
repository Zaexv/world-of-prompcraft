import * as THREE from 'three';
import { applyBarkPBR } from '../../utils/PBRMaps';
import { cone, cylinder, sphere } from '../../systems/worldbuilder/objects/geoCache';
import { cylinderCollider } from '../../systems/worldbuilder/colliderProxy';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';

/**
 * Teldrassil — the great World Tree. A unique, monumental landmark: a sculpted
 * buttress-rooted trunk that splays into limbs holding a vast, self-illuminated
 * golden canopy. The canopy + motes are emissive so the bloom pass makes the
 * whole crown glow with ZERO scene lights (a real PointLight would recompile
 * every material in the game — see add-mesh perf rules).
 *
 * Not `instanceable`: it is placed once as an authored landmark, and its sheer
 * material/geometry count makes per-chunk instancing pointless.
 */

// ── Shared materials (built once, reused across all LOD levels) ──────────────
let _barkMat: THREE.MeshStandardMaterial | null = null;
let _canopyMat: THREE.MeshStandardMaterial | null = null;
let _canopyDeepMat: THREE.MeshStandardMaterial | null = null;
let _moteMat: THREE.MeshStandardMaterial | null = null;

function getBarkMat(): THREE.MeshStandardMaterial {
  if (!_barkMat) {
    _barkMat = new THREE.MeshStandardMaterial({ color: 0x6b5a44, roughness: 0.95 });
    applyBarkPBR(_barkMat);
    _barkMat.userData.flatColor = 0x5a4a36;
  }
  return _barkMat;
}

/** Bright outer foliage — the lit, glowing surface of the crown. */
function getCanopyMat(): THREE.MeshStandardMaterial {
  if (!_canopyMat) {
    _canopyMat = new THREE.MeshStandardMaterial({
      color: 0xf5d066,
      emissive: new THREE.Color(0xffb43a),
      emissiveIntensity: 0.55,
      roughness: 0.8,
      metalness: 0.0,
    });
    _canopyMat.userData.flatColor = 0xe8c45a;
  }
  return _canopyMat;
}

/** Deeper, warmer foliage tucked under the bright puffs for depth. */
function getCanopyDeepMat(): THREE.MeshStandardMaterial {
  if (!_canopyDeepMat) {
    _canopyDeepMat = new THREE.MeshStandardMaterial({
      color: 0xc8923a,
      emissive: new THREE.Color(0xd07a1e),
      emissiveIntensity: 0.35,
      roughness: 0.85,
      metalness: 0.0,
    });
    _canopyDeepMat.userData.flatColor = 0xb07e30;
  }
  return _canopyDeepMat;
}

/** Floating spirit motes — tiny intense emitters that bloom into glints. */
function getMoteMat(): THREE.MeshStandardMaterial {
  if (!_moteMat) {
    _moteMat = new THREE.MeshStandardMaterial({
      color: 0xfff2c0,
      emissive: new THREE.Color(0xffe28a),
      emissiveIntensity: 2.4,
      roughness: 0.4,
    });
    _moteMat.userData.flatColor = 0xfff2c0;
  }
  return _moteMat;
}

// ── Deterministic layout tables (fixed → every LOD level matches) ────────────
interface Limb { ang: number; tilt: number; len: number; rad: number; }
const LIMBS: Limb[] = [
  { ang: 0.0, tilt: 0.62, len: 1.0, rad: 0.42 },
  { ang: 1.3, tilt: 0.55, len: 0.9, rad: 0.38 },
  { ang: 2.5, tilt: 0.68, len: 1.05, rad: 0.40 },
  { ang: 3.7, tilt: 0.50, len: 0.85, rad: 0.36 },
  { ang: 4.7, tilt: 0.64, len: 0.95, rad: 0.40 },
  { ang: 5.7, tilt: 0.58, len: 1.0, rad: 0.38 },
];

interface Root { ang: number; len: number; rad: number; }
const ROOTS: Root[] = [
  { ang: 0.4, len: 1.0, rad: 1.1 },
  { ang: 1.5, len: 0.85, rad: 0.95 },
  { ang: 2.6, len: 1.05, rad: 1.2 },
  { ang: 3.6, len: 0.9, rad: 1.0 },
  { ang: 4.6, len: 1.0, rad: 1.1 },
  { ang: 5.6, len: 0.8, rad: 0.9 },
];

interface Puff { x: number; y: number; z: number; r: number; deep?: boolean; }
// Broad rounded crown: a deep underlayer + bright cap puffs, in trunk-relative
// units (×canopyR / ×canopyY at build time).
const PUFFS: Puff[] = [
  { x: 0.0, y: 1.02, z: 0.0, r: 0.62 },
  { x: 0.55, y: 0.92, z: 0.18, r: 0.46 },
  { x: -0.5, y: 0.95, z: -0.3, r: 0.5 },
  { x: 0.2, y: 0.98, z: -0.58, r: 0.44 },
  { x: -0.28, y: 0.9, z: 0.55, r: 0.46 },
  { x: 0.72, y: 0.78, z: -0.35, r: 0.4 },
  { x: -0.7, y: 0.8, z: 0.28, r: 0.42 },
  { x: 0.34, y: 0.72, z: 0.66, r: 0.4 },
  { x: -0.15, y: 1.12, z: 0.1, r: 0.4 },
  { x: 0.0, y: 0.82, z: 0.0, r: 0.7, deep: true },
  { x: 0.45, y: 0.7, z: -0.1, r: 0.5, deep: true },
  { x: -0.4, y: 0.74, z: 0.2, r: 0.5, deep: true },
  { x: 0.1, y: 0.68, z: 0.42, r: 0.46, deep: true },
];

interface Mote { x: number; y: number; z: number; }
const MOTES: Mote[] = [
  { x: 0.6, y: 0.86, z: 0.4 },
  { x: -0.55, y: 0.94, z: -0.25 },
  { x: 0.25, y: 1.05, z: -0.5 },
  { x: -0.3, y: 0.8, z: 0.6 },
  { x: 0.7, y: 0.74, z: -0.45 },
  { x: -0.7, y: 0.88, z: 0.35 },
  { x: 0.0, y: 1.18, z: 0.15 },
  { x: 0.4, y: 0.66, z: 0.55 },
];

function buildTeldrassil(scale: number, segs: number, canopySegs: number, castShadow: boolean): THREE.Group {
  const g = new THREE.Group();
  const barkMat = getBarkMat();
  const canopyMat = getCanopyMat();
  const deepMat = getCanopyDeepMat();
  const moteMat = getMoteMat();

  const trunkH = 34 * scale;
  const trunkRtop = 2.2 * scale;
  const trunkRbot = 5.5 * scale;

  // ── Trunk ──────────────────────────────────────────────────────────────
  const trunk = new THREE.Mesh(cylinder(trunkRtop, trunkRbot, trunkH, segs), barkMat);
  trunk.position.y = trunkH * 0.5;
  trunk.castShadow = castShadow;
  trunk.receiveShadow = true;
  trunk.userData.isCollider = true;
  g.add(trunk);

  // ── Buttress roots (tapered cylinders flaring out from the base) ─────────
  for (const { ang, len, rad } of ROOTS) {
    const rootLen = 9 * len * scale;
    const root = new THREE.Mesh(cylinder(0.8 * rad * scale, 2.2 * rad * scale, rootLen, Math.max(4, segs - 2)), barkMat);
    const dist = trunkRbot * 0.7;
    root.position.set(Math.cos(ang) * dist, rootLen * 0.32, Math.sin(ang) * dist);
    // Lay it out from the trunk: rotate so the long axis tips away & down.
    root.rotation.z = -Math.cos(ang) * 1.05;
    root.rotation.x = Math.sin(ang) * 1.05;
    root.castShadow = castShadow;
    root.receiveShadow = true;
    root.userData.noCollision = true;
    g.add(root);
  }

  // ── Major limbs splaying from the upper trunk ────────────────────────────
  const limbBaseY = trunkH * 0.62;
  for (const { ang, tilt, len, rad } of LIMBS) {
    const limbLen = 16 * len * scale;
    const limb = new THREE.Mesh(cylinder(0.5 * rad * scale, 1.4 * rad * scale, limbLen, Math.max(4, segs - 3)), barkMat);
    const dx = Math.cos(ang), dz = Math.sin(ang);
    // Anchor at trunk surface, push the mid-point out along the limb axis.
    const horiz = Math.sin(tilt) * limbLen * 0.5;
    limb.position.set(dx * (trunkRtop + horiz), limbBaseY + Math.cos(tilt) * limbLen * 0.5, dz * (trunkRtop + horiz));
    limb.rotation.z = -dx * tilt;
    limb.rotation.x = dz * tilt;
    limb.castShadow = castShadow;
    limb.receiveShadow = true;
    limb.userData.noCollision = true;
    g.add(limb);
  }

  // ── Canopy: layered glowing puffs centred above the crown ────────────────
  const canopyY = trunkH * 1.02;
  const canopyR = 22 * scale;
  for (const { x, y, z, r, deep } of PUFFS) {
    const mat = deep ? deepMat : canopyMat;
    const puff = new THREE.Mesh(sphere(r * canopyR, canopySegs, Math.max(4, canopySegs - 2)), mat);
    puff.position.set(x * canopyR, y * canopyY, z * canopyR);
    puff.castShadow = castShadow;
    puff.receiveShadow = castShadow;
    puff.userData.noCollision = true;
    g.add(puff);
  }

  // ── Spirit motes (tiny intense emitters → bloom glints) ──────────────────
  for (const { x, y, z } of MOTES) {
    const mote = new THREE.Mesh(sphere(0.5 * scale, 6, 5), moteMat);
    mote.position.set(x * canopyR, y * canopyY, z * canopyR);
    mote.userData.noCollision = true;
    g.add(mote);
  }

  // A faint hanging frond crown-skirt: a low cone of bright foliage so the
  // underside of the canopy reads as glowing rather than dark.
  const skirt = new THREE.Mesh(cone(canopyR * 0.85, canopyR * 0.5, canopySegs), deepMat);
  skirt.position.y = canopyY * 0.78;
  skirt.rotation.x = Math.PI; // point the apex down toward the trunk
  skirt.userData.noCollision = true;
  g.add(skirt);

  // ── Collision proxy: trunk footprint only ────────────────────────────────
  const proxy = cylinderCollider(trunkRbot * 0.9, trunkH);
  proxy.position.y = trunkH * 0.5;
  g.add(proxy);

  return g;
}

export class Teldrassil extends Mesh {
  static readonly type = 'teldrassil';
  static readonly category = 'vegetation' as const;
  static readonly aliases = ['teldrassil_tree', 'world_tree'] as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);

    // Level 0: Full — high-poly trunk + dense canopy, shadows.
    lod.addLevel(buildTeldrassil(scale, 12, 10, true), 0);
    // Level 1: Mid — fewer segments, shadows.
    lod.addLevel(buildTeldrassil(scale, 9, 8, true), 350);
    // Level 2: Low — coarse, no shadows.
    lod.addLevel(buildTeldrassil(scale, 7, 6, false), 800);
    // Level 3: Silhouette — minimal, no shadows (still huge → visible far).
    lod.addLevel(buildTeldrassil(scale, 5, 5, false), 1600);

    return lod;
  }
}

registerMesh(Teldrassil);
