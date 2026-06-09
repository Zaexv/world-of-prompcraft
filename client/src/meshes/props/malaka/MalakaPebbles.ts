import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';

export class MalakaPebbles extends Mesh {
  static readonly type = 'malaka_pebbles';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const pebbleMat = new THREE.MeshStandardMaterial({ color: 0x9e9078, roughness: 1.0 });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const dist = Math.random() * 0.5 * scale;
      const pebble = new THREE.Mesh(
        new THREE.SphereGeometry((0.08 + Math.random() * 0.12) * scale, 4, 3),
        pebbleMat,
      );
      pebble.position.set(
        Math.cos(angle) * dist,
        0.04 * scale,
        Math.sin(angle) * dist,
      );
      pebble.scale.y = 0.4;
      pebble.userData.noCollision = true;
      g.add(pebble);
    }

    return withLOD(g);
  }
}

registerMesh(MalakaPebbles);

