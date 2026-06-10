import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import * as G from '../../systems/worldbuilder/objects/geoCache';

/**
 * Boat — a small wooden rowboat the player boards on entering water.
 *
 * Built at the origin facing +Z (forward), deck centred at y≈0 so BoatSystem can
 * place it at the water surface and seat the player on top. All parts are marked
 * noCollision: the boat is driven by the player, not collided with.
 */
const _mat = new Map<string, THREE.MeshStandardMaterial>();
function wood(hex: number, rough = 0.85): THREE.MeshStandardMaterial {
  const key = `${hex}|${rough}`;
  let m = _mat.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, flatShading: true });
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

export class Boat extends Mesh {
  static readonly type = 'boat_rowboat';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);

    const hull = wood(0x6b4a2a);
    const hullDark = wood(0x4a3219);
    const plank = wood(0x7d5a36);
    const trim = wood(0x3a2814);
    const sailMat = new THREE.MeshStandardMaterial({
      color: 0xeae2cf, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, flatShading: true,
    });

    // Hull: an 8-sided cylinder laid on its side (long axis along Z) and scaled
    // into a flattened, narrow hull. rx = 90° maps the cylinder's length to Z;
    // scale is in local space (x = width, y = length, z = height).
    const body = part(g, G.cylinder(0.95, 0.95, 3.4, 8), hull, 0, 0.0, 0, Math.PI / 2);
    body.scale.set(0.6, 1, 0.42);

    // Inner well (darker) so the boat reads as hollow.
    part(g, G.box(0.95, 0.3, 2.7), hullDark, 0, 0.12, 0);

    // Gunwale rails (top edge planks) down each side.
    part(g, G.box(0.12, 0.16, 3.1), plank, 0.52, 0.22, 0);
    part(g, G.box(0.12, 0.16, 3.1), plank, -0.52, 0.22, 0);

    // Pointed bow (front, +Z) and squared stern (back, -Z).
    part(g, G.cone(0.5, 1.0, 6), hull, 0, 0.0, 1.85, Math.PI / 2).scale.set(0.55, 1, 0.7);
    part(g, G.box(1.0, 0.5, 0.2), hull, 0, 0.05, -1.7);

    // Two thwarts (benches) across the boat.
    part(g, G.box(1.0, 0.08, 0.28), trim, 0, 0.2, 0.55);
    part(g, G.box(1.0, 0.08, 0.28), trim, 0, 0.2, -0.55);

    // Oars resting in the rowlocks, angled out over the water.
    const oar = (side: number): void => {
      const o = new THREE.Group();
      o.position.set(side * 0.5, 0.24, 0.1);
      o.rotation.z = side * 0.5;
      o.rotation.y = side * 0.25;
      part(o, G.cylinder(0.04, 0.04, 1.7, 5), trim, side * 0.55, 0, 0, 0, 0, Math.PI / 2);
      part(o, G.box(0.04, 0.32, 0.5), plank, side * 1.35, 0, 0); // blade
      g.add(o);
    };
    oar(1);
    oar(-1);

    // Short mast + a small triangular sail for flair.
    part(g, G.cylinder(0.05, 0.06, 2.4, 6), trim, 0, 1.2, 0.2);
    const sail = part(g, G.box(0.02, 1.4, 1.1), sailMat, 0.02, 1.25, 0.2);
    sail.rotation.y = Math.PI / 2;

    return g;
  }
}

registerMesh(Boat);
