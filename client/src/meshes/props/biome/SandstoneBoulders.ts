import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class SandstoneBoulders extends Mesh {
  static readonly type = 'biome_prop_sandstone_boulders';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const sand = m(0xc8a050, 0.88);
    solid(g, G.dodecahedron(0.8 * s, 0), sand, 0, 0.65 * s);
    solid(g, G.dodecahedron(0.5 * s, 0), sand, 0.75 * s, 0.4 * s, 0.2 * s);
    return g;
  }
}

registerMesh(SandstoneBoulders);
