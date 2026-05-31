import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class RottingLog extends Mesh {
  static readonly type = 'biome_prop_rotting_log';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const log = m(0x1a1208, 0.95);
    const cap = m(0x228833, 0.72, 0, 0x114422, 0.25);
    solid(g, G.cylinder(0.3 * s, 0.36 * s, 2.5 * s, 8), log, 0, 0.3 * s, 0, 0, 0, Math.PI / 2.1);
    for (let i = 0; i < 3; i++) {
      const bx = (-1 + i) * 0.6 * s;
      const h = 0.25 * s;
      deco(g, G.cylinder(0.06 * s, 0.08 * s, h, 6), m(0xd4c090, 0.82), bx, 0.5 * s);
      deco(g, G.sphere(0.22 * s, 7, 5, 0, Math.PI * 2, 0, Math.PI / 2), cap, bx, 0.5 * s + h);
    }
    return g;
  }
}

registerMesh(RottingLog);
