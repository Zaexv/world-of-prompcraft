import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class MoonShrine extends Mesh {
  static readonly type = 'biome_moon_shrine';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const stone = m(0x7788aa, 0.78);
    const silver = m(0xaabbcc, 0.3, 0.5);
    const glow = m(0x8899ff, 0.1, 0, 0x4455cc, 1.3);
    // Circular platform
    solid(g, G.cylinder(2.4, 2.7, 0.35, 10), stone, 0, 0.17);
    // Four standing stones arranged in circle
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const px = Math.cos(a) * 1.8, pz = Math.sin(a) * 1.8;
      solid(g, G.box(0.45, 2.8 - (i % 2) * 0.6, 0.3), stone, px, 1.75, pz, 0, a);
    }
    // Lintel connecting two opposite stones
    solid(g, G.box(0.35, 0.35, 3.7), silver, 0, 2.95);
    // Glowing moon disc
    deco(g, G.cylinder(0.6, 0.6, 0.08, 12), glow, 0, 0.53);
    return g;
  }
}

registerMesh(MoonShrine);
