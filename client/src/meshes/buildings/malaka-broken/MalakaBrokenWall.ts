import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createArrowSlit } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenWall extends Mesh {
  static readonly type = 'malaka_broken_wall';
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
    g.add(wall);

    const wallProxy = boxCollider(wallW, wallH, wallT);
    wallProxy.position.y = wallH / 2;
    g.add(wallProxy);


    // Arrow Slits in the wall
    for (let x = -3 * scale; x <= 3 * scale; x += 3 * scale) {
      const slit = createArrowSlit(1.2 * scale, scale);
      slit.position.set(x, wallH * 0.5, wallT / 2 + 0.05 * scale);
      g.add(slit);
    }

    // Walkway. Rest it ON TOP of the wall (bottom flush with the wall top) rather
    // than sunk into it: with the previous y the walkway's top face sat exactly at
    // y=wallH, coplanar with the wall box's top face, and the two coincident faces
    // z-fought across the walkway. Raising it by half its thickness hides the wall
    // top inside the walkway box so only the walkway's top surface is visible.
    const walkH = 0.2 * scale;
    const walkW = wallW;
    const walkT = wallT - 0.8 * scale;
    const walk = new THREE.Mesh(new THREE.BoxGeometry(walkW, walkH, walkT), mats.stone);
    walk.position.y = wallH + walkH / 2;
    g.add(walk);

    // Crenellations
    const crenSize = 0.6 * scale;
    const crenH = 1.0 * scale;
    for (let x = -wallW / 2 + crenSize / 2; x <= wallW / 2; x += crenSize * 2) {
      const cren = new THREE.Mesh(new THREE.BoxGeometry(crenSize, crenH, 0.6 * scale), mats.stone);
      cren.position.set(x, wallH + crenH / 2, wallT / 2 - 0.3 * scale);
      g.add(cren);
    }

    // World-tile the stone so the masonry keeps a constant block size instead of
    // stretching across the wide wall faces.
    applyWorldTiling(g, mats.stone);

    return g;
  }
}

registerMesh(MalakaBrokenWall);
