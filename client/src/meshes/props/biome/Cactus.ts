import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class Cactus extends Mesh {
  static readonly type = 'biome_prop_cactus';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const cactus = m(0x2a6a1a, 0.82);
    const bloom = m(0xff4466, 0.72, 0, 0xee2244, 0.6);
    solid(g, G.cylinder(0.2 * s, 0.25 * s, 2.5 * s, 7), cactus, 0, 1.25 * s);
    solid(g, G.cylinder(0.13 * s, 0.16 * s, s, 6), cactus, 0.42 * s, 0.8 * s, 0, 0, 0, Math.PI / 2.3);
    solid(g, G.cylinder(0.13 * s, 0.16 * s, s, 6), cactus, -0.38 * s, 1.1 * s, 0, 0, 0, -Math.PI / 2.2);
    deco(g, G.sphere(0.15 * s, 6, 6), bloom, 0, 2.65 * s);
    return g;
  }
}

registerMesh(Cactus);
