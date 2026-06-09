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
      this.visualRoot.position.set(0, 0.34, 0);
      this.visualRoot.rotation.z = this.bankLean * 0.5;
    } else {
      const breath = Math.sin(this.breathPhase) * 0.012;
      const idleSway = Math.sin(this.idlePhase) * (isMoving ? 0 : 0.02);
      // Footfall bounce: the body rises at mid-stride (leg passing under) and dips
      // at each footfall, so it bobs twice per stride (|cos| has half the period).
      const bounceAmp = isRunning ? 0.1 : 0.05;
      const bounce = isMoving ? (Math.abs(Math.cos(this.walkPhase)) - 0.5) * bounceAmp : 0;
      this.visualRoot.position.y = breath + idleSway + bounce;
      // Lateral weight shift onto the planted foot, once per stride.
      this.visualRoot.position.x = isMoving ? Math.sin(this.walkPhase) * (isRunning ? 0.05 : 0.03) : 0;
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
    const stride = Math.sin(this.walkPhase);
    const legAmp = isRunning ? 0.85 : 0.55;
    const breathNod = Math.sin(this.breathPhase) * 0.02;
    const idleFidget = Math.sin(this.idlePhase * 2.3) * (isMoving ? 0 : 0.008);

    // Legs: stride from the hip, contralateral to the arms.
    if (this.leftLeg) this.leftLeg.rotation.x = stride * legAmp;
    if (this.rightLeg) this.rightLeg.rotation.x = -stride * legAmp;

    // Arms: swing opposite the same-side leg, with a slight outward splay so they
    // clear the torso/cape. Running pulls them a touch forward (combat-ready).
    const targetArmRaise = isRunning ? -0.45 : 0;
    this.armRaise = lerp(this.armRaise, targetArmRaise, clampedT(delta, 4));
    const armAmp = isRunning ? 0.7 : 0.5;
    const splay = isMoving ? 0.12 : 0.05;

    if (this.leftArm) {
      this.leftArm.rotation.x = -stride * armAmp + this.armRaise;
      this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, -splay, clampedT(delta, 4));
    }
    if (this.rightArm) {
      this.rightArm.rotation.x = stride * armAmp + this.armRaise;
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, splay, clampedT(delta, 4));
    }

    // Head: breath nod + idle look, plus a subtle counter-bob against the stride.
    if (this.head) {
      this.head.rotation.x = breathNod + idleFidget + (isMoving ? Math.abs(Math.cos(this.walkPhase)) * 0.03 : 0);
      this.head.rotation.y = lerp(this.head.rotation.y, isMoving ? 0 : Math.sin(this.idlePhase * 0.7) * 0.08, clampedT(delta, 2));
      this.head.rotation.z = lerp(this.head.rotation.z, isMoving ? -stride * 0.03 : 0, clampedT(delta, 5));
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
