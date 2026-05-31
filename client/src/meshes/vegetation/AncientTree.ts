import * as THREE from 'three';
import { applyBarkPBR, applyCanopyPBR } from '../../utils/PBRMaps';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';

let _trunkMat: THREE.MeshStandardMaterial | null = null;
let _canopyMat: THREE.MeshStandardMaterial | null = null;

function getTrunkMat() {
  if (!_trunkMat) {
    _trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2411, roughness: 0.95 });
    applyBarkPBR(_trunkMat);
  }
  return _trunkMat;
}

function getCanopyMat() {
  if (!_canopyMat) {
    _canopyMat = new THREE.MeshStandardMaterial({ color: 0x234d2e, roughness: 0.85 });
    applyCanopyPBR(_canopyMat);
  }
  return _canopyMat;
}

function buildTreeGroup(scale: number, segs: number, castShadow: boolean): THREE.Group {
  const g = new THREE.Group();
  
  // Use the exact SAME PBR materials for all trees (near and far)
  // as mandated by the perf fixes on main branch.
  const trunkMat = getTrunkMat();
  const canopyMat = getCanopyMat();

  // Shape from main branch
  const trunkHeight = 5.8 * scale;
  const canopyHeight = 6.2 * scale;
  const canopyLift = trunkHeight * 0.55 + canopyHeight * 0.28;

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.34 * scale, 0.48 * scale, trunkHeight, segs),
    trunkMat
  );
  trunk.position.y = trunkHeight * 0.5;
  trunk.castShadow = castShadow;
  trunk.receiveShadow = true;
  trunk.userData.isCollider = true;
  g.add(trunk);

  const canopy = new THREE.Mesh(
    new THREE.ConeGeometry(2.9 * scale, canopyHeight, segs, 1),
    canopyMat
  );
  canopy.position.y = canopyLift;
  canopy.castShadow = castShadow;
  canopy.receiveShadow = castShadow;
  canopy.userData.noCollision = true;
  g.add(canopy);

  return g;
}

export class AncientTree extends Mesh {
  static readonly type = 'ancient_tree';
  static readonly category = 'vegetation' as const;
  static readonly aliases = ['ancient_tree_cluster', 'tree', 'pine'] as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);

    // Level 0: Full (0–120) — 8-seg, PBR textures, shadows
    lod.addLevel(buildTreeGroup(scale, 8, true), 0);
    // Level 1: Mid (120–240) — 6-seg, PBR textures, shadows
    lod.addLevel(buildTreeGroup(scale, 6, true), 120);
    // Level 2: Low (240–400) — 5-seg, PBR textures, NO shadows
    lod.addLevel(buildTreeGroup(scale, 5, false), 240);
    // Level 3: Silhouette (400+) — 4-seg, PBR textures, NO shadows
    lod.addLevel(buildTreeGroup(scale, 4, false), 400);

    return lod;
  }
}

registerMesh(AncientTree);
