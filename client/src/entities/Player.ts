import * as THREE from 'three';
import { lerpAngle } from '../utils/MathHelpers';
import { buildRaceModel } from './RaceModels';

/**
 * Player character built from basic geometry using race-specific models.
 * Supports walk, swim, and idle animations.
 */
export class Player {
  public readonly group: THREE.Group;

  private leftLeg: THREE.Mesh | null;
  private rightLeg: THREE.Mesh | null;
  private leftArm: THREE.Mesh | null;
  private rightArm: THREE.Mesh | null;
  private body: THREE.Mesh | null;
  private cloak: THREE.Mesh | null;
  private walkPhase = 0;
  private swimPhase = 0;

  /** Current body tilt for swim transition (radians, 0 = upright). */
  private bodyTilt = 0;

  /** The yaw the model is currently visually facing (radians). */
  private facingYaw = 0;

  constructor(race: string = 'night_elf') {
    this.group = buildRaceModel(race);

    // Look up parts by name (may be null if model is missing a part)
    this.body = (this.group.getObjectByName('body') as THREE.Mesh) ?? null;
    this.leftLeg = (this.group.getObjectByName('leftLeg') as THREE.Mesh) ?? null;
    this.rightLeg = (this.group.getObjectByName('rightLeg') as THREE.Mesh) ?? null;
    this.leftArm = (this.group.getObjectByName('leftArm') as THREE.Mesh) ?? null;
    this.rightArm = (this.group.getObjectByName('rightArm') as THREE.Mesh) ?? null;
    this.cloak = (this.group.getObjectByName('cloak') as THREE.Mesh) ?? null;
  }

  /**
   * Called every frame.
   * @param delta      Time since last frame (seconds).
   * @param isMoving   Whether the player is currently moving.
   * @param velocity   Current velocity vector (used for facing direction).
   * @param isSwimming Whether the player is currently in water.
   */
  update(delta: number, isMoving: boolean, velocity: THREE.Vector3, isSwimming = false): void {
    // --- Smooth body tilt transition ---
    const targetTilt = isSwimming ? Math.PI * 0.35 : 0; // lean forward ~63° when swimming
    this.bodyTilt += (targetTilt - this.bodyTilt) * clampedT(delta, 6);
    this.group.rotation.x = this.bodyTilt;

    if (isSwimming) {
      // ---- Swimming animation ----
      this.swimPhase += delta * (isMoving ? 6 : 2.5);
      this.walkPhase = 0;

      // Leg flutter (fast, small kicks)
      const kick = Math.sin(this.swimPhase * 2) * 0.4;
      if (this.leftLeg) this.leftLeg.rotation.x = kick;
      if (this.rightLeg) this.rightLeg.rotation.x = -kick;

      // Arm strokes (alternating breaststroke-like motion)
      const strokeL = Math.sin(this.swimPhase) * 1.1;
      const strokeR = Math.sin(this.swimPhase + Math.PI) * 1.1;
      if (this.leftArm) {
        this.leftArm.rotation.x = strokeL;
        this.leftArm.rotation.z = Math.cos(this.swimPhase) * 0.3 + 0.15;
      }
      if (this.rightArm) {
        this.rightArm.rotation.x = strokeR;
        this.rightArm.rotation.z = -(Math.cos(this.swimPhase + Math.PI) * 0.3 + 0.15);
      }

      // Cloak flows behind
      if (this.cloak) this.cloak.rotation.x = Math.sin(this.swimPhase * 0.5) * 0.2 + 0.3;
    } else {
      // ---- Land animation ----
      this.swimPhase = 0;

      // Damp arm rotation back to neutral (including Z from swimming)
      if (this.leftArm) {
        this.leftArm.rotation.x *= 0.85;
        this.leftArm.rotation.z *= 0.85;
      }
      if (this.rightArm) {
        this.rightArm.rotation.x *= 0.85;
        this.rightArm.rotation.z *= 0.85;
      }

      if (isMoving) {
        this.walkPhase += delta * 10;
        const swing = Math.sin(this.walkPhase) * 0.5;
        if (this.leftLeg) this.leftLeg.rotation.x = swing;
        if (this.rightLeg) this.rightLeg.rotation.x = -swing;

        // Arms swing opposite to legs
        if (this.leftArm) this.leftArm.rotation.x = -swing * 0.4;
        if (this.rightArm) this.rightArm.rotation.x = swing * 0.4;

        // Subtle cloak billow while moving
        if (this.cloak) this.cloak.rotation.x = Math.sin(this.walkPhase * 0.7) * 0.12;
      } else {
        // Return to neutral — dampen rotations smoothly instead of hard-resetting walkPhase
        if (this.leftLeg) this.leftLeg.rotation.x *= 0.85;
        if (this.rightLeg) this.rightLeg.rotation.x *= 0.85;
        if (this.cloak) this.cloak.rotation.x *= 0.9;
        // Let walkPhase dampen toward 0 to avoid animation jerks on stop
        this.walkPhase *= 0.85;
      }
    }

    // --- Face movement direction ---
    if (isMoving && (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01)) {
      const targetYaw = Math.atan2(velocity.x, velocity.z);
      this.facingYaw = lerpAngle(this.facingYaw, targetYaw, clampedT(delta, 10));
    }
    this.group.rotation.y = this.facingYaw;
  }
}

/** Helper: clamp a lerp factor so it doesn't overshoot at low framerates. */
function clampedT(delta: number, speed: number): number {
  return Math.min(1, delta * speed);
}
