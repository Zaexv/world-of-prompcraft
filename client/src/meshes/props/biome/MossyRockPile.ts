import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class MossyRockPile extends Mesh {
  static readonly type = 'biome_prop_mossy_rock_pile';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const rock = m(0x556644, 0.9);
    solid(g, G.dodecahedron(0.65 * s, 0), rock, 0, 0.5 * s);
    solid(g, G.dodecahedron(0.4 * s, 0), rock, 0.5 * s, 0.3 * s, -0.2 * s);
    return g;
  }
}

registerMesh(MossyRockPile);
