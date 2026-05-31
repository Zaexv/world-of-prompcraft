import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class Signpost extends Mesh {
  static readonly type = 'biome_prop_signpost';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const wood = m(0x5a3a1a, 0.9);
    solid(g, G.cylinder(0.08 * s, 0.1 * s, 2.0 * s, 6), wood, 0, s);
    solid(g, G.box(1.1 * s, 0.45 * s, 0.12 * s), wood, 0.2 * s, 1.75 * s, 0, 0, 0.15);
    solid(g, G.box(0.9 * s, 0.38 * s, 0.12 * s), wood, -0.1 * s, 1.3 * s, 0, 0, -0.1);
    return g;
  }
}

registerMesh(Signpost);
