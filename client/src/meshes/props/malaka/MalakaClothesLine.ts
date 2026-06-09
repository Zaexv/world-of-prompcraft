import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';

export class MalakaClothesLine extends Mesh {
  static readonly type = 'malaka_clothesline';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const lineY = 2.2 * scale;
    const ropeLen = 3.0 * scale;
    const lineZ1 = -ropeLen / 2;
    const lineZ2 = ropeLen / 2;
    const poleMat = mats.wood;
    
    for (const pz of [lineZ1, lineZ2]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04 * scale, 0.05 * scale, lineY, 6), poleMat,
      );
      pole.position.set(0, lineY / 2, pz);
      pole.castShadow = true;
      pole.userData.noCollision = true;
      g.add(pole);
    }
    
    // Rope between poles
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0x8b7d6b, roughness: 1 });
    const rope = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015 * scale, 0.015 * scale, ropeLen, 4), ropeMat,
    );
    rope.rotation.x = Math.PI / 2;
    rope.position.set(0, lineY, 0);
    rope.userData.noCollision = true;
    g.add(rope);
    
    // Hanging cloth pieces
    const clothColors = [0xf5f5dc, 0xb0c4de, 0xffdab9];
    for (let i = 0; i < 3; i++) {
      const clothMat = new THREE.MeshStandardMaterial({
        color: clothColors[i], roughness: 0.9, side: THREE.DoubleSide,
      });
      const cloth = new THREE.Mesh(
        new THREE.PlaneGeometry(0.6 * scale, 0.8 * scale), clothMat,
      );
      cloth.position.set(
        0,
        lineY - 0.45 * scale,
        lineZ1 + (i + 0.5) * (ropeLen / 3) * -1,
      );
      cloth.rotation.y = Math.PI / 6 * (i - 1);
      cloth.userData.noCollision = true;
      g.add(cloth);
    }

    return withLOD(g);
  }
}

registerMesh(MalakaClothesLine);

