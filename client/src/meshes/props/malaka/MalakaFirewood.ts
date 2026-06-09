import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';

export class MalakaFirewood extends Mesh {
  static readonly type = 'malaka_firewood';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const logMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.9 });
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.8 * scale, 6),
          logMat,
        );
        log.rotation.x = Math.PI / 2;
        log.position.set(
          0,
          0.08 * scale + row * 0.16 * scale,
          col * 0.2 * scale - 0.3 * scale,
        );
        log.userData.noCollision = true;
        g.add(log);
      }
    }
    // Firewood collider
    const fwColl = boxCollider(0.2 * scale, 0.5 * scale, 1.0 * scale);
    fwColl.position.set(0, 0.25 * scale, 0);
    g.add(fwColl);

    return withLOD(g);
  }
}

registerMesh(MalakaFirewood);

