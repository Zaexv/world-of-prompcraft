import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createArrowSlit, withLOD } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenWall extends Mesh {
  static readonly type = 'malaka_broken_wall';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    const wallW = 10 * scale;
    const wallH = 6 * scale;
    const wallT = 2.5 * scale;

    // 0. Stone Foundation
    const plinthH = 1.2 * scale;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(wallW + 0.4 * scale, plinthH, wallT + 0.4 * scale), mats.stone);
    plinth.position.y = plinthH / 2 - 0.2 * scale;
    g.add(plinth);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallT), mats.stone);
    wall.position.y = plinthH + wallH / 2 - 0.2 * scale;
    wall.castShadow = wall.receiveShadow = true;
    g.add(wall);

    const wallProxy = boxCollider(wallW, wallH + plinthH, wallT);
    wallProxy.position.y = (wallH + plinthH) / 2 - 0.2 * scale;
    g.add(wallProxy);


    // Arrow Slits in the wall
    for (let x = -3 * scale; x <= 3 * scale; x += 3 * scale) {
      const slit = createArrowSlit(1.2 * scale, scale);
      slit.position.set(x, plinthH + wallH * 0.5 - 0.2 * scale, wallT / 2 + 0.05 * scale);
      g.add(slit);
    }

    // Walkway
    const walkH = 0.2 * scale;
    const walkW = wallW;
    const walkT = wallT - 0.8 * scale;
    const walk = new THREE.Mesh(new THREE.BoxGeometry(walkW, walkH, walkT), mats.stone);
    walk.position.y = plinthH + wallH + walkH / 2 - 0.2 * scale;
    g.add(walk);

    // Crenellations
    const crenSize = 0.6 * scale;
    const crenH = 1.0 * scale;
    for (let x = -wallW / 2 + crenSize / 2; x <= wallW / 2; x += crenSize * 2) {
      const cren = new THREE.Mesh(new THREE.BoxGeometry(crenSize, crenH, 0.6 * scale), mats.stone);
      cren.position.set(x, plinthH + wallH + crenH / 2 - 0.2 * scale, wallT / 2 - 0.3 * scale);
      g.add(cren);
    }

    // World-tile the stone so the masonry keeps a constant block size instead of
    // stretching across the wide wall faces.
    applyWorldTiling(g, mats.stone);

    return withLOD(g);
  }
}

registerMesh(MalakaBrokenWall);
