import * as THREE from 'three';
import { buildRaceModel } from './RaceModels';
import { applyCharacterPBR } from '../utils/PBRMaps';
import { PlayerAnimator, extractPlayerRig, type PlayerRig } from '../animations';

/**
 * Player character built from a procedural race-specific model.
 *
 * The entity owns the model/rig; all procedural animation lives in
 * `../animations` (see PlayerAnimator + poses). `update()` just forwards input.
 */
export class Player {
  public readonly group: THREE.Group;

  private rig: PlayerRig;
  private animator = new PlayerAnimator();

  constructor(race: string = 'night_elf') {
    this.group = new THREE.Group();
    const visualRoot = buildRaceModel(race);
    applyCharacterPBR(visualRoot);
    this.group.add(visualRoot);
    this.rig = extractPlayerRig(this.group, visualRoot);
  }

  /** Create a player with a procedural race model. */
  static create(race: string = 'night_elf'): Player {
    return new Player(race);
  }

  /** The avatar's current visual facing (radians) — what remote clients should render. */
  get facingYaw(): number {
    return this.animator.facing;
  }

  update(
    delta: number,
    isMoving: boolean,
    velocity: THREE.Vector3,
    isSwimming = false,
    facingYawOverride: number | null = null,
    isGrounded = true,
    inBoat = false,
    boardJump = 0,
  ): void {
    this.animator.update(this.rig, {
      delta, isMoving, velocity, isSwimming, facingYawOverride, isGrounded, inBoat, boardJump,
    });
  }
}
