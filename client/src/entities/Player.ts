import * as THREE from 'three';
import { buildRaceModel } from './RaceModels';
import { lerpAngle } from '../utils/math/MathHelpers';
import { applyCharacterPBR } from '../utils/PBRMaps';

/**
 * Player character built from a procedural race-specific model.
 */
export class Player {
  public readonly group: THREE.Group;

  private visualRoot: THREE.Object3D;

  private leftLeg: THREE.Mesh | null;
  private rightLeg: THREE.Mesh | null;
  private leftArm: THREE.Mesh | null;
  private rightArm: THREE.Mesh | null;
  private cloak: THREE.Mesh | null;
  private head: THREE.Mesh | null;

  // --- Animation phases ---
  private walkPhase = 0;
  private breathPhase = Math.random() * Math.PI * 2;
  private idlePhase = Math.random() * Math.PI * 2;

  // --- Smooth animation state ---
  private forwardLean = 0;
  private bankLean = 0;
  private armRaise = 0;
  private squashTimer = 0;
  private wasGrounded = true;
  private cloakLean = 0;

  /** The yaw the model is currently visually facing (radians). */
  private facingYaw = 0;
  private prevFacingYaw = 0;
  private turnRate = 0;

  constructor(race: string = 'night_elf') {
    this.group = new THREE.Group();

    this.visualRoot = buildRaceModel(race);
    applyCharacterPBR(this.visualRoot);
    this.group.add(this.visualRoot);

    this.leftLeg = (this.group.getObjectByName('leftLeg') as THREE.Mesh) ?? null;
    this.rightLeg = (this.group.getObjectByName('rightLeg') as THREE.Mesh) ?? null;
    this.leftArm = (this.group.getObjectByName('leftArm') as THREE.Mesh) ?? null;
    this.rightArm = (this.group.getObjectByName('rightArm') as THREE.Mesh) ?? null;
    this.cloak = (this.group.getObjectByName('cloak') as THREE.Mesh) ?? null;
    this.head = (this.group.getObjectByName('head') as THREE.Mesh) ?? null;
  }

  /** Create a player with a procedural race model. */
  static create(race: string = 'night_elf'): Player {
    return new Player(race);
  }

  update(
    delta: number,
    isMoving: boolean,
    velocity: THREE.Vector3,
    isSwimming = false,
    facingYawOverride: number | null = null,
    isGrounded = true,
  ): void {
    // --- Phases ---
    const speed = velocity.length();
    const isRunning = isMoving && speed > 10;
    const animSpeed = isRunning ? 15 : 8;
    if (isMoving) this.walkPhase += delta * animSpeed;
    else this.walkPhase *= 0.85;

    this.breathPhase += delta * 1.35;
    this.idlePhase += delta * 0.4;

    // --- Landing squash ---
    if (isGrounded && !this.wasGrounded) {
      this.squashTimer = 0.18;
    }
    this.wasGrounded = isGrounded;
    if (this.squashTimer > 0) {
      this.squashTimer -= delta;
      const t = Math.max(0, this.squashTimer / 0.18);
      const squash = 1 - 0.14 * Math.sin(t * Math.PI);
      this.visualRoot.scale.set(1 + (1 - squash) * 0.3, squash, 1 + (1 - squash) * 0.3);
    } else {
      this.visualRoot.scale.set(1, 1, 1);
    }

    // --- Turn rate for banking ---
    const facingDelta = angleDiff(this.facingYaw, this.prevFacingYaw);
    this.turnRate = lerp(this.turnRate, facingDelta / Math.max(delta, 0.001), clampedT(delta, 8));
    this.prevFacingYaw = this.facingYaw;

    this.updateProceduralAnimation(delta, isMoving, isRunning);

    // --- Forward lean ---
    const targetLean = isRunning ? -0.13 : isMoving ? -0.07 : 0;
    this.forwardLean = lerp(this.forwardLean, targetLean, clampedT(delta, 5));

    // --- Turn banking (lean into turns) ---
    const targetBank = clamp(this.turnRate * 0.015, -0.12, 0.12) * (isMoving ? 1 : 0);
    this.bankLean = lerp(this.bankLean, targetBank, clampedT(delta, 6));

    this.visualRoot.rotation.x = this.forwardLean;
    this.visualRoot.rotation.z = this.bankLean;

    // --- Cloak: blow backward with movement (positive rotation.x = bottom trails behind) ---
    const targetCloakLean = isRunning ? 0.55 : isMoving ? 0.30 : 0;
    this.cloakLean = lerp(this.cloakLean, targetCloakLean, clampedT(delta, 3.5));
    if (this.cloak) {
      const flutter = isMoving ? Math.sin(this.walkPhase * 1.3) * 0.06 : 0;
      this.cloak.rotation.x = this.cloakLean + flutter;
    }

    // --- Swimming override ---
    if (isSwimming) {
      this.visualRoot.position.y = 0.34;
      this.visualRoot.rotation.z = this.bankLean * 0.5;
    } else {
      const breath = Math.sin(this.breathPhase) * 0.012;
      const idleSway = Math.sin(this.idlePhase) * (isMoving ? 0 : 0.018);
      const moveBob = Math.sin(this.walkPhase) * (isMoving ? 0.04 : 0);
      this.visualRoot.position.y = breath + moveBob + idleSway;
    }

    // --- Face movement direction ---
    if (facingYawOverride !== null) {
      this.facingYaw = lerpAngle(this.facingYaw, facingYawOverride, clampedT(delta, 14));
    } else if (isMoving && (Math.abs(velocity.x) > 0.01 || Math.abs(velocity.z) > 0.01)) {
      const targetYaw = Math.atan2(velocity.x, velocity.z);
      this.facingYaw = lerpAngle(this.facingYaw, targetYaw, clampedT(delta, 10));
    }
    this.group.rotation.y = this.facingYaw;
    this.group.rotation.x = 0;
  }

  private updateProceduralAnimation(delta: number, isMoving: boolean, isRunning: boolean): void {
    const swing = Math.sin(this.walkPhase) * (isRunning ? 0.65 : 0.48);
    const breathNod = Math.sin(this.breathPhase) * 0.012;
    const idleFidget = Math.sin(this.idlePhase * 2.3) * (isMoving ? 0 : 0.008);

    // Legs: stride
    if (this.leftLeg) this.leftLeg.rotation.x = swing;
    if (this.rightLeg) this.rightLeg.rotation.x = -swing;

    // Arms: swing opposite legs, raise slightly when running (combat-ready)
    const targetArmRaise = isRunning ? -0.35 : 0;
    this.armRaise = lerp(this.armRaise, targetArmRaise, clampedT(delta, 4));

    if (this.leftArm) {
      this.leftArm.rotation.x = -swing * 0.55 + this.armRaise;
      this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, isMoving ? -0.08 : -0.04, clampedT(delta, 3));
    }
    if (this.rightArm) {
      this.rightArm.rotation.x = swing * 0.55 + this.armRaise;
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, isMoving ? 0.08 : 0.04, clampedT(delta, 3));
    }

    // Head: breath nod + idle look
    if (this.head) {
      this.head.rotation.x = breathNod + idleFidget;
      this.head.rotation.y = lerp(this.head.rotation.y, isMoving ? 0 : Math.sin(this.idlePhase * 0.7) * 0.08, clampedT(delta, 2));
    }
  }
}

function clampedT(delta: number, speed: number): number {
  return Math.min(1, delta * speed);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Shortest signed difference between two angles. */
function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
