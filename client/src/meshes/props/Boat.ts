import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import * as G from '../../systems/worldbuilder/objects/geoCache';

/**
 * Boat — a small low-poly wooden sloop the player boards on entering water.
 *
 * Faces +Z (forward), waterline near y=0. Hull is a hand-authored faceted
 * BufferGeometry with rocker (ends lifted), a deep amidships, a fine rising bow,
 * a keel and a foredeck. Two billowing triangular sails: a mainsail on the boom
 * (in the animated "rig" sub-group) and a jib on the forestay (named "jib").
 * Root is `noMerge` so the rig/jib survive buildMesh's merge and can animate.
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

function rope(g: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3, m: THREE.MeshStandardMaterial, r = 0.025): void {
  const dir = to.clone().sub(from);
  const len = dir.length();
  const mesh = new THREE.Mesh(G.cylinder(r, r, len, 4), m);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  mesh.userData.noCollision = true;
  g.add(mesh);
}

/** Subdivided triangle between 3 corners, bulged along +X (billow peaks at the centroid). */
function billowedTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, bulge: number, n = 5): THREE.BufferGeometry {
  const pos: number[] = [];
  const id = new Map<string, number>();
  let k = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n - i; j++) {
      const u = 1 - i / n - j / n, v = i / n, w = j / n;
      const x = a.x * u + b.x * v + c.x * w + bulge * 27 * u * v * w;
      const y = a.y * u + b.y * v + c.y * w;
      const z = a.z * u + b.z * v + c.z * w;
      pos.push(x, y, z);
      id.set(`${i}_${j}`, k++);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      idx.push(id.get(`${i}_${j}`)!, id.get(`${i + 1}_${j}`)!, id.get(`${i}_${j + 1}`)!);
      if (i + j < n - 1) {
        idx.push(id.get(`${i + 1}_${j}`)!, id.get(`${i + 1}_${j + 1}`)!, id.get(`${i}_${j + 1}`)!);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Skinned hull with a rounded-V cross-section (keel → turn of the bilge → flared
 * gunwale) so it reads as a boat, not a flat-bottomed barge. Each station is
 * [z, beam(half-width), depth(keel below 0), top(gunwale above 0)] with rocker
 * (ends lifted, deepest amidships).
 */
// Normalized half-section profile: [widthFraction, yFraction]. y<0 scales by
// depth (toward the keel), y>0 scales by top (toward the gunwale).
const SECTION: Array<[number, number]> = [
  [0.00, -1.00], // keel
  [0.42, -0.80],
  [0.74, -0.42],
  [0.94, 0.05], // turn of the bilge
  [1.00, 1.00], // gunwale
];

function hullGeometry(): THREE.BufferGeometry {
  const stations: Array<[number, number, number, number]> = [
    [-2.00, 0.56, 0.30, 0.66], // transom (stern)
    [-1.10, 0.74, 0.55, 0.56],
    [ 0.00, 0.82, 0.64, 0.52], // beam: widest + deepest
    [ 1.10, 0.66, 0.50, 0.56],
    [ 1.90, 0.46, 0.36, 0.66],
    [ 2.45, 0.26, 0.22, 0.80],
    [ 2.90, 0.05, 0.12, 0.98], // fine, high, pointed bow
  ];
  const P = SECTION.length;
  const pos: number[] = [];
  // Vertex layout: for each station, the right side (P points) then the left.
  const vid = (s: number, side: 0 | 1, i: number): number => s * (2 * P) + side * P + i;
  for (const [z, beam, depth, top] of stations) {
    for (const sign of [1, -1]) {
      for (const [wf, yf] of SECTION) {
        const x = sign * wf * beam;
        const y = yf < 0 ? yf * depth : yf * top;
        pos.push(x, y, z);
      }
    }
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number): void => { idx.push(a, b, c, a, c, d); };
  for (let s = 0; s < stations.length - 1; s++) {
    for (const side of [0, 1] as const) {
      for (let i = 0; i < P - 1; i++) {
        // Wind the two sides oppositely so normals face outward.
        if (side === 0) quad(vid(s, side, i), vid(s + 1, side, i), vid(s + 1, side, i + 1), vid(s, side, i + 1));
        else quad(vid(s, side, i), vid(s, side, i + 1), vid(s + 1, side, i + 1), vid(s + 1, side, i));
      }
    }
  }
  // Transom: close the stern section (right ↔ left).
  for (let i = 0; i < P - 1; i++) {
    quad(vid(0, 0, i), vid(0, 0, i + 1), vid(0, 1, i + 1), vid(0, 1, i));
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
    g.userData.noMerge = true;

    const hullMat = mat(0x7a4f2b, 0.82, THREE.DoubleSide);
    const deckMat = mat(0x6b4426, 0.85, THREE.DoubleSide);
    const floorMat = mat(0x563c22, 0.9);
    const trim = mat(0x32220f, 0.7);
    const bench = mat(0x8a6038, 0.8);
    const keelMat = mat(0x3f2c18, 0.85);
    const rigMat = mat(0x4a3a28, 0.9);
    const stripeMat = mat(0x2f5d6e, 0.6); // painted sheer stripe (teal)
    const sailMat = mat(0xf2ead6, 0.95, THREE.DoubleSide, false);
    const flagMat = mat(0xc0392b, 0.8, THREE.DoubleSide);

    // Hull + floorboards.
    part(g, hullGeometry(), hullMat);
    part(g, G.box(0.85, 0.06, 3.4), floorMat, 0, 0.0, -0.1);

    // Painted sheer stripe + dark rubrail cap along each topside, transom cap.
    part(g, G.box(0.07, 0.16, 3.2), stripeMat, 0.73, 0.40, -0.2);
    part(g, G.box(0.07, 0.16, 3.2), stripeMat, -0.73, 0.40, -0.2);
    part(g, G.box(0.10, 0.10, 3.1), trim, 0.71, 0.56, -0.2);
    part(g, G.box(0.10, 0.10, 3.1), trim, -0.71, 0.56, -0.2);
    part(g, G.box(1.15, 0.11, 0.12), trim, 0, 0.6, -1.98);

    // Keel down the centreline + a rudder & tiller at the stern.
    part(g, G.box(0.12, 0.26, 4.2), keelMat, 0, -0.3, 0.0);
    part(g, G.box(0.06, 0.7, 0.42), keelMat, 0, -0.15, -2.12);          // rudder blade
    part(g, G.cylinder(0.04, 0.04, 1.1, 5), trim, 0, 0.6, -1.6, 0.5);   // tiller

    // Bowsprit spar projecting from the stem.
    part(g, G.cylinder(0.05, 0.06, 1.0, 5), rigMat, 0, 0.92, 3.15, Math.PI / 2 - 0.15);

    // Foredeck: a triangular deck closing the bow over the gunwales.
    part(g, billowedTriangle(
      new THREE.Vector3(-0.46, 0.6, 1.5), new THREE.Vector3(0.46, 0.6, 1.5),
      new THREE.Vector3(0, 0.92, 2.85), 0,
    ), deckMat);

    // Helm bench (aft) + a forward thwart.
    part(g, G.box(1.1, 0.09, 0.3), bench, 0, 0.34, -1.25);
    part(g, G.box(1.0, 0.09, 0.28), bench, 0, 0.34, 0.5);

    // ── Rig ──────────────────────────────────────────────────────────────────
    const mastZ = 0.5;
    const mastTop = 3.5;
    const boomY = 1.05;
    part(g, G.cylinder(0.06, 0.09, mastTop, 6), rigMat, 0, mastTop / 2, mastZ);

    // Mainsail + boom in a pivoting "rig" group (animated by BoatSystem).
    const rig = new THREE.Group();
    rig.name = 'rig';
    rig.position.set(0, boomY, mastZ);
    const foot = 1.7;
    part(rig, G.cylinder(0.045, 0.045, foot, 5), rigMat, 0, 0, -foot / 2, Math.PI / 2);
    const main = part(rig, billowedTriangle(
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -foot),
      new THREE.Vector3(0, mastTop - boomY - 0.15, 0), 0.5,
    ), sailMat);
    main.name = 'sail';
    g.add(rig);

    // Jib (foresail): a clean foretriangle on the forestay, forward of the mast.
    // Luff runs bow→upper-forestay; foot low along the foredeck; leech faces aft.
    const jib = part(g, billowedTriangle(
      new THREE.Vector3(0, 0.95, 3.5),  // tack at the bowsprit tip
      new THREE.Vector3(0, 2.8, 0.95),  // head up the forestay
      new THREE.Vector3(0, 1.0, 1.55),  // clew (aft-low, ahead of the mast)
      0.32,
    ), sailMat);
    jib.name = 'jib';

    // Standing rigging.
    const headPt = new THREE.Vector3(0, mastTop, mastZ);
    rope(g, headPt, new THREE.Vector3(0, 0.95, 3.5), rigMat);  // forestay to bowsprit
    rope(g, headPt, new THREE.Vector3(0, 0.7, -1.9), rigMat);  // backstay
    rope(g, headPt, new THREE.Vector3(0.72, 0.55, mastZ), rigMat);
    rope(g, headPt, new THREE.Vector3(-0.72, 0.55, mastZ), rigMat);

    // Masthead pennant.
    part(g, G.box(0.02, 0.22, 0.5), flagMat, 0, mastTop - 0.2, mastZ + 0.3);

    return g;
  }
}

registerMesh(Boat);
