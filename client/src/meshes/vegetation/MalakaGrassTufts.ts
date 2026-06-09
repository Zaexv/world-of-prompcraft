import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { withLOD } from '../buildings/malaka-broken/MalakaBrokenKit';

export class MalakaGrassTufts extends Mesh {
  static readonly type = 'malaka_grass_tufts';
  static readonly category = 'vegetation' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const grassMat = new THREE.MeshStandardMaterial({
      color: 0x5a8a3c, roughness: 0.95, side: THREE.DoubleSide,
    });
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * 0.5 * scale;
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.12 * scale, 0.4 * scale, 4), grassMat,
      );
      tuft.position.set(
        Math.cos(angle) * dist,
        0.2 * scale,
        Math.sin(angle) * dist,
      );
      tuft.rotation.z = (Math.random() - 0.5) * 0.3;
      tuft.userData.noCollision = true;
      g.add(tuft);
    }

    return withLOD(g);
  }
}

registerMesh(MalakaGrassTufts);

