import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class Obelisk extends Mesh {
  static readonly type = 'biome_obelisk';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const sand = m(0xbb8840, 0.88);
    const gold = m(0xffee55, 0.12, 0.7, 0xddcc00, 0.9);
    // Two obelisks — one intact, one cracked
    for (const [ox, h] of [[-2.6, 7.5], [2.4, 5.0]] as [number, number][]) {
      solid(g, G.box(0.95, h, 0.95), sand, ox, h / 2);
      solid(g, G.box(1.2, 0.45, 1.2), sand, ox, 0.22);
      deco(g, G.cone(0.5, 0.9, 4), gold, ox, h + 0.45, 0, 0, Math.PI / 4);
    }
    // Linking pedestal
    solid(g, G.box(5.5, 0.3, 1.0), sand, 0, 0.15);
    // Cracked chunk on ground
    solid(g, G.box(1.0, 0.7, 0.95), sand, 3.4, 0.35, 0.4, 0.3);
    return g;
  }
}

registerMesh(Obelisk);
