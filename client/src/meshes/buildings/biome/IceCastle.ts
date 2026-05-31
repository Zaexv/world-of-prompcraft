import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class IceCastle extends Mesh {
  static readonly type = 'biome_ice_castle';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const ice = m(0x88bbdd, 0.07, 0.35, 0x55aacc, 0.25);
    const snow = m(0xddeeff, 0.95);
    const dark = m(0x334455, 0.85);
    // Main keep — thick walls
    solid(g, G.cylinder(1.6, 2.0, 5.5, 8), ice, 0, 2.75);
    // Battlements
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) {
        const a = (i / 8) * Math.PI * 2;
        solid(g, G.box(0.5, 0.9, 0.5), dark, Math.cos(a) * 1.55, 5.95, Math.sin(a) * 1.55);
      }
    }
    // Conical roof
    solid(g, G.cone(1.75, 2.5, 8), ice, 0, 7.45);
    // Snow cap
    deco(g, G.sphere(1.8, 8, 5, 0, Math.PI * 2, 0, Math.PI / 3), snow, 0, 5.5);
    // Side tower (shorter)
    solid(g, G.cylinder(0.75, 0.95, 4, 6), dark, 2.2, 2, 0);
    solid(g, G.cone(0.85, 1.5, 6), ice, 2.2, 4.75);
    return g;
  }
}

registerMesh(IceCastle);
