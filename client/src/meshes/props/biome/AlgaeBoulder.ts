import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class AlgaeBoulder extends Mesh {
  static readonly type = 'biome_prop_algae_boulder';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const algae = m(0x1a4a20, 0.9, 0, 0x0a2a10, 0.15);
    solid(g, G.sphere(0.7 * s, 8, 8), algae, 0, 0.55 * s);
    return g;
  }
}

registerMesh(AlgaeBoulder);
