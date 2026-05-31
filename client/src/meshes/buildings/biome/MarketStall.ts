import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class MarketStall extends Mesh {
  static readonly type = 'biome_market_stall';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const wood = m(0x5a3a1a, 0.9);
    const canvas = m(0xe8c87a, 0.88);
    const goods = m(0x8b4513, 0.9);
    const accent = m(0xcc6622, 0.8);
    // Four sturdy posts
    const post = G.cylinder(0.09, 0.12, 3.2, 6);
    for (const [px, pz] of [[-1.6, -1.1], [-1.6, 1.1], [1.6, -1.1], [1.6, 1.1]] as [number, number][])
      solid(g, post, wood, px, 1.6, pz);
    // Awning — slightly sloped
    deco(g, G.box(3.5, 0.12, 2.5), canvas, 0, 3.25, 0, 0.12, 0);
    // Fringe stripe
    deco(g, G.box(3.5, 0.18, 0.12), accent, 0, 3.1, -1.27);
    // Counter
    solid(g, G.box(3.0, 0.18, 0.7), wood, 0, 1.15, -0.8);
    solid(g, G.box(3.0, 0.9, 0.45), wood, 0, 0.57, -0.8);
    // Goods on counter (5 barrels/crates)
    const crate = G.box(0.38, 0.38, 0.38);
    for (let i = 0; i < 4; i++) {
      deco(g, crate, goods, -1.2 + i * 0.8, 1.44, -0.78);
    }
    return g;
  }
}

registerMesh(MarketStall);
