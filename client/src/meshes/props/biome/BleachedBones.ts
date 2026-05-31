import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class BleachedBones extends Mesh {
  static readonly type = 'biome_prop_bleached_bones';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const bone = m(0xe8dcc0, 0.9);
    solid(g, G.sphere(0.22 * s, 7, 7), bone, 0, 0.22 * s);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      deco(g, G.cylinder(0.05 * s, 0.07 * s, 0.85 * s, 5), bone,
        Math.cos(a) * 0.55 * s, 0.1, Math.sin(a) * 0.55 * s, 0, 0, Math.PI / 2 + a);
    }
    return g;
  }
}

registerMesh(BleachedBones);
