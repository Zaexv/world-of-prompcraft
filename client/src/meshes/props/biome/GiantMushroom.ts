import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class GiantMushroom extends Mesh {
  static readonly type = 'biome_prop_giant_mushroom';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const stem = m(0xc8b090, 0.82);
    const cap = m(0x7733bb, 0.62, 0, 0x551199, 0.7);
    solid(g, G.cylinder(0.22 * s, 0.3 * s, 2.0 * s, 7), stem, 0, s);
    deco(g, G.sphere(0.9 * s, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 2.1 * s);
    return g;
  }
}

registerMesh(GiantMushroom);
