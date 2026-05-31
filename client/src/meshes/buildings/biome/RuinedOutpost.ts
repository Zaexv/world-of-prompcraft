import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class RuinedOutpost extends Mesh {
  static readonly type = 'biome_ruined_outpost';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const mossy = m(0x4a5a3a, 0.95);
    const dark = m(0x2a3a2a, 0.95);
    // L-shaped partial wall
    solid(g, G.box(4.2, 2.8, 0.55), mossy, 0, 1.4, -2);
    solid(g, G.box(0.55, 2.2, 3.0), mossy, -1.9, 1.1, -0.5);
    // Crumbled section — shorter wall
    solid(g, G.box(2.0, 1.4, 0.5), dark, 1.1, 0.7, 1.5);
    // Fallen column
    solid(g, G.cylinder(0.28, 0.33, 3.0, 7), mossy, 0.4, 0.3, 0.8, 0, 0, Math.PI / 2.5);
    // Floor slabs
    solid(g, G.box(3.5, 0.15, 3.5), dark, 0, 0.07);
    return g;
  }
}

registerMesh(RuinedOutpost);
