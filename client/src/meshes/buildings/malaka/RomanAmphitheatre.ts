import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials } from './MalakaKit';
import { cylinderCollider } from '../../../systems/worldbuilder/colliderProxy';

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
    g.add(orch);

    // The orchestra floor renders as a half-disc; the collider is a clean full
    // low cylinder so the capsule never snags on the open arc edges.
    const orchProxy = cylinderCollider(innerR, 0.3 * scale);
    orchProxy.position.y = 0.15 * scale;
    g.add(orchProxy);
    return g;
  }
}

registerMesh(RomanAmphitheatre);
