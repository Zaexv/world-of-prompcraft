import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class ObsidianSpire extends Mesh {
  static readonly type = 'biome_obsidian_spire';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const obs = m(0x161625, 0.2, 0.65);
    const lava = m(0xff5500, 0.05, 0, 0xff2200, 2.8);
    const dark = m(0x222233, 0.4, 0.5);
    // Main spire — tall hexagonal shaft
    solid(g, G.cylinder(0.8, 1.4, 9, 6), obs, 0, 4.5);
    // Base buttresses (3)
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      solid(g, G.box(0.5, 3.0, 0.5), dark, Math.cos(a) * 1.5, 1.5, Math.sin(a) * 1.5);
    }
    // Battlements
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      solid(g, G.box(0.35, 0.7, 0.35), obs, Math.cos(a) * 0.75, 9.35, Math.sin(a) * 0.75);
    }
    // Lava runes — emissive stripes up the shaft
    for (let y = 1; y < 9; y += 2.5) {
      deco(g, G.torus(0.82, 0.04, 5, 12), lava, 0, y, 0, Math.PI / 2);
    }
    return g;
  }
}

registerMesh(ObsidianSpire);
