import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { buildRitualSite } from '../../systems/worldbuilder/objects/encounterBuilders';

const STUB_RNG = {
  next: () => 0.5,
  nextInt: () => 0,
  nextRange: (lo: number) => lo,
  chance: () => false,
  pick: <T>(a: readonly T[]): T => a[0]!,
};

export class RitualSite extends Mesh {
  static readonly type = 'encounter_ritual_site';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = buildRitualSite(ctx.position.clone(), ctx.rng ?? STUB_RNG);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(RitualSite);
