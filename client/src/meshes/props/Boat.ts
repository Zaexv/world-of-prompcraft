import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import * as G from '../../systems/worldbuilder/objects/geoCache';

/**
 * Boat — a small low-poly wooden sailboat the player boards on entering water.
 *
 * Built facing +Z (forward) with the waterline near y=0 so BoatSystem can sit it
 * on the surface. The hull is a hand-authored faceted BufferGeometry; the sail is
 * a curved (billowing) surface on a real mast + boom with fore/back stays. All
 * parts are noCollision (the boat is player-driven).
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
  g: THREE.Group, geo: THREE.BufferGeometry, m: THREE.MeshStandardMaterial,
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

/** A thin rope/spar between two points. */
function rope(g: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, m: THREE.MeshStandardMaterial, r = 0.025): void {
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
  const stations: Array<[number, number, number, number, number]> = [
    [-2.05, 0.42, 0.64, 0.08, 0.60], // squared stern (transom)
    [-1.10, 0.54, 0.78, -0.10, 0.60],
    [ 0.10, 0.56, 0.80, -0.14, 0.60], // beam (widest)
    [ 1.25, 0.40, 0.60, -0.04, 0.58],
    [ 2.10, 0.16, 0.34, 0.10, 0.62],
    [ 2.70, 0.02, 0.10, 0.34, 0.74], // raised pointed bow
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

/** A billowing sail: a plane bulged out of its surface (smooth-shaded). */
function sailGeometry(w: number, h: number, bulge: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(w, h, 8, 10);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / (w / 2); // -1..1 across width
    const v = p.getY(i) / (h / 2); // -1..1 up height
    const billow = Math.cos(u * Math.PI * 0.5) * Math.cos(v * Math.PI * 0.5);
    p.setZ(i, bulge * billow);
  }
  g.computeVertexNormals();
  return g;
}

export class Boat extends Mesh {
  static readonly type = 'boat_rowboat';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);

    const hullMat = mat(0x7a4f2b, 0.82, THREE.DoubleSide);
    const floorMat = mat(0x563c22, 0.9);
    const trim = mat(0x32220f, 0.7);
    const bench = mat(0x8a6038, 0.8);
    const rigMat = mat(0x4a3a28, 0.9);
    const sailMat = mat(0xf2ead6, 0.95, THREE.DoubleSide, false); // smooth billow
    const flagMat = mat(0xc0392b, 0.8, THREE.DoubleSide);

    // Hull + inner floorboards + gunwale trim.
    part(g, hullGeometry(), hullMat);
    part(g, G.box(0.9, 0.06, 3.7), floorMat, 0, 0.02, 0.05);
    part(g, G.box(0.10, 0.11, 4.0), trim, 0.72, 0.60, 0.0);
    part(g, G.box(0.10, 0.11, 4.0), trim, -0.72, 0.60, 0.0);
    part(g, G.box(1.35, 0.11, 0.12), trim, 0, 0.60, -2.02); // transom cap

    // Aft bench (the helm seat) + a forward thwart.
    part(g, G.box(1.2, 0.09, 0.3), bench, 0, 0.34, -1.3);
    part(g, G.box(1.1, 0.09, 0.28), bench, 0, 0.34, 0.6);

    // ── Rig: mast forward of centre, boom, billowing mainsail, stays, pennant ──
    const mastZ = 0.7;
    const mastTop = 3.5;
    part(g, G.cylinder(0.06, 0.09, mastTop, 6), rigMat, 0, mastTop / 2, mastZ);

    // Boom along the deck at the foot of the sail.
    part(g, G.cylinder(0.045, 0.045, 1.9, 5), rigMat, 0, 1.05, mastZ + 0.15, Math.PI / 2);

    // Mainsail: curved surface, foot on the boom, head near the mast top. Width
    // runs fore-aft (local Z after the yaw rotation), bulge faces +X (the wind).
    const sail = part(g, sailGeometry(1.8, 2.1, 0.42), sailMat, 0.04, 2.2, mastZ + 0.2, 0, Math.PI / 2);
    sail.castShadow = true;

    // Standing rigging: forestay to the bow, backstay to the stern, two shrouds.
    const head = new THREE.Vector3(0, mastTop, mastZ);
    rope(g, head, new THREE.Vector3(0, 0.7, 2.6), rigMat);   // forestay
    rope(g, head, new THREE.Vector3(0, 0.7, -1.9), rigMat);  // backstay
    rope(g, head, new THREE.Vector3(0.7, 0.6, mastZ), rigMat); // shroud R
    rope(g, head, new THREE.Vector3(-0.7, 0.6, mastZ), rigMat); // shroud L

    // Pennant at the masthead.
    part(g, G.box(0.02, 0.24, 0.5), flagMat, 0, mastTop - 0.2, mastZ + 0.32);

    return g;
  }
}

registerMesh(Boat);
