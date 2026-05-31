import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class Forge extends Mesh {
  static readonly type = 'biome_forge';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const obs = m(0x1a1a28, 0.3, 0.6);
    const iron = m(0x333344, 0.5, 0.8);
    const lava = m(0xff6600, 0.05, 0, 0xff3300, 2.4);
    // Thick walls of a square building
    const wall = G.box(0.4, 3.2, 4.4);
    solid(g, wall, obs, -2.0, 1.6, 0);
    solid(g, wall, obs,  2.0, 1.6, 0);
    solid(g, G.box(4.4, 3.2, 0.4), obs, 0, 1.6, -2.0);
    // Floor
    solid(g, G.box(4.4, 0.3, 4.4), iron, 0, 0.15);
    // Chimney
    solid(g, G.cylinder(0.4, 0.5, 4.5, 8), iron, 1.2, 2.5, -1.5);
    deco(g, G.cylinder(0.45, 0.45, 0.2, 8), lava, 1.2, 4.85, -1.5);
    // Central lava pool — emissive disc
    deco(g, G.cylinder(0.9, 1.0, 0.2, 10), lava, 0, 0.4, 0.3);
    return g;
  }
}

registerMesh(Forge);
