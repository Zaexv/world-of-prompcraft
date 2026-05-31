import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class Inn extends Mesh {
  static readonly type = 'biome_inn';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const plaster = m(0xd4b896, 0.88);
    const timber = m(0x5a3a1a, 0.88);
    const thatch = m(0x7a5a1a, 0.9);
    const lantern = m(0xffaa33, 0.05, 0, 0xff7700, 1.8);
    const stone = m(0x888880, 0.85);
    // Stone foundation
    solid(g, G.box(6.5, 0.4, 4.5), stone, 0, 0.2);
    // Walls
    solid(g, G.box(6.5, 3.8, 0.3), plaster, 0, 2.1, -2.1);
    solid(g, G.box(6.5, 3.8, 0.3), plaster, 0, 2.1,  2.1);
    solid(g, G.box(0.3, 3.8, 4.5), plaster, -3.1, 2.1);
    solid(g, G.box(0.3, 3.8, 4.5), plaster,  3.1, 2.1);
    // Timber cross-bracing (decorative, flat to wall)
    deco(g, G.box(6.3, 0.12, 0.1), timber, 0, 3.0, -2.05);
    deco(g, G.box(6.3, 0.12, 0.1), timber, 0, 1.5, -2.05);
    // Thatched gabled roof
    solid(g, G.box(6.9, 0.2, 4.9), thatch, 0, 4.1);
    solid(g, G.cylinder(0.1, 3.6, 2.0, 4), thatch, 0, 5.1, 0, 0, Math.PI / 4);
    // Chimney
    solid(g, G.box(0.75, 2.2, 0.75), stone, 1.8, 4.5, -1.6);
    // Lanterns flanking door
    deco(g, G.sphere(0.15, 7, 7), lantern, -0.7, 2.5, -2.1);
    deco(g, G.sphere(0.15, 7, 7), lantern,  0.7, 2.5, -2.1);
    return g;
  }
}

registerMesh(Inn);
