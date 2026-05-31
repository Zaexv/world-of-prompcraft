import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createArrowSlit } from './MalakaKit';

export class MalakaWall extends Mesh {
  static readonly type = 'malaka_wall';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    const wallW = 10 * scale;
    const wallH = 6 * scale;
    const wallT = 2.5 * scale;

    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallT), mats.stone);
    wall.position.y = wallH / 2;
    wall.castShadow = wall.receiveShadow = true;
    wall.userData.isCollider = true;
    g.add(wall);

    // Arrow Slits in the wall
    for (let x = -3 * scale; x <= 3 * scale; x += 3 * scale) {
      const slit = createArrowSlit(1.2 * scale, scale);
      slit.position.set(x, wallH * 0.5, wallT / 2 + 0.05 * scale);
      g.add(slit);
    }

    // Walkway
    const walkW = wallW;
    const walkT = wallT - 0.8 * scale;
    const walk = new THREE.Mesh(new THREE.BoxGeometry(walkW, 0.2 * scale, walkT), mats.stone);
    walk.position.y = wallH - 0.1 * scale;
    g.add(walk);

    // Crenellations
    const crenSize = 0.6 * scale;
    const crenH = 1.0 * scale;
    for (let x = -wallW / 2 + crenSize / 2; x <= wallW / 2; x += crenSize * 2) {
      const cren = new THREE.Mesh(new THREE.BoxGeometry(crenSize, crenH, 0.6 * scale), mats.stone);
      cren.position.set(x, wallH + crenH / 2, wallT / 2 - 0.3 * scale);
      g.add(cren);
    }

    return g;
  }
}

registerMesh(MalakaWall);
