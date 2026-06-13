import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { boxCollider } from '../../systems/worldbuilder/colliderProxy';

let _trunkMat: THREE.MeshStandardMaterial | null = null;
let _stemMat: THREE.MeshStandardMaterial | null = null;
let _frondMat: THREE.MeshStandardMaterial | null = null;
let _glowMat: THREE.MeshStandardMaterial | null = null;

function getTrunkMat() {
  if (!_trunkMat) {
    // Legendary deep-blue bark of Nireg
    _trunkMat = new THREE.MeshStandardMaterial({
      color: 0x2f4f8f,
      roughness: 0.8,
      metalness: 0.05,
      emissive: 0x0a1f4d,
      emissiveIntensity: 0.15,
    });
    _trunkMat.userData.flatColor = 0x2f4f8f;
  }
  return _trunkMat;
}

function getStemMat() {
  if (!_stemMat) {
    // Darker blue rib for each frond's spine
    _stemMat = new THREE.MeshStandardMaterial({
      color: 0x24407a,
      roughness: 0.75,
      metalness: 0.05,
    });
    _stemMat.userData.flatColor = 0x24407a;
  }
  return _stemMat;
}

function getFrondMat() {
  if (!_frondMat) {
    // Translucent azure fronds, lit from within
    _frondMat = new THREE.MeshStandardMaterial({
      color: 0x9fdcff,
      roughness: 0.35,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6,
      emissive: 0x3aa0ff,
      emissiveIntensity: 0.45,
      depthWrite: false,
    });
    _frondMat.userData.flatColor = 0x6fc3ef;
  }
  return _frondMat;
}

function getGlowMat() {
  if (!_glowMat) {
    // Magical motes / seed-pods and the light-pool beneath the crown
    _glowMat = new THREE.MeshStandardMaterial({
      color: 0xbfe9ff,
      roughness: 0.1,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      emissive: 0x8fe0ff,
      emissiveIntensity: 1.2,
      depthWrite: false,
    });
    _glowMat.userData.flatColor = 0x8fe0ff;
  }
  return _glowMat;
}

const trunkGeoCache = new Map<string, THREE.BufferGeometry>();
const stemsGeoCache = new Map<string, THREE.BufferGeometry>();
const leavesGeoCache = new Map<string, THREE.BufferGeometry>();
const magicGeoCache = new Map<string, THREE.BufferGeometry>();

/**
 * Lathed, gently-leaning trunk profile. Geometry depends only on `scale` and
 * `segs`, so it is cached and shared across every placement.
 */
function getTrunkGeometry(scale: number, segs: number): THREE.BufferGeometry {
  const key = `${scale}:${segs}`;
  let geo = trunkGeoCache.get(key);
  if (geo) return geo;

  const height = 7.5 * scale;
  const lean = 1.1 * scale; // fixed gentle lean, identical for every placement
  const points: THREE.Vector2[] = [];
  const sections = 14;
  for (let i = 0; i <= sections; i++) {
    const t = i / sections;
    const baseRadius = 0.42 * scale * (1 - t * 0.55);
    const ring = 1 + 0.08 * Math.sin(t * Math.PI * 9); // subtle node rings
    points.push(new THREE.Vector2(Math.max(baseRadius * ring, 0.02), t * height));
  }

  geo = new THREE.LatheGeometry(points, segs);

  // Bake a fixed lean into the silhouette (no per-instance variation).
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = y / height;
    pos.setX(i, pos.getX(i) + lean * t * t);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  geo.userData = { height, lean };

  trunkGeoCache.set(key, geo);
  return geo;
}

/**
 * One frond's central rib, built along local +Z, arcing up then curling
 * down toward the tip like a real palm frond.
 */
function buildFrondSpine(length: number, segments: number): THREE.Vector3[] {
  const spine: THREE.Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const out = Math.sin(t * Math.PI * 0.55) * length; // reach outward
    const rise = Math.sin(t * Math.PI * 0.55) * length * 0.35; // gentle arch up
    const drop = Math.pow(t, 2.2) * length * 0.95; // curl down toward tip
    spine.push(new THREE.Vector3(0, rise - drop, out));
  }
  return spine;
}

/**
 * A single frond (rib + two rows of drooping leaflets) in local space,
 * pointing along +Z from the crown center.
 */
function buildFrondGeometries(scale: number, length: number, segments: number): { stem: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const spine = buildFrondSpine(length, segments);

  // Rib as a thin tapered tube approximated by a stretched cylinder per segment.
  const stemParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < spine.length - 1; i++) {
    const a = spine[i];
    const b = spine[i + 1];
    const segLen = a.distanceTo(b);
    const t = i / (spine.length - 1);
    const radius = 0.05 * scale * (1 - t * 0.8);
    const cyl = new THREE.CylinderGeometry(radius * 0.85, radius, segLen, 4);
    cyl.translate(0, segLen / 2, 0);
    cyl.rotateX(Math.PI / 2);
    const dir = b.clone().sub(a).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    cyl.applyQuaternion(quat);
    cyl.translate(a.x, a.y, a.z);
    stemParts.push(cyl);
  }
  const stem = mergeGeometries(stemParts, false) ?? new THREE.BufferGeometry();
  stem.computeVertexNormals();

  // Leaflets: pairs of drooping planes along the rib, hanging toward the ground.
  const leafParts: THREE.BufferGeometry[] = [];
  const leafCount = 10;
  for (let i = 0; i < leafCount; i++) {
    const t = i / (leafCount - 1);
    const idx = Math.min(spine.length - 2, Math.floor(t * (spine.length - 1)));
    const a = spine[idx];
    const b = spine[Math.min(spine.length - 1, idx + 1)];
    const dir = b.clone().sub(a).normalize();

    const leafLen = (0.5 + 0.5 * Math.sin((1 - t) * Math.PI)) * length * 0.4;
    const leafWidth = (0.18 + 0.22 * Math.sin((1 - t) * Math.PI)) * scale;
    // Leaves hang downward and splay outward to either side of the rib.
    for (const side of [-1, 1]) {
      const leaf = new THREE.PlaneGeometry(leafWidth, leafLen, 1, 1);
      leaf.translate(0, -leafLen / 2, 0); // hinge at top edge, hang down
      leaf.rotateZ(side * 0.55); // splay sideways from vertical
      leaf.rotateY(side * 0.35); // fan outward

      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
      leaf.applyQuaternion(quat);
      leaf.translate(a.x, a.y, a.z);
      leafParts.push(leaf);
    }
  }
  const leaves = mergeGeometries(leafParts, false) ?? new THREE.BufferGeometry();
  leaves.computeVertexNormals();

  return { stem, leaves };
}

/**
 * Builds the entire crown as TWO merged geometries (one draw call each: ribs
 * + leaflets) by radially duplicating a single frond around the trunk top.
 */
function getCrownGeometries(scale: number, frondCount: number, segments: number): { stems: THREE.BufferGeometry; leaves: THREE.BufferGeometry } {
  const key = `${scale}:${frondCount}:${segments}`;
  const cachedStems = stemsGeoCache.get(key);
  const cachedLeaves = leavesGeoCache.get(key);
  if (cachedStems && cachedLeaves) return { stems: cachedStems, leaves: cachedLeaves };

  const length = 3.6 * scale;
  const { stem, leaves } = buildFrondGeometries(scale, length, segments);

  const stemCopies: THREE.BufferGeometry[] = [];
  const leafCopies: THREE.BufferGeometry[] = [];
  for (let f = 0; f < frondCount; f++) {
    const angle = (f / frondCount) * Math.PI * 2;
    const rot = new THREE.Matrix4().makeRotationY(angle);

    const s = stem.clone();
    s.applyMatrix4(rot);
    stemCopies.push(s);

    const l = leaves.clone();
    l.applyMatrix4(rot);
    leafCopies.push(l);
  }

  const stems = mergeGeometries(stemCopies, false) ?? new THREE.BufferGeometry();
  const mergedLeaves = mergeGeometries(leafCopies, false) ?? new THREE.BufferGeometry();
  stems.computeVertexNormals();
  mergedLeaves.computeVertexNormals();

  stemsGeoCache.set(key, stems);
  leavesGeoCache.set(key, mergedLeaves);
  return { stems, leaves: mergedLeaves };
}

/**
 * Magical seed-pods (small glowing crystals) ringing the heart of the crown,
 * merged into a single geometry/draw call.
 */
function getMagicGeometry(scale: number, count: number): THREE.BufferGeometry {
  const key = `${scale}:${count}`;
  let geo = magicGeoCache.get(key);
  if (geo) return geo;

  const geos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 0.5 * scale;
    const pod = new THREE.IcosahedronGeometry(0.18 * scale, 0);
    pod.translate(Math.cos(angle) * radius, 0.15 * scale, Math.sin(angle) * radius);
    geos.push(pod);
  }

  geo = mergeGeometries(geos, false) ?? new THREE.BufferGeometry();
  geo.computeVertexNormals();

  magicGeoCache.set(key, geo);
  return geo;
}

function buildTreeGroup(scale: number, trunkSegs: number, frondCount: number, frondSegs: number, castShadow: boolean): THREE.Group {
  const g = new THREE.Group();

  const trunkGeo = getTrunkGeometry(scale, trunkSegs);
  const trunkHeight = (trunkGeo.userData as { height: number }).height;
  const lean = (trunkGeo.userData as { lean: number }).lean;

  const trunk = new THREE.Mesh(trunkGeo, getTrunkMat());
  trunk.castShadow = castShadow;
  trunk.receiveShadow = true;
  trunk.userData.isCollider = true;
  g.add(trunk);

  const trunkCol = boxCollider(0.8 * scale, trunkHeight, 0.8 * scale);
  trunkCol.position.set(lean / 2, trunkHeight / 2, 0);
  g.add(trunkCol);

  const crownPos = new THREE.Vector3(lean, trunkHeight, 0);
  const { stems, leaves } = getCrownGeometries(scale, frondCount, frondSegs);

  const stemsMesh = new THREE.Mesh(stems, getStemMat());
  stemsMesh.position.copy(crownPos);
  stemsMesh.castShadow = castShadow;
  g.add(stemsMesh);

  const leavesMesh = new THREE.Mesh(leaves, getFrondMat());
  leavesMesh.position.copy(crownPos);
  leavesMesh.castShadow = castShadow;
  g.add(leavesMesh);

  // Magical glowing seed-pods orbiting beneath the crown — one merged mesh.
  const pods = new THREE.Mesh(getMagicGeometry(scale, 5), getGlowMat());
  pods.position.copy(crownPos);
  pods.castShadow = castShadow;
  g.add(pods);

  // Soft magical light-pool projected on the ground beneath the canopy.
  const halo = new THREE.Mesh(new THREE.CircleGeometry(2.2 * scale, 16), getGlowMat());
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(lean, 0.04 * scale, 0);
  g.add(halo);

  return g;
}

export class NiregPalmTree extends Mesh {
  static readonly type = 'nireg_palmtree';
  static readonly category = 'vegetation' as const;
  // Shape depends only on `scale` (no position/rng variation) → safe to GPU
  // instance: every placement renders as ~5 shared draws per chunk.
  static readonly instanceable = true;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);

    lod.addLevel(buildTreeGroup(scale, 10, 8, 6, true), 0);
    lod.addLevel(buildTreeGroup(scale, 7, 6, 4, true), 180);
    lod.addLevel(buildTreeGroup(scale, 5, 5, 3, false), 360);

    return lod;
  }
}

registerMesh(NiregPalmTree);
