import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class CrystalSpire extends Mesh {
  static readonly type = 'biome_crystal_spire';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const crystal = m(0x88ccff, 0.04, 0.45, 0x55aaee, 1.3);
    const darkIce = m(0x445566, 0.2, 0.4);
    // Central tall spire
    deco(g, G.cone(0.55, 7.5, 5), crystal, 0, 3.75);
    // Ringed ice base
    solid(g, G.cylinder(2.0, 2.3, 0.6, 8), darkIce, 0, 0.3);
    // Satellite crystals
    const offsets: [number, number, number, number][] = [
      [1.5, 0, 1.5, 4], [-1.4, 0, 0.8, 3], [0.6, 0, -1.7, 5], [-1.0, 0, -1.4, 3.5],
    ];
    offsets.forEach(([px, , pz, h]) => {
      deco(g, G.cone(0.22, h, 5), crystal, px, h / 2, pz);
    });
    return g;
  }
}

registerMesh(CrystalSpire);
