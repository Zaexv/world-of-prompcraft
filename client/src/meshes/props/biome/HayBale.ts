import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class HayBale extends Mesh {
  static readonly type = 'biome_prop_hay_bale';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const hay = m(0xd4aa44, 0.9);
    const twine = m(0x8a6a20, 0.95);
    solid(g, G.cylinder(0.7 * s, 0.7 * s, 1.2 * s, 11), hay, 0, 0.7 * s, 0, 0, 0, Math.PI / 2);
    for (const ty of [0.35, 0.85]) {
      deco(g, G.torus(0.72 * s, 0.04 * s, 5, 11), twine, 0, ty * s + 0.15, 0, Math.PI / 2);
    }
    return g;
  }
}

registerMesh(HayBale);
