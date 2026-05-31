import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class Pyramid extends Mesh {
  static readonly type = 'biome_pyramid';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const sand = m(0xc8904a, 0.88);
    const dark = m(0x1a0800, 0.85);
    const gold = m(0xffdd55, 0.12, 0.7, 0xddaa00, 0.8);
    // Main pyramid body
    solid(g, G.cone(4.5, 4.8, 4), sand, 0, 2.4, 0, 0, Math.PI / 4);
    // Entrance
    solid(g, G.box(1.1, 1.6, 0.4), dark, 0, 0.8, 3.18);
    // Decorative step bands
    for (let i = 1; i <= 3; i++) {
      const r = 4.5 - i * 1.05;
      const y = i * 1.12;
      deco(g, G.cylinder(r + 0.05, r + 0.05, 0.1, 4), sand, 0, y, 0, 0, Math.PI / 4);
    }
    // Golden capstone
    deco(g, G.octahedron(0.38), gold, 0, 5.15);
    return g;
  }
}

registerMesh(Pyramid);
