import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class SwampHut extends Mesh {
  static readonly type = 'biome_swamp_hut';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const darkWood = m(0x1c1208, 0.95);
    const thatch = m(0x2d3a1a, 0.92);
    const glow = m(0x44ff88, 0.05, 0, 0x22ee66, 1.8);
    // Four stilts
    const stilt = G.cylinder(0.1, 0.13, 2.8, 5);
    for (const [sx, sz] of [[-1.1, -0.9], [-1.1, 0.9], [1.1, -0.9], [1.1, 0.9]] as [number, number][])
      solid(g, stilt, darkWood, sx, 1.4, sz);
    // Floor & walls
    solid(g, G.box(2.6, 0.22, 1.9), darkWood, 0, 2.91);
    solid(g, G.box(2.6, 1.9, 0.18), darkWood, 0, 3.86, -0.86);
    solid(g, G.box(2.6, 1.9, 0.18), darkWood, 0, 3.86,  0.86);
    solid(g, G.box(0.18, 1.9, 1.9), darkWood, -1.21, 3.86);
    // Lean-to door cutout side (open)
    solid(g, G.box(0.18, 1.2, 1.9), darkWood, 1.21, 4.51);
    // Thatched cone roof
    solid(g, G.cone(1.8, 1.6, 5), thatch, 0, 5.6);
    // Glow orb inside — visible through cracks
    deco(g, G.sphere(0.22, 7, 7), glow, 0, 3.3);
    return g;
  }
}

registerMesh(SwampHut);
