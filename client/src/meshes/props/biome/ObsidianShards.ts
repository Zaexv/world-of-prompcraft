import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class ObsidianShards extends Mesh {
  static readonly type = 'biome_prop_obsidian_shards';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const obs = m(0x111122, 0.18, 0.72);
    solid(g, G.cone(0.28 * s, 1.8 * s, 5), obs, 0, 0.9 * s);
    solid(g, G.cone(0.2 * s, 1.2 * s, 5), obs, 0.5 * s, 0.6 * s, 0.2 * s, 0, 0, 0.3);
    solid(g, G.cone(0.15 * s, 0.9 * s, 5), obs, -0.4 * s, 0.45 * s, -0.2 * s, 0, 0, -0.25);
    return g;
  }
}

registerMesh(ObsidianShards);
