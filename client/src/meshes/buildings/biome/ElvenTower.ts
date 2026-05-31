import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class ElvenTower extends Mesh {
  static readonly type = 'biome_elven_tower';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const stone = m(0x556677, 0.75);
    const glowTeal = m(0x44ccaa, 0.15, 0, 0x22aa88, 1.6);
    const cap = m(0x334455, 0.8);
    // Base plinth
    solid(g, G.cylinder(1.8, 2.1, 0.6, 8), stone, 0, 0.3);
    // Tower shaft — tapered hexagonal
    solid(g, G.cylinder(0.9, 1.3, 6, 6), stone, 0, 3.6);
    // Pointed cap
    solid(g, G.cone(1.1, 2.2, 6), cap, 0, 7.7);
    // Three windows — glowing apertures
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      deco(g, G.box(0.25, 0.5, 0.12), glowTeal,
        Math.cos(a) * 0.9, 4.2, Math.sin(a) * 0.9);
    }
    // Orb at tip
    deco(g, G.octahedron(0.35, 1), glowTeal, 0, 9.1);
    return g;
  }
}

registerMesh(ElvenTower);
