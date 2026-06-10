import * as THREE from 'three';
import { lerpAngle } from '../utils/math/MathHelpers';
import { PlayerRig, lerp, clamp, clampedT, angleDiff } from './PlayerRig';
import { applyLocomotion } from './poses/locomotion';
import { applySwimPose } from './poses/swim';
import { applySailingPose } from './poses/sailing';
import { applyJumpPose } from './poses/jump';

export interface AnimInput {
  delta: number;
  isMoving: boolean;
  velocity: THREE.Vector3;
  isSwimming: boolean;
  facingYawOverride: number | null;
  isGrounded: boolean;
  inBoat: boolean;
  /** Board-jump arc progress 0..1 (peak = 1) — overrides other poses while leaping. */
  boardJump: number;
}

/**
 * PlayerAnimator — owns all procedural-animation state and orchestrates the
 * per-frame pose. The animation logic lives here (and in ./poses), fully
 * decoupled from the Player entity, which just owns the model/rig and forwards
 * its input. Add new states by adding a pose module and blending it here.
 */
export class PlayerAnimator {
  private walkPhase = 0;
  private breathPhase = Math.random() * Math.PI * 2;
  private idlePhase = Math.random() * Math.PI * 2;

  private forwardLean = 0;
  private bankLean = 0;
  private armRaise = 0;
  private squashTimer = 0;
  private wasGrounded = true;
  private cloakLean = 0;
  private sailBlend = 0;

  private facingYaw = 0;
  private prevFacingYaw = 0;
  private turnRate = 0;

  /** Current visual facing (radians). */
  get facing(): number {
    return this.facingYaw;
  }

  update(rig: PlayerRig, input: AnimInput): void {
    const { delta, isMoving, velocity, isSwimming, facingYawOverride, isGrounded, inBoat, boardJump } = input;

    // --- Phases ---
    const speed = velocity.length();
    const isRunning = isMoving && speed > 10;
    const animSpeed = isRunning ? 15 : 8;
    if (isMoving) this.walkPhase += delta * animSpeed;
    else this.walkPhase *= 0.85;
    this.breathPhase += delta * 1.35;
    this.idlePhase += delta * 0.4;

    // --- Landing squash ---
    if (isGrounded && !this.wasGrounded) this.squashTimer = 0.18;
    this.wasGrounded = isGrounded;
    if (this.squashTimer > 0) {
      this.squashTimer -= delta;
      const t = Math.max(0, this.squashTimer / 0.18);
      const squash = 1 - 0.14 * Math.sin(t * Math.PI);
      rig.visualRoot.scale.set(1 + (1 - squash) * 0.3, squash, 1 + (1 - squash) * 0.3);
    } else {
      rig.visualRoot.scale.set(1, 1, 1);
    }

    // --- Turn rate for banking ---
    const facingDelta = angleDiff(this.facingYaw, this.prevFacingYaw);
    this.turnRate = lerp(this.turnRate, facingDelta / Math.max(delta, 0.001), clampedT(delta, 8));
    this.prevFacingYaw = this.facingYaw;

    // --- Locomotion (legs/arms/head) ---
    this.armRaise = applyLocomotion(rig, {
      delta, isMoving, isRunning,
      walkPhase: this.walkPhase, breathPhase: this.breathPhase, idlePhase: this.idlePhase,
      armRaise: this.armRaise,
    });

    // --- Forward lean + turn banking ---
    const targetLean = isRunning ? -0.13 : isMoving ? -0.07 : 0;
    this.forwardLean = lerp(this.forwardLean, targetLean, clampedT(delta, 5));
    const targetBank = clamp(this.turnRate * 0.015, -0.12, 0.12) * (isMoving ? 1 : 0);
    this.bankLean = lerp(this.bankLean, targetBank, clampedT(delta, 6));
    rig.visualRoot.rotation.x = this.forwardLean;
    rig.visualRoot.rotation.z = this.bankLean;

    // --- Cloak ---
    const targetCloakLean = isRunning ? 0.55 : isMoving ? 0.30 : 0;
    this.cloakLean = lerp(this.cloakLean, targetCloakLean, clampedT(delta, 3.5));
    if (rig.cloak) {
      const flutter = isMoving ? Math.sin(this.walkPhase * 1.3) * 0.06 : 0;
      rig.cloak.rotation.x = this.cloakLean + flutter;
    }

    // --- Body height / swim ---
    if (isSwimming) {
      applySwimPose(rig, this.bankLean);
    } else {
      const breath = Math.sin(this.breathPhase) * 0.012;
      const idleSway = Math.sin(this.idlePhase) * (isMoving ? 0 : 0.02);
      const bounceAmp = isRunning ? 0.1 : 0.05;
      const bounce = isMoving ? (Math.abs(Math.cos(this.walkPhase)) - 0.5) * bounceAmp : 0;
      rig.visualRoot.position.y = breath + idleSway + bounce;
      rig.visualRoot.position.x = isMoving ? Math.sin(this.walkPhase) * (isRunning ? 0.05 : 0.03) : 0;
    }

    // --- Sailing pose (blended over everything above) ---
    this.sailBlend = lerp(this.sailBlend, inBoat ? 1 : 0, clampedT(delta, 4));
    if (this.sailBlend > 0.001) {
      applySailingPose(rig, this.sailBlend, this.idlePhase);
    } else if (!isSwimming) {
      rig.visualRoot.position.z = lerp(rig.visualRoot.position.z, 0, clampedT(delta, 6));
    }

    // --- Board-jump leap pose (wins over sailing while leaping into the boat) ---
    if (boardJump > 0.001) applyJumpPose(rig, boardJump);

    // --- Face movement direction ---
    if (facingYawOverride !== null) {
      this.facingYaw = lerpAngle(this.facingYaw, facingYawOverride, clampedT(delta, 14));
    } else if (isMoving && (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01)) {
      const targetYaw = Math.atan2(velocity.x, velocity.z);
      this.facingYaw = lerpAngle(this.facingYaw, targetYaw, clampedT(delta, 10));
    }
    rig.group.rotation.y = this.facingYaw;
    rig.group.rotation.x = 0;
  }
}
