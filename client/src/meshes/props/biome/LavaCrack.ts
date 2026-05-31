import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class LavaCrack extends Mesh {
  static readonly type = 'biome_prop_lava_crack';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const basalt = m(0x1a0800, 0.92);
    const lava = m(0xff5500, 0.04, 0, 0xff2200, 3.0);
    solid(g, G.box(2.4 * s, 0.28, 0.4 * s), basalt, 0, 0.14);
    deco(g, G.box(2.0 * s, 0.08, 0.24 * s), lava, 0, 0.08);
    return g;
  }
}

registerMesh(LavaCrack);
