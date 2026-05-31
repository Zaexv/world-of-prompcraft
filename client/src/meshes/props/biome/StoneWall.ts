import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class StoneWall extends Mesh {
  static readonly type = 'biome_prop_stone_wall';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const stone = m(0x887766, 0.92);
    solid(g, G.box(2.5 * s, 0.85 * s, 0.42 * s), stone, 0, 0.42 * s);
    // Top stones
    for (let i = 0; i < 5; i++) {
      const h = (0.08 + (i % 2) * 0.12) * s;
      solid(g, G.box(0.42 * s, h, 0.38 * s), stone, (i - 2) * 0.46 * s, 0.88 * s + h / 2);
    }
    return g;
  }
}

registerMesh(StoneWall);
