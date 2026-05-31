import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class FrozenStump extends Mesh {
  static readonly type = 'biome_prop_frozen_stump';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const bark = m(0x334455, 0.92);
    solid(g, G.cylinder(0.22 * s, 0.3 * s, 2.5 * s, 7), bark, 0, 1.25 * s);
    deco(g, G.sphere(0.85 * s, 7, 5), m(0xbbddee, 0.1, 0.15), 0, 2.7 * s);
    return g;
  }
}

registerMesh(FrozenStump);
