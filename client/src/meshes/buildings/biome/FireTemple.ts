import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class FireTemple extends Mesh {
  static readonly type = 'biome_fire_temple';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const dark = m(0x1a0800, 0.9);
    const stone = m(0x2a1510, 0.85);
    const lava = m(0xff7700, 0.05, 0, 0xff4400, 2.6);
    // 3-step pyramid
    const steps = [[3.0, 0.55, 0], [2.2, 0.55, 0.55], [1.4, 0.55, 1.1]] as const;
    steps.forEach(([r, h, y]) => solid(g, G.cylinder(r, r + 0.2, h, 8), dark, 0, y + h / 2));
    // Altar block
    solid(g, G.box(1.1, 0.6, 0.9), stone, 0, 1.95);
    // Lava chalice top
    deco(g, G.sphere(0.45, 8, 8, 0, Math.PI * 2, 0, Math.PI / 2), lava, 0, 2.58);
    // Four horn pillars
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const px = Math.cos(a) * 2.2, pz = Math.sin(a) * 2.2;
      solid(g, G.cylinder(0.14, 0.2, 3.0, 5), dark, px, 1.5, pz);
      deco(g, G.cone(0.14, 0.5, 5), lava, px, 3.25, pz);
    }
    return g;
  }
}

registerMesh(FireTemple);
