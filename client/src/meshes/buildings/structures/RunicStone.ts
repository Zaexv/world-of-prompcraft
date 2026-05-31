import * as THREE from 'three';
import { applyStonePBR } from '../../../utils/PBRMaps';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class RunicStone extends Mesh {
  static readonly type = 'runic_stone';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.88 });
    applyStonePBR(stoneMat);
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x88ffcc,
      emissive: new THREE.Color(0x00ffaa),
      emissiveIntensity: 0.7,
    });

    const geo = new THREE.BoxGeometry(0.8 * scale, 2.5 * scale, 0.35 * scale);
    const stone = new THREE.Mesh(geo, stoneMat);
    stone.position.y = 1.25 * scale;
    stone.rotation.y = (Math.random() - 0.5) * 0.3;
    stone.castShadow = true;
    stone.receiveShadow = true;
    stone.userData.isCollider = true;
    g.add(stone);

    const runeGeo = new THREE.BoxGeometry(0.5 * scale, 1.5 * scale, 0.05 * scale);
    const runeFace = new THREE.Mesh(runeGeo, runeMat);
    runeFace.position.set(0, 1.25 * scale, 0.18 * scale);
    runeFace.rotation.y = stone.rotation.y;
    runeFace.userData.noCollision = true;
    g.add(runeFace);

    return g;
  }
}

registerMesh(RunicStone);
