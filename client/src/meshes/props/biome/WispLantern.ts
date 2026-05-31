import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class WispLantern extends Mesh {
  static readonly type = 'biome_prop_wisp_lantern';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const wood = m(0x1a0f08, 0.95);
    const wisp = m(0x88ffaa, 0.04, 0, 0x44ee88, 3.0);
    solid(g, G.cylinder(0.07 * s, 0.1 * s, 2.2 * s, 6), wood, 0, 1.1 * s);
    deco(g, G.octahedron(0.22 * s), wisp, 0, 2.4 * s);
    return g;
  }
}

registerMesh(WispLantern);
