import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { m, solid, deco } from './BiomeKit';
import * as G from '../../../systems/worldbuilder/objects/geoCache';

export class AncientGate extends Mesh {
  static readonly type = 'biome_ancient_gate';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(ctx.position);
    const sand = m(0xc09040, 0.88);
    const dark = m(0x1a0800, 0.88);
    const gold = m(0xffdd44, 0.12, 0.7, 0xddbb00, 0.6);
    // Two massive pillars
    for (const ox of [-2.3, 2.3]) {
      solid(g, G.box(1.2, 6.5, 1.2), sand, ox, 3.25);
      solid(g, G.box(1.5, 0.55, 1.5), sand, ox, 6.8);
    }
    // Lintel
    solid(g, G.box(5.3, 0.9, 1.0), sand, 0, 7.35);
    // Carved inscription (gold strip)
    deco(g, G.box(4.0, 0.22, 0.15), gold, 0, 7.35, -0.51);
    // Fallen debris
    for (const [dx, dz, r] of [[1.5, 1.0, 0.4], [-2.0, 0.5, 0.55], [0.8, -1.2, 0.35]] as [number,number,number][])
      solid(g, G.box(r * 2, r * 0.6, r * 1.5), sand, dx, r * 0.3, dz);
    // Hieroglyph panel leaning against pillar
    solid(g, G.box(0.8, 1.5, 0.12), dark, -3.0, 0.75, 0, 0.15);
    return g;
  }
}

registerMesh(AncientGate);
