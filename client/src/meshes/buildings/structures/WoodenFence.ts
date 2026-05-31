import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { applyWoodPBR } from '../../../utils/PBRMaps';

export class WoodenFence extends Mesh {
  static readonly type = 'wooden_fence';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });
    applyWoodPBR(woodMat);

    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 1.5 * scale, 5),
        woodMat,
      );
      post.position.set((i * 1.2 - 1.2) * scale, 0.75 * scale, 0);
      post.castShadow = true;
      post.userData.isCollider = true;
      g.add(post);
    }

    const rail1 = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 * scale, 0.12 * scale, 0.1 * scale),
      woodMat,
    );
    rail1.position.y = 1.2 * scale;
    rail1.userData.isCollider = true;
    g.add(rail1);

    const rail2 = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 * scale, 0.12 * scale, 0.1 * scale),
      woodMat,
    );
    rail2.position.y = 0.6 * scale;
    rail2.userData.isCollider = true;
    g.add(rail2);

    return g;
  }
}

registerMesh(WoodenFence);
