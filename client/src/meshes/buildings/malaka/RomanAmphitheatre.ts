import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials } from './MalakaKit';

export class RomanAmphitheatre extends Mesh {
  static readonly type = 'roman_amphitheatre';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    const innerR = 4.0 * scale;
    const orch = new THREE.Mesh(new THREE.CylinderGeometry(innerR, innerR, 0.3 * scale, 48, 1, false, Math.PI, Math.PI), mats.stone);
    orch.position.y = 0.15 * scale;
    orch.userData.isCollider = true;
    g.add(orch);
    return g;
  }
}

registerMesh(RomanAmphitheatre);
