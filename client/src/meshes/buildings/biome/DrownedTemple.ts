import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class DrownedTemple extends Mesh {
  static readonly type = 'biome_drowned_temple';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const mossy = m(0x2d4a20, 0.95);
    const stone = m(0x3d4a45, 0.88);
    const algae = m(0x1a5a28, 0.7, 0, 0x0a3318, 0.2);
    // Sunken base (half below ground)
    solid(g, G.box(5.5, 1.8, 5.5), mossy, 0, -0.6);
    solid(g, G.box(4.5, 1.0, 4.5), stone, 0, 0.4);
    // Columns, some tilted by sinking
    const tilts = [0, 0.14, 0, -0.1, 0.06, 0, 0, -0.12] as const;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const h = i % 3 === 0 ? 1.4 : 3.2;
      solid(g, G.cylinder(0.27, 0.32, h, 7), stone,
        Math.cos(a) * 2.0, 1.0 + h / 2, Math.sin(a) * 2.0, tilts[i] ?? 0);
    }
    // Algae patches on floor
    for (let i = 0; i < 4; i++) {
      const ax = (i % 2 - 0.5) * 2, az = (Math.floor(i / 2) - 0.5) * 2;
      deco(g, G.cylinder(0.5, 0.65, 0.07, 8), algae, ax, 1.08, az);
    }
    return g;
  }
}

registerMesh(DrownedTemple);
