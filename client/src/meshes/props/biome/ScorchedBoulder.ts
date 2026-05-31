import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class ScorchedBoulder extends Mesh {
  static readonly type = 'biome_prop_scorched_boulder';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const scorch = m(0x221100, 0.88);
    solid(g, G.dodecahedron(0.7 * s, 0), scorch, 0, 0.6 * s);
    return g;
  }
}

registerMesh(ScorchedBoulder);
