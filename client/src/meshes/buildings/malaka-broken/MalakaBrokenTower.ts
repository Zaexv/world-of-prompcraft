import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createArrowSlit, createMachicolations } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenTower extends Mesh {
  static readonly type = 'malaka_broken_tower';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const width = 5 * scale;
    const height = 15 * scale;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), mats.stone);
    body.position.y = height / 2;
    body.castShadow = true;
    g.add(body);
    
    const bodyProxy = boxCollider(width, height, width);
    bodyProxy.position.y = height / 2;
    g.add(bodyProxy);

    // High Arrow Slits
    for (let y = 0.3; y < 0.9; y += 0.2) {
      const slit = createArrowSlit(2 * scale, scale);
      slit.position.set(0, height * y, width / 2 + 0.05 * scale);
      g.add(slit);
    }

    // Top Machicolations
    g.add(createMachicolations(width, width, height, mats, scale));

    // Top Crenellations
    const crenSize = 0.5 * scale;
    for (let i = -width/2 + crenSize/2; i <= width/2; i += crenSize * 2) {
      const c1 = new THREE.Mesh(new THREE.BoxGeometry(crenSize, 0.8 * scale, crenSize), mats.stone);
      c1.position.set(i, height + 0.4 * scale, width / 2 - 0.2 * scale);
      g.add(c1);
    }

    // World-tile the stone so the masonry keeps a constant block size instead of
    // stretching across the tall tower faces.
    applyWorldTiling(g, mats.stone);

    return g;
  }
}

registerMesh(MalakaBrokenTower);
