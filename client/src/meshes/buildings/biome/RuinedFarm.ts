import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class RuinedFarm extends Mesh {
  static readonly type = 'biome_ruined_farm';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const rng = ctx.rng;
    const stone = m(0x7a6a5a, 0.92);
    const moss = m(0x3a5a28, 0.95);
    // L-shaped partial walls
    solid(g, G.box(5.0, 2.4, 0.5), stone, 0, 1.2, -2.2);
    solid(g, G.box(0.5, 3.0, 4.0), stone, -2.2, 1.5, -0.2);
    solid(g, G.box(2.5, 1.4, 0.45), stone, 0.8, 0.7, 2.2);
    // Fallen wall segment
    solid(g, G.box(2.0, 0.5, 0.45), stone, -0.2, 0.25, 2.2, Math.PI / 12);
    // Moss overgrowth on floor — raised 0.07 so bottom face (0.01) clears terrain
    solid(g, G.box(4.5, 0.12, 4.5), moss, 0, 0.07);
    // Collapsed chimney pile
    for (let i = 0; i < 3; i++) {
      const rx = (rng?.next() ?? Math.random()) - 0.5;
      const rz = (rng?.next() ?? Math.random()) - 0.5;
      solid(g, G.box(0.55, 0.35, 0.55), stone, 1.8 + rx * 0.3, 0.17 + i * 0.35, -1.5 + rz * 0.3);
    }
    return g;
  }
}

registerMesh(RuinedFarm);
