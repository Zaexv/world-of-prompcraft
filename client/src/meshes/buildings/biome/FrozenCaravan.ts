import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class FrozenCaravan extends Mesh {
  static readonly type = 'biome_frozen_caravan';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const wood = m(0x3a2510, 0.95);
    const frost = m(0xbbddee, 0.08, 0.2, 0x88bbcc, 0.2);
    const snow = m(0xeef5f5, 0.95);
    const wheel = m(0x2a1a08, 0.9);
    // Wagon body
    solid(g, G.box(3.2, 1.1, 1.8), wood, 0, 0.85);
    // Arched canvas cover
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const x = -1.4 + t * 2.8;
      const h = 0.8 * Math.sin(t * Math.PI);
      deco(g, G.cylinder(0.05, 0.05, 1.8, 5), wood, x, 1.5 + h, 0, Math.PI / 2);
    }
    deco(g, G.box(3.2, 0.06, 2.0), frost, 0, 2.15);
    // Wheels (buried in ice)
    const wg = G.torus(0.5, 0.09, 5, 10);
    for (const [wx, wz] of [[-1.2, -0.7], [-1.2, 0.7], [1.2, -0.7], [1.2, 0.7]] as [number, number][])
      solid(g, wg, wheel, wx, 0.5, wz, Math.PI / 2);
    // Snow drift on top
    deco(g, G.box(3.4, 0.35, 2.1), snow, 0, 2.4);
    return g;
  }
}

registerMesh(FrozenCaravan);
