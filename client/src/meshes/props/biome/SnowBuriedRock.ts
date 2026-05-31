import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from '../../buildings/biome/BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class SnowBuriedRock extends Mesh {
  static readonly type = 'biome_prop_snow_buried_rock';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const s = ctx.scale;
    const rock = m(0x556677, 0.88);
    const snow = m(0xddeeff, 0.95);
    solid(g, G.sphere(0.7 * s, 8, 8), rock, 0, 0.4 * s);
    deco(g, G.sphere(0.75 * s, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), snow, 0, 0.72 * s);
    return g;
  }
}

registerMesh(SnowBuriedRock);
