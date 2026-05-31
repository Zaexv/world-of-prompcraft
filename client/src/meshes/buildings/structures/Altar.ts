import * as THREE from 'three';
import { applyStonePBR } from '../../../utils/PBRMaps';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class Altar extends Mesh {
  static readonly type = 'altar';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.8 });
    applyStonePBR(stoneMat);
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x8844ff,
      emissive: new THREE.Color(0x6633ff),
      emissiveIntensity: 0.9,
    });

    const baseGeo = new THREE.BoxGeometry(2.5 * scale, 0.4 * scale, 1.5 * scale);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 1.0 * scale;
    base.castShadow = true;
    base.receiveShadow = true;
    base.userData.isCollider = true;
    g.add(base);

    const legGeo = new THREE.BoxGeometry(0.3 * scale, 1.0 * scale, 0.3 * scale);
    for (const [lx, lz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]] as [number, number][]) {
      const leg = new THREE.Mesh(legGeo, stoneMat);
      leg.position.set(lx * scale, 0.5 * scale, lz * scale);
      leg.castShadow = true;
      leg.userData.isCollider = true;
      g.add(leg);
    }

    const runeGeo = new THREE.SphereGeometry(0.25 * scale, 8, 8);
    const rune = new THREE.Mesh(runeGeo, runeMat);
    rune.position.y = 1.5 * scale;
    rune.userData.noCollision = true;
    g.add(rune);

    return g;
  }
}

registerMesh(Altar);
