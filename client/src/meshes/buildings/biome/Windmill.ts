import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class Windmill extends Mesh {
  static readonly type = 'biome_windmill';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const stone = m(0x887a68, 0.88);
    const wood = m(0x4a2e10, 0.9);
    const sail = m(0xd4c4a0, 0.88);
    // Tapered stone tower
    solid(g, G.cylinder(1.0, 1.5, 7, 10), stone, 0, 3.5);
    // Cone cap
    solid(g, G.cone(1.15, 1.8, 10), wood, 0, 7.9);
    // Door
    solid(g, G.box(0.7, 1.4, 0.2), stone, 0, 0.7, 1.52);
    // Sails — 4 boards
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const sx = Math.sin(a) * 2.2, sy = -Math.cos(a) * 2.2;
      deco(g, G.box(0.18, 2.8, 0.45), sail, sx, 7.5 + sy, 1.1, 0, 0, a);
    }
    return g;
  }
}

registerMesh(Windmill);
