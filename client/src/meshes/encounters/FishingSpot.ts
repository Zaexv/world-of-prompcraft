import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { buildFishingSpot } from '../../systems/worldbuilder/objects/encounterBuilders';

const STUB_RNG = {
  next: () => 0.5,
  nextInt: () => 0,
  nextRange: (lo: number) => lo,
  chance: () => false,
  pick: <T>(a: readonly T[]): T => a[0]!,
};

export class FishingSpot extends Mesh {
  static readonly type = 'encounter_fishing_spot';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Object3D {
    const group = buildFishingSpot(ctx.position.clone(), ctx.rng ?? STUB_RNG);
    group.scale.setScalar(ctx.scale);
    return group;
  }
}

registerMesh(FishingSpot);
