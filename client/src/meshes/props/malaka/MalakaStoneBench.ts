import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';

export class MalakaStoneBench extends Mesh {
  static readonly type = 'malaka_stone_bench';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const sBenchSeat = new THREE.Mesh(
      new THREE.BoxGeometry(1.4 * scale, 0.12 * scale, 0.5 * scale), mats.stone,
    );
    sBenchSeat.position.set(0, 0.45 * scale, 0);
    sBenchSeat.castShadow = sBenchSeat.receiveShadow = true;
    sBenchSeat.userData.noCollision = true;
    g.add(sBenchSeat);
    
    for (const sx of [-0.55, 0.55]) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.15 * scale, 0.4 * scale, 0.5 * scale), mats.stone,
      );
      leg.position.set(sx * scale, 0.2 * scale, 0);
      leg.userData.noCollision = true;
      g.add(leg);
    }
    
    const sBenchColl = boxCollider(1.4 * scale, 0.6 * scale, 0.5 * scale);
    sBenchColl.position.set(0, 0.3 * scale, 0);
    g.add(sBenchColl);

    return withLOD(g);
  }
}

registerMesh(MalakaStoneBench);

