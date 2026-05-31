import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from './MalakaBrokenKit';
import { cylinderCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

// applyWorldTiling tiles a CylinderGeometry by circumference (U) × height (V) —
// right for a tall side wall, but it smears that same scaling onto the flat
// top/bottom CAPS. On a tall tower the caps are hidden, but the amphitheatre is
// basically flat discs (height ≤ 0.5, radius 4), so the visible orchestra floor
// is a cap and reads as stretched streaks. After tiling, re-map the cap UVs
// (vertices whose normal points up/down) to WORLD XZ at the same density as the
// walls, so the masonry keeps a constant block size on the floor.
const UNITS_PER_TILE = 2.2; // matches applyWorldTiling's default

function worldTileCylinderCaps(mesh: THREE.Mesh): void {
  const geo = mesh.geometry;
  const posA = geo.attributes.position as THREE.BufferAttribute;
  const norA = geo.attributes.normal as THREE.BufferAttribute | undefined;
  const uvA = geo.attributes.uv as THREE.BufferAttribute | undefined;
  if (!norA || !uvA) return;
  for (let i = 0; i < posA.count; i++) {
    if (Math.abs(norA.getY(i)) > 0.9) {
      // Cap vertex — drive UV from world floor coords, not circumference×height.
      uvA.setXY(i, posA.getX(i) / UNITS_PER_TILE, posA.getZ(i) / UNITS_PER_TILE);
    }
  }
  uvA.needsUpdate = true;
}

export class MalakaBrokenRomanAmphitheatre extends Mesh {
  static readonly type = 'malaka_broken_roman_amphitheatre';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // 0. Foundation Plinth
    const innerR = 4.0 * scale;
    const plinthH = 0.5 * scale;
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(innerR + 0.2 * scale, innerR + 0.2 * scale, plinthH, 48), mats.stone);
    plinth.position.y = plinthH / 2 - 0.1 * scale;
    g.add(plinth);

    const orch = new THREE.Mesh(new THREE.CylinderGeometry(innerR, innerR, 0.3 * scale, 48, 1, false, Math.PI, Math.PI), mats.stone);
    orch.position.y = plinthH + 0.15 * scale - 0.1 * scale;
    g.add(orch);

    // The orchestra floor renders as a half-disc; the collider is a clean full
    // low cylinder so the capsule never snags on the open arc edges.
    const orchProxy = cylinderCollider(innerR, 0.3 * scale + plinthH);
    orchProxy.position.y = (0.3 * scale + plinthH) / 2 - 0.1 * scale;
    g.add(orchProxy);

    applyWorldTiling(g, mats.stone);
    // Fix the stretched cap UVs left by the cylinder tiling (see note above).
    worldTileCylinderCaps(plinth);
    worldTileCylinderCaps(orch);
    return withLOD(g);
  }
}

registerMesh(MalakaBrokenRomanAmphitheatre);
