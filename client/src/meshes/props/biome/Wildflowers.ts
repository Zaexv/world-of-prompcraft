import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class Wildflowers extends Mesh {
  static readonly type = 'biome_prop_wildflowers';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const stem = m(0x3a6a20, 0.9);
    const f1 = m(0xff6644, 0.72, 0, 0xee4422, 0.18);
    const f2 = m(0xeecc22, 0.72, 0, 0xddaa00, 0.12);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2, r = (0.1 + Math.random() * 0.55) * s;
      const h = (0.3 + Math.random() * 0.4) * s;
      const px = Math.cos(a) * r, pz = Math.sin(a) * r;
      deco(g, G.cylinder(0.03 * s, 0.04 * s, h, 4), stem, px, h / 2, pz);
      deco(g, G.sphere(0.1 * s, 6, 5), i % 2 ? f1 : f2, px, h, pz);
    }
    return g;
  }
}

registerMesh(Wildflowers);
