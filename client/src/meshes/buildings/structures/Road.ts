import * as THREE from 'three';
import { applyStonePBR } from '../../../utils/PBRMaps';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class Road extends Mesh {
  static readonly type = 'road';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x999988, roughness: 1.0 });
    applyStonePBR(stoneMat);

    // A flat plane for the road. We raise it slightly (0.05) to avoid z-fighting with terrain.
    const roadGeo = new THREE.BoxGeometry(4 * scale, 0.1 * scale, 8 * scale);
    const road = new THREE.Mesh(roadGeo, stoneMat);
    road.position.y = 0.05 * scale;
    road.receiveShadow = true;
    road.userData.noCollision = true; // Roads shouldn't block walking
    g.add(road);

    return g;
  }
}

registerMesh(Road);
