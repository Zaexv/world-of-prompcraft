import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { getMaterials, withLOD } from '../buildings/malaka-broken/MalakaBrokenKit';
import { cylinderCollider } from '../../systems/worldbuilder/colliderProxy';

export class MalakaCypressTree extends Mesh {
  static readonly type = 'malaka_cypress_tree';
  static readonly category = 'vegetation' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const trunkHeight = 3.5 * scale;
    const canopyR = 0.7 * scale;

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, trunkHeight, 7), mats.wood,
    );
    trunk.position.y = trunkHeight / 2;
    trunk.castShadow = true;
    g.add(trunk);

    // Canopy cluster
    const canopyMat = mats.foliage;
    for (let i = 0; i < 8; i++) {
      const r = canopyR * (0.6 + Math.random() * 0.4);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(r, 6, 6), canopyMat);
      leaf.position.set(
        (Math.random() - 0.5) * canopyR * 1.2,
        trunkHeight + (Math.random() - 0.3) * canopyR,
        (Math.random() - 0.5) * canopyR * 1.2,
      );
      leaf.scale.y = 1.5; // Stretch for cypress look
      leaf.castShadow = true;
      leaf.userData.noCollision = true;
      g.add(leaf);
    }

    // Trunk collider
    const tColl = cylinderCollider(0.2 * scale, trunkHeight, 6);
    tColl.position.set(0, trunkHeight / 2, 0);
    g.add(tColl);

    return withLOD(g);
  }
}

registerMesh(MalakaCypressTree);

