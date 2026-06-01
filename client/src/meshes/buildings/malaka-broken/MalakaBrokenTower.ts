import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createArrowSlit, createMachicolations, withLOD } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenTower extends Mesh {
  static readonly type = 'malaka_broken_tower';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const width = 5 * scale;
    const height = 15 * scale;

    // 0. Stone Foundation
    const plinthH = 1.5 * scale;
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4 * scale, plinthH, width + 0.4 * scale), mats.stone);
    plinth.position.y = plinthH / 2 - 0.2 * scale;
    plinth.userData.noCollision = true;
    g.add(plinth);

    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), mats.stone);
    body.position.y = plinthH + height / 2 - 0.2 * scale;
    body.castShadow = true;
    body.userData.noCollision = true;
    g.add(body);
    
    const bodyProxy = boxCollider(width, height + plinthH, width);
    bodyProxy.position.y = (height + plinthH) / 2 - 0.2 * scale;
    g.add(bodyProxy);

    // High Arrow Slits
    const slitG = new THREE.Group();
    for (let y = 0; y < 3; y++) {
      const slit = createArrowSlit(2 * scale, scale);
      slit.position.set(0, height * (0.3 + y * 0.2), width / 2 + 0.05 * scale);
      slitG.add(slit);
    }
    slitG.position.y = plinthH - 0.2 * scale;
    slitG.userData.noCollision = true;
    slitG.traverse(c => { c.userData.noCollision = true; });
    g.add(slitG);

    // Top Machicolations
    const machic = createMachicolations(width, width, height, mats, scale);
    machic.position.y = plinthH - 0.2 * scale;
    machic.userData.noCollision = true;
    machic.traverse(c => { c.userData.noCollision = true; });
    g.add(machic);

    // Top Crenellations
    const crenSize = 0.5 * scale;
    const crenGeo = new THREE.BoxGeometry(crenSize, 0.8 * scale, crenSize);
    const crenY = plinthH + height + 0.2 * scale;
    const inset = width / 2 - 0.2 * scale;
    for (let t = -width / 2 + crenSize / 2; t <= width / 2; t += crenSize * 2) {
      for (const s of [inset, -inset]) {
        const cx = new THREE.Mesh(crenGeo, mats.stone); 
        cx.position.set(t, crenY, s);
        cx.userData.noCollision = true;
        g.add(cx);
        const cz = new THREE.Mesh(crenGeo, mats.stone); 
        cz.position.set(s, crenY, t);
        cz.userData.noCollision = true;
        g.add(cz);
      }
    }

    applyWorldTiling(g, mats.stone);

    return withLOD(g);
  }
}

registerMesh(MalakaBrokenTower);
