import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import * as G from '../../systems/worldbuilder/objects/geoCache';

/**
 * Boat — a small low-poly wooden sailboat the player boards on entering water.
 *
 * The hull is a hand-authored BufferGeometry: a few cross-section "stations"
 * from a squared stern to a raised pointed bow, skinned into faceted faces.
 * flatShading gives the chunky low-poly look. Built facing +Z (forward) with the
 * waterline near y=0 so BoatSystem can sit it on the surface. All parts are
 * noCollision (the boat is player-driven, not collided with).
 */
const _mat = new Map<string, THREE.MeshStandardMaterial>();
function wood(hex: number, rough = 0.8, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const key = `${hex}|${rough}|${side}`;
  let m = _mat.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, flatShading: true, side });
    _mat.set(key, m);
  }
  return m;
}

function part(
  g: THREE.Group, geo: THREE.BufferGeometry, mat: THREE.MeshStandardMaterial,
  x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.userData.noCollision = true;
  g.add(mesh);
  return mesh;
}

/** Skinned hull from cross-section stations: [z, halfWidthBottom, halfWidthTop, bottomY, topY]. */
function hullGeometry(): THREE.BufferGeometry {
  const stations: Array<[number, number, number, number, number]> = [
    [-1.85, 0.46, 0.66, 0.05, 0.58], // squared stern
    [-0.70, 0.54, 0.74, -0.10, 0.58],
    [ 0.55, 0.50, 0.70, -0.08, 0.58],
    [ 1.45, 0.30, 0.48, 0.04, 0.56],
    [ 2.15, 0.02, 0.12, 0.26, 0.66], // raised pointed bow
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

export class Boat extends Mesh {
  static readonly type = 'boat_rowboat';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);

    const hullMat = wood(0x7a4f2b, 0.82, THREE.DoubleSide); // double-sided: see inside
    const floorMat = wood(0x4f3a22, 0.9);
    const trim = wood(0x32220f, 0.7);
    const bench = wood(0x8a6038, 0.8);
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xefe7d2, roughness: 0.95, metalness: 0, side: THREE.DoubleSide, flatShading: true,
    });
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xc0392b, roughness: 0.8, side: THREE.DoubleSide, flatShading: true,
    });

    // Hull (single faceted mesh).
    part(g, hullGeometry(), hullMat);

    // Interior floorboards just above the keel so the inside doesn't look hollow.
    part(g, G.box(0.85, 0.06, 3.1), floorMat, 0, 0.02, 0.0);

    // Gunwale trim caps along both top rails (dark contrast stripe).
    part(g, G.box(0.10, 0.10, 3.2), trim, 0.66, 0.58, -0.05);
    part(g, G.box(0.10, 0.10, 3.2), trim, -0.66, 0.58, -0.05);
    // Stern cap rail.
    part(g, G.box(1.3, 0.10, 0.12), trim, 0, 0.58, -1.82);

    // Two thwarts (benches) across the boat.
    part(g, G.box(1.15, 0.08, 0.26), bench, 0, 0.34, 0.5);
    part(g, G.box(1.15, 0.08, 0.26), bench, 0, 0.34, -0.7);

    // Oars resting in the rowlocks, angled out over the water.
    const oar = (side: number): void => {
      const o = new THREE.Group();
      o.position.set(side * 0.6, 0.42, -0.1);
      o.rotation.z = side * 0.55;
      o.rotation.y = side * 0.22;
      part(o, G.cylinder(0.035, 0.05, 1.8, 5), trim, side * 0.6, 0, 0, 0, 0, Math.PI / 2);
      part(o, G.box(0.04, 0.34, 0.52), bench, side * 1.45, 0, 0); // blade
      g.add(o);
    };
    oar(1);
    oar(-1);

    // Mast slightly forward of centre, a billowing sail, and a red pennant.
    part(g, G.cylinder(0.05, 0.07, 2.6, 6), trim, 0, 1.3, 0.25);
    const sail = part(g, G.box(0.04, 1.5, 1.25), sailMat, 0.02, 1.32, 0.25);
    sail.rotation.y = Math.PI / 2;
    sail.scale.z = 1; // (kept explicit for easy tuning)
    // Curve the sail a touch by skewing — cheap "wind" lean.
    sail.rotation.x = 0.05;
    part(g, G.box(0.02, 0.22, 0.5), flagMat, 0.0, 2.5, 0.55);

    return g;
  }
}

registerMesh(Boat);
