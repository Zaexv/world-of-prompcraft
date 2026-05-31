import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { applyWoodPBR } from '../../../utils/PBRMaps';

export class Pavilion extends Mesh {
  static readonly type = 'pavilion';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
    applyWoodPBR(woodMat);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a0845, roughness: 0.7 });

    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as [number, number][]) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 4 * scale, 8),
        woodMat,
      );
      pillar.position.set(px * scale, 2 * scale, pz * scale);
      pillar.castShadow = true;
      pillar.userData.isCollider = true;
      g.add(pillar);
    }

    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5 * scale, 2 * scale, 4), roofMat);
    roof.position.y = 5 * scale;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    roof.userData.isCollider = true;
    g.add(roof);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(5 * scale, 0.1 * scale, 5 * scale), woodMat);
    floor.position.y = 0.05 * scale;
    floor.receiveShadow = true;
    floor.userData.isCollider = true;
    g.add(floor);

    return g;
  }
}

registerMesh(Pavilion);
