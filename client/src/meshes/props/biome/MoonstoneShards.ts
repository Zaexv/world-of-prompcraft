import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class MoonstoneShards extends Mesh {
  static readonly type = 'biome_prop_moonstone_shards';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const crystal = m(0x8899dd, 0.2, 0.4, 0x5566bb, 0.5);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2, h = (0.8 + i * 0.3) * s;
      deco(g, G.cone(0.18 * s, h, 5), crystal, Math.cos(a) * 0.35 * s, h / 2, Math.sin(a) * 0.35 * s);
    }
    solid(g, G.cylinder(0.5 * s, 0.6 * s, 0.2 * s, 8), m(0x6677aa, 0.78), 0, 0.1 * s);
    return g;
  }
}

registerMesh(MoonstoneShards);
