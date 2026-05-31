import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class IceSpikes extends Mesh {
  static readonly type = 'biome_prop_ice_spikes';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const ice = m(0x88ccee, 0.04, 0.42, 0x55aacc, 0.65);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2, h = (0.5 + Math.random() * 0.9) * s;
      deco(g, G.cone(0.13 * s, h, 5), ice, Math.cos(a) * 0.28 * s, h / 2, Math.sin(a) * 0.28 * s);
    }
    deco(g, G.cone(0.2 * s, 1.4 * s, 5), ice, 0, 0.7 * s);
    return g;
  }
}

registerMesh(IceSpikes);
