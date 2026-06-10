import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import * as G from '../../systems/worldbuilder/objects/geoCache';

/**
 * Boat — a low-poly wooden sloop the player boards on entering water.
 *
 * Faces +Z (forward), waterline near y=0. Outer hull is a hand-authored faceted
 * BufferGeometry (rounded-V section, curved sheer, fine rising bow) skinned WITH
 * UVs so the wood texture maps along the planking; a separate darker inner shell
 * forms the cockpit. Rig: mainsail on a pivoting boom (animated) + a jib on the
 * forestay, mast, bowsprit, rudder/tiller and a ship's wheel at the helm.
 *
 * Root is `noMerge` so the animated rig/jib survive buildMesh's merge.
 */

// ── Wood textures (served from /public/textures) ──────────────────────────────
let _diff: THREE.Texture | null = null;
let _nor: THREE.Texture | null = null;
function woodMaps(): { diff: THREE.Texture; nor: THREE.Texture } {
  if (!_diff) {
    const loader = new THREE.TextureLoader();
    _diff = loader.load('/textures/wood_diff.jpg');
    _nor = loader.load('/textures/wood_nor.jpg');
    _diff.colorSpace = THREE.SRGBColorSpace;
    for (const t of [_diff, _nor]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  }
  return { diff: _diff, nor: _nor! };
}

const _mat = new Map<string, THREE.MeshStandardMaterial>();
/** Wood material: texture-mapped, tinted by `hex`. */
function wood(hex: number, repeat = 2, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const key = `w${hex}|${repeat}|${side}`;
  let m = _mat.get(key);
  if (!m) {
    const { diff, nor } = woodMaps();
    const d = diff.clone(); d.repeat.set(repeat, repeat); d.needsUpdate = true;
    const n = nor.clone(); n.repeat.set(repeat, repeat); n.needsUpdate = true;
    m = new THREE.MeshStandardMaterial({
      color: hex, map: d, normalMap: n, roughness: 0.85, metalness: 0, flatShading: true, side,
    });
    _mat.set(key, m);
  }
  return m;
}
/** Flat (untextured) material for rigging, sails, metal. */
function flat(hex: number, rough = 0.8, side: THREE.Side = THREE.FrontSide, flatS = true): THREE.MeshStandardMaterial {
  const key = `f${hex}|${rough}|${side}|${flatS}`;
  let m = _mat.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, flatShading: flatS, side });
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

function billowedTriangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, bulge: number, n = 5): THREE.BufferGeometry {
  const pos: number[] = [];
  const id = new Map<string, number>();
  let k = 0;
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= n - i; j++) {
      const u = 1 - i / n - j / n, v = i / n, w = j / n;
      pos.push(
        a.x * u + b.x * v + c.x * w + bulge * 27 * u * v * w,
        a.y * u + b.y * v + c.y * w,
        a.z * u + b.z * v + c.z * w,
      );
      id.set(`${i}_${j}`, k++);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n - i; j++) {
      idx.push(id.get(`${i}_${j}`)!, id.get(`${i + 1}_${j}`)!, id.get(`${i}_${j + 1}`)!);
      if (i + j < n - 1) idx.push(id.get(`${i + 1}_${j}`)!, id.get(`${i + 1}_${j + 1}`)!, id.get(`${i}_${j + 1}`)!);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Normalized half-section: [widthFraction, yFraction]. y<0 scales by depth, y>0 by top.
const SECTION: Array<[number, number]> = [
  [0.00, -1.00], [0.42, -0.80], [0.74, -0.42], [0.94, 0.05], [1.00, 1.00],
];
// Stations: [z, beam(half-width), depth(keel below 0), top(gunwale above 0)].
const STATIONS: Array<[number, number, number, number]> = [
  [-2.00, 0.56, 0.30, 0.66],
  [-1.10, 0.74, 0.55, 0.56],
  [ 0.00, 0.82, 0.64, 0.52],
  [ 1.10, 0.66, 0.50, 0.56],
  [ 1.90, 0.46, 0.36, 0.66],
  [ 2.45, 0.26, 0.22, 0.80],
  [ 2.90, 0.05, 0.12, 0.98],
];

/** Skin a hull from stations, with UVs (grain runs along the planking) + a transom. */
function skinHull(
  stations: Array<[number, number, number, number]>,
  beamK = 1, depthK = 1, lift = 0, transom = true,
): THREE.BufferGeometry {
  const P = SECTION.length;
  const zMin = stations[0]![0], zMax = stations[stations.length - 1]![0];
  const pos: number[] = [];
  const uv: number[] = [];
  const vid = (s: number, side: 0 | 1, i: number): number => s * (2 * P) + side * P + i;
  for (const [z, beam, depth, top] of stations) {
    for (const sign of [1, -1]) {
      for (let i = 0; i < P; i++) {
        const [wf, yf] = SECTION[i]!;
        const x = sign * wf * beam * beamK;
        const y = (yf < 0 ? yf * depth * depthK : yf * top) + lift;
        pos.push(x, y, z);
        uv.push(((z - zMin) / (zMax - zMin)) * 4, (i / (P - 1)) * 1.5);
      }
    }
  }
  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number): void => { idx.push(a, b, c, a, c, d); };
  for (let s = 0; s < stations.length - 1; s++) {
    for (const side of [0, 1] as const) {
      for (let i = 0; i < P - 1; i++) {
        if (side === 0) quad(vid(s, side, i), vid(s + 1, side, i), vid(s + 1, side, i + 1), vid(s, side, i + 1));
        else quad(vid(s, side, i), vid(s, side, i + 1), vid(s + 1, side, i + 1), vid(s + 1, side, i));
      }
    }
  }
  if (transom) for (let i = 0; i < P - 1; i++) quad(vid(0, 0, i), vid(0, 0, i + 1), vid(0, 1, i + 1), vid(0, 1, i));

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Ship's wheel at the helm: pedestal + rim + spokes + hub. */
function buildWheel(g: THREE.Object3D, z: number, baseY: number, wheelR: number, metal: THREE.MeshStandardMaterial, woodM: THREE.MeshStandardMaterial): void {
  const cy = baseY + wheelR + 0.15;
  part(g, G.cylinder(0.05, 0.07, wheelR + 0.15, 6), woodM, 0, baseY + (wheelR + 0.15) / 2, z); // pedestal
  part(g, G.torus(wheelR, 0.045, 6, 16), woodM, 0, cy, z);                                     // rim
  part(g, G.cylinder(0.07, 0.07, 0.1, 8), metal, 0, cy, z, Math.PI / 2);                       // hub
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    part(g, G.cylinder(0.02, 0.02, wheelR * 2, 4), woodM, 0, cy, z, 0, 0, a);                   // spokes
  }
}

export class Boat extends Mesh {
  static readonly type = 'boat_rowboat';
  static readonly category = 'prop' as const;

  build(_ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.userData.noMerge = true;

    const hullMat = wood(0x9a6a3c, 3, THREE.DoubleSide);  // outer planking
    const innerMat = wood(0x6e4a28, 3, THREE.DoubleSide); // darker cockpit interior
    const trim = flat(0x32220f, 0.7);
    const benchMat = wood(0xb08654, 2);
    const keelMat = flat(0x3a2814, 0.85);
    const rigMat = flat(0x4a3a28, 0.9);
    const metal = flat(0x55524a, 0.5);
    const sailMat = flat(0xf2ead6, 0.95, THREE.DoubleSide, false);
    const flagMat = flat(0xc0392b, 0.8, THREE.DoubleSide);

    // Outer hull + a separate, smaller, darker inner shell (the cockpit).
    part(g, skinHull(STATIONS), hullMat);
    part(g, skinHull(STATIONS, 0.78, 0.55, 0.12, true), innerMat);

    // Dark rubrail cap along each topside + transom cap (no painted stripe).
    part(g, G.box(0.10, 0.10, 3.1), trim, 0.71, 0.56, -0.2);
    part(g, G.box(0.10, 0.10, 3.1), trim, -0.71, 0.56, -0.2);
    part(g, G.box(1.15, 0.11, 0.12), trim, 0, 0.6, -1.98);

    // Keel + rudder + tiller.
    part(g, G.box(0.12, 0.26, 4.2), keelMat, 0, -0.3, 0.0);
    part(g, G.box(0.06, 0.7, 0.42), keelMat, 0, -0.15, -2.12);
    part(g, G.cylinder(0.04, 0.04, 1.0, 5), trim, 0, 0.62, -1.55, 0.5);

    // Bowsprit.
    part(g, G.cylinder(0.05, 0.06, 1.0, 5), rigMat, 0, 0.92, 3.15, Math.PI / 2 - 0.15);

    // Helm bench + forward thwart + ship's wheel.
    part(g, G.box(1.0, 0.09, 0.3), benchMat, 0, 0.4, -1.25);
    part(g, G.box(0.9, 0.09, 0.28), benchMat, 0, 0.4, 0.5);
    buildWheel(g, -0.85, 0.45, 0.34, metal, rigMat);

    // ── Rig ──────────────────────────────────────────────────────────────────
    const mastZ = 0.5;
    const mastTop = 3.5;
    const boomY = 1.05;
    part(g, G.cylinder(0.06, 0.09, mastTop, 6), rigMat, 0, mastTop / 2, mastZ);

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

    // Jib: luff runs along the forestay (bowsprit tip → high on the mast), so the
    // head meets the mast/forestay line instead of floating short.
    const jib = part(g, billowedTriangle(
      new THREE.Vector3(0, 0.95, 3.5),   // tack at the bowsprit tip
      new THREE.Vector3(0, mastTop - 0.25, mastZ + 0.05), // head high on the mast/forestay
      new THREE.Vector3(0, 1.05, 1.45),  // clew aft-low
      0.3,
    ), sailMat);
    jib.name = 'jib';

    // Standing rigging.
    const headPt = new THREE.Vector3(0, mastTop, mastZ);
    rope(g, headPt, new THREE.Vector3(0, 0.95, 3.5), rigMat);  // forestay → bowsprit
    rope(g, headPt, new THREE.Vector3(0, 0.7, -1.9), rigMat);  // backstay
    rope(g, headPt, new THREE.Vector3(0.72, 0.55, mastZ), rigMat);
    rope(g, headPt, new THREE.Vector3(-0.72, 0.55, mastZ), rigMat);

    // Masthead pennant.
    part(g, G.box(0.02, 0.22, 0.5), flagMat, 0, mastTop - 0.2, mastZ + 0.3);

    return g;
  }
}

registerMesh(Boat);
