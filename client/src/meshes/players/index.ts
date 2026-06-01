import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { buildRaceModel } from '../../entities/RaceModels';
import { PLAYER_RACES } from '../../entities/PlayerSkins';

export function registerPlayerMeshes() {
  for (const race of PLAYER_RACES) {
    const type = `player_${race}`;
    
    const PlayerClass = class extends Mesh {
      static readonly type = type;
      static readonly category = 'player' as const;

      build(ctx: BuildContext): THREE.Object3D {
        const group = buildRaceModel(race);
        group.position.copy(ctx.position);
        group.scale.setScalar(ctx.scale);
        return group;
      }
    };

    Object.defineProperty(PlayerClass, 'type', { value: type });
    Object.defineProperty(PlayerClass, 'category', { value: 'player' });

    registerMesh(PlayerClass as any);
  }
}

// Side effect: register all Player meshes
registerPlayerMeshes();
