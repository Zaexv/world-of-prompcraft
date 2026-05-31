import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class GlowingStump extends Mesh {
  static readonly type = 'biome_prop_glowing_stump';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const bark = m(0x3a2510, 0.95);
    const glow = m(0x88aaff, 0.1, 0, 0x5577dd, 0.9);
    solid(g, G.cylinder(0.55 * s, 0.72 * s, 1.0 * s, 9), bark, 0, 0.5 * s);
    deco(g, G.cylinder(0.3 * s, 0.3 * s, 0.1 * s, 9), glow, 0, 1.1 * s);
    return g;
  }
}

registerMesh(GlowingStump);
