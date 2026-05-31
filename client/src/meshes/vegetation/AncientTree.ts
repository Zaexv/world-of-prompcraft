import * as THREE from 'three';
import { applyBarkPBR, applyCanopyPBR } from '../../utils/PBRMaps';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';

interface TreeLayer { y: number; r: number; h: number; }

function buildTreeGroup(scale: number, segs: number, layers: TreeLayer[], castShadow: boolean): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.95 });
  applyBarkPBR(trunkMat);
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.85 });
  applyCanopyPBR(canopyMat);

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.8 * scale, 6 * scale, segs), trunkMat);
  trunk.position.y = 3 * scale;
  trunk.castShadow = castShadow;
  trunk.receiveShadow = true;
  trunk.userData.isCollider = true;
  g.add(trunk);

  for (const l of layers) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(l.r * scale, l.h * scale, segs), canopyMat);
    mesh.position.y = l.y * scale;
    mesh.castShadow = castShadow;
    mesh.receiveShadow = castShadow;
    mesh.userData.noCollision = true;
    g.add(mesh);
  }
  return g;
}

function buildTreeGroupFlat(scale: number, segs: number, layers: TreeLayer[]): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshBasicMaterial({ color: 0x3a2510 });
  const canopyMat = new THREE.MeshBasicMaterial({ color: 0x2a5a2a });

  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * scale, 0.8 * scale, 6 * scale, segs), trunkMat);
  trunk.position.y = 3 * scale;
  trunk.userData.isCollider = true;
  g.add(trunk);

  for (const l of layers) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(l.r * scale, l.h * scale, segs), canopyMat);
    mesh.position.y = l.y * scale;
    mesh.userData.noCollision = true;
    g.add(mesh);
  }
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

    const layers: TreeLayer[] = [
      { y: 7, r: 3.5, h: 3 },
      { y: 9, r: 2.5, h: 2.5 },
      { y: 11, r: 1.5, h: 2 },
    ];

    // Level 0: Full (0–120) — 8-seg, 3 canopy layers, PBR textures, shadows
    lod.addLevel(buildTreeGroup(scale, 8, layers, true), 0);
    // Level 1: Mid (120–240) — 6-seg, 2 layers, PBR textures, shadows
    lod.addLevel(buildTreeGroup(scale, 6, layers.slice(0, 2), true), 120);
    // Level 2: Low (240–400) — 5-seg, 1 layer, flat color (no texture sampling)
    lod.addLevel(buildTreeGroupFlat(scale, 5, layers.slice(0, 1)), 240);
    // Level 3: Silhouette (400+) — 4-seg, 1 layer, flat color
    lod.addLevel(buildTreeGroupFlat(scale, 4, layers.slice(0, 1)), 400);

    return lod;
  }
}

registerMesh(AncientTree);
