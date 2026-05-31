import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class WitchTower extends Mesh {
  static readonly type = 'biome_witch_tower';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const darkWood = m(0x1a1208, 0.9);
    const wicker = m(0x3a2a10, 0.92);
    const wisp = m(0x88ffaa, 0.05, 0, 0x44ee88, 2.2);
    // Twisted trunk-like shaft (tapered octagonal)
    solid(g, G.cylinder(0.55, 1.0, 7.5, 7), darkWood, 0, 3.75);
    // Wicker platform
    solid(g, G.cylinder(1.7, 1.7, 0.25, 10), wicker, 0, 7.62);
    // Pointed cap
    solid(g, G.cone(1.8, 2.2, 7), darkWood, 0, 8.85);
    // Hanging cage lanterns
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      deco(g, G.box(0.22, 0.3, 0.22), wicker, Math.cos(a) * 1.4, 7.3, Math.sin(a) * 1.4);
      deco(g, G.sphere(0.1, 6, 6), wisp, Math.cos(a) * 1.4, 7.05, Math.sin(a) * 1.4);
    }
    return g;
  }
}

registerMesh(WitchTower);
