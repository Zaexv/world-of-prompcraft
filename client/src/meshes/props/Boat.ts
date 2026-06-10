import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import * as G from '../../systems/worldbuilder/objects/geoCache';

/**
 * Boat — a small low-poly wooden sailboat the player boards on entering water.
 *
 * Faces +Z (forward), waterline near y=0. The hull is a hand-authored faceted
 * BufferGeometry with a curved sheer, a keel and a bow stem; the rig (boom +
 * billowing triangular mainsail) lives in a named "rig" sub-group that pivots at
 * the mast so BoatSystem can swing it and flex the sail while sailing.
 *
 * The root is flagged `noMerge` so the hierarchy survives buildMesh's by-material
 * merge — the animated sail needs to stay addressable.
 */
const _mat = new Map<string, THREE.MeshStandardMaterial>();
function mat(
  hex: number, rough = 0.8, side: THREE.Side = THREE.FrontSide, flat = true,
): THREE.MeshStandardMaterial {
  const key = `${hex}|${rough}|${side}|${flat}`;
  let m = _mat.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, flatShading: flat, side });
    _mat.set(key, m);
  }
  return m;
}

function part(
  g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.MeshStandardMaterial,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.userData.noCollision = true;
  g.add(mesh);
  return mesh;
}

/** Thin rope/spar between two points. */
function rope(g: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, m: THREE.MeshStandardMaterial, r = 0.025): void {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const mesh = new THREE.Mesh(G.cylinder(r, r, len, 4), m);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.userData.noCollision = true;
  g.add(mesh);
}

/** Skinned hull from cross-section stations: [z, halfWidthBottom, halfWidthTop, bottomY, topY]. */
function hullGeometry(): THREE.BufferGeometry {
  // Curved sheer: gunwale (topY) rises toward bow and stern, dips amidships;
  // keel (bottomY) is deepest amidships. Reads as a real hull, not a box.
  const stations: Array<[number, number, number, number, number]> = [
    [-2.05, 0.34, 0.60, 0.16, 0.70], // transom (stern), raised gunwale
    [-1.15, 0.50, 0.76, -0.10, 0.58],
    [ 0.05, 0.58, 0.82, -0.20, 0.54], // beam (widest, deepest)
    [ 1.20, 0.44, 0.64, -0.08, 0.58],
    [ 2.05, 0.18, 0.36, 0.10, 0.70],
    [ 2.75, 0.02, 0.10, 0.40, 0.86], // raised pointed bow
  ];
  const pos: number[] = [];
  for (const [z, hwB, hwT, by, ty] of stations) {
    pos.push(-hwB, by, z, hwB, by, z, hwT, ty, z, -hwT, ty, z); // BL, BR, TR, TL
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number): void => { idx.push(a, b, c, a, c, d); };
  for (let s = 0; s < stations.length - 1; s++) {
    const o = s * 4, n = (s + 1) * 4;
    quad(o + 0, n + 0, n + 1, o + 1); // bottom
    quad(o + 0, o + 3, n + 3, n + 0); // left side
    quad(o + 1, n + 1, n + 2, o + 2); // right side
  }
  quad(0, 3, 2, 1); // stern transom

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Triangular billowing mainsail in rig-local space: tack at the origin (mast,
 * boom height), foot running aft to -Z, head up at +Y. Interior bulges in +X.
 */
function sailGeometry(height: number, foot: number, bulge: number): THREE.BufferGeometry {
  const NS = 8, NT = 6;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;            // up the luff (mast)
    const span = foot * (1 - s); // foot tapers to the head → triangle
    for (let j = 0; j <= NT; j++) {
      const t = j / NT;          // 0 at luff (mast), 1 at leech (aft)
      const y = s * height;
      const z = -t * span;
      const x = bulge * Math.sin(Math.PI * t) * Math.sin(Math.PI * (0.25 + s * 0.5));
      pos.push(x, y, z);
    }
  }
  const row = NT + 1;
  for (let i = 0; i < NS; i++) {
    for (let j = 0; j < NT; j++) {
      const a = i * row + j, b = a + 1, c = a + row, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class Boat extends Mesh {
  static readonly type = 'boat_rowboat';
  static readonly category = 'prop' as const;

  build(_ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.userData.noMerge = true; // keep hierarchy so the sail can animate

    const hullMat = mat(0x7a4f2b, 0.82, THREE.DoubleSide);
    const floorMat = mat(0x563c22, 0.9);
    const trim = mat(0x32220f, 0.7);
    const bench = mat(0x8a6038, 0.8);
    const keelMat = mat(0x3f2c18, 0.85);
    const rigMat = mat(0x4a3a28, 0.9);
    const sailMat = mat(0xf2ead6, 0.95, THREE.DoubleSide, false); // smooth billow
    const flagMat = mat(0xc0392b, 0.8, THREE.DoubleSide);

    // Hull, floorboards, gunwale trim.
    part(g, hullGeometry(), hullMat);
    part(g, G.box(0.9, 0.06, 3.7), floorMat, 0, 0.0, 0.05);
    part(g, G.box(0.10, 0.11, 4.0), trim, 0.74, 0.58, 0.0);
    part(g, G.box(0.10, 0.11, 4.0), trim, -0.74, 0.58, 0.0);
    part(g, G.box(1.25, 0.11, 0.12), trim, 0, 0.66, -2.02); // transom cap

    // Keel along the bottom centreline + a bow stem post.
    part(g, G.box(0.12, 0.22, 4.3), keelMat, 0, -0.26, 0.1);
    part(g, G.box(0.14, 0.5, 0.4), keelMat, 0, 0.2, 2.55, 0.5);

    // Aft helm bench + a forward thwart.
    part(g, G.box(1.2, 0.09, 0.3), bench, 0, 0.34, -1.3);
    part(g, G.box(1.1, 0.09, 0.28), bench, 0, 0.34, 0.6);

    // ── Rig ──────────────────────────────────────────────────────────────────
    const mastZ = 0.55;
    const mastTop = 3.5;
    const boomY = 1.05;
    part(g, G.cylinder(0.06, 0.09, mastTop, 6), rigMat, 0, mastTop / 2, mastZ);

    // Animated boom + sail, pivoting at the mast foot (named for BoatSystem).
    const rig = new THREE.Group();
    rig.name = 'rig';
    rig.position.set(0, boomY, mastZ);
    const foot = 1.7;
    part(rig, G.cylinder(0.045, 0.045, foot, 5), rigMat, 0, 0, -foot / 2, Math.PI / 2);
    const sail = part(rig, sailGeometry(mastTop - boomY - 0.15, foot, 0.5), sailMat);
    sail.name = 'sail';
    g.add(rig);

    // Standing rigging (static, on the hull): forestay, backstay, shrouds.
    const headPt = new THREE.Vector3(0, mastTop, mastZ);
    rope(g, headPt, new THREE.Vector3(0, 0.7, 2.6), rigMat);
    rope(g, headPt, new THREE.Vector3(0, 0.7, -1.9), rigMat);
    rope(g, headPt, new THREE.Vector3(0.74, 0.6, mastZ), rigMat);
    rope(g, headPt, new THREE.Vector3(-0.74, 0.6, mastZ), rigMat);

    // Masthead pennant.
    part(g, G.box(0.02, 0.22, 0.5), flagMat, 0, mastTop - 0.2, mastZ + 0.3);

    return g;
  }
}

registerMesh(Boat);
