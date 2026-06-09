import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from '../../buildings/malaka-broken/MalakaBrokenKit';
import { applyWorldTiling } from '../../buildings/worldTiled';

export class MalakaStoneWalkway extends Mesh {
  static readonly type = 'malaka_stone_walkway';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const width = 6 * scale;
    const depth = 5 * scale;
    const walkwayPad = 1.5 * scale;
    
    const walkway = new THREE.Mesh(
      new THREE.BoxGeometry(width + walkwayPad * 2, 0.08 * scale, depth + walkwayPad * 2),
      mats.stone,
    );
    walkway.position.set(0, 0.04 * scale, 0);
    walkway.receiveShadow = true;
    walkway.userData.noCollision = true;
    g.add(walkway);

    applyWorldTiling(g, mats.stone);

    return withLOD(g);
  }
}

registerMesh(MalakaStoneWalkway);

