import * as THREE from 'three';
import { lerpAngle } from '../utils/MathHelpers';

/**
 * Night-Elf-inspired player character built from basic geometry.
 * Tall, slender proportions with pointed ears, silver hair, and a billowing cloak.
 */
export class Player {
  public readonly group: THREE.Group;

  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private body: THREE.Mesh;
  private cloak: THREE.Mesh;
  private walkPhase = 0;
  private swimPhase = 0;

  /** Current body tilt for swim transition (radians, 0 = upright). */
  private bodyTilt = 0;

  /** The yaw the model is currently visually facing (radians). */
  private facingYaw = 0;

  constructor() {
    this.group = new THREE.Group();

    // --- Colour palette ---
    const skinColor = 0xd4b8a0;       // pale elven skin
    const bodyColor = 0x332255;        // dark indigo
    const legColor = 0x221144;         // slightly darker indigo
    const hairColor = 0xccccdd;        // silver-white
    const cloakColor = 0x2a1845;       // dark purple cloak

    // ----- Body (taller, slimmer) -----
    const bodyGeo = new THREE.BoxGeometry(0.5, 1.4, 0.32);
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 1.5; // centre of body
    this.body.castShadow = true;
    this.group.add(this.body);

    // ----- Head -----
    const headGeo = new THREE.SphereGeometry(0.22, 12, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.42;
    head.castShadow = true;
    this.group.add(head);

    // ----- Pointed ears -----
    const earGeo = new THREE.ConeGeometry(0.06, 0.28, 6);
    const earMat = new THREE.MeshStandardMaterial({ color: skinColor });

    const leftEar = new THREE.Mesh(earGeo, earMat);
    leftEar.position.set(-0.24, 2.48, 0);
    leftEar.rotation.z = Math.PI / 3;   // angled outward
    this.group.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, earMat);
    rightEar.position.set(0.24, 2.48, 0);
    rightEar.rotation.z = -Math.PI / 3;
    this.group.add(rightEar);

    // ----- Hair (elongated cone sitting on top of head) -----
    const hairGeo = new THREE.ConeGeometry(0.18, 0.5, 8);
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });
    const hair = new THREE.Mesh(hairGeo, hairMat);
    hair.position.y = 2.78;
    this.group.add(hair);

    // ----- Legs (longer for taller proportions) -----
    const legGeo = new THREE.BoxGeometry(0.14, 0.7, 0.14);
    const legMat = new THREE.MeshStandardMaterial({ color: legColor });

    this.leftLeg = new THREE.Mesh(legGeo, legMat);
    this.leftLeg.position.set(-0.13, 0.45, 0);
    this.leftLeg.castShadow = true;
    this.group.add(this.leftLeg);

    this.rightLeg = new THREE.Mesh(legGeo, legMat);
    this.rightLeg.position.set(0.13, 0.45, 0);
    this.rightLeg.castShadow = true;
    this.group.add(this.rightLeg);

    // ----- Cloak / Cape (plane hanging from shoulders) -----
    const cloakGeo = new THREE.PlaneGeometry(0.55, 1.3, 1, 4);
    const cloakMat = new THREE.MeshStandardMaterial({
      color: cloakColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
    });
    this.cloak = new THREE.Mesh(cloakGeo, cloakMat);
    this.cloak.position.set(0, 1.45, -0.2);
    this.cloak.castShadow = true;
    this.group.add(this.cloak);

    // ----- Arms -----
    const armGeo = new THREE.BoxGeometry(0.12, 0.7, 0.12);
    const armMat = new THREE.MeshStandardMaterial({ color: skinColor });

    this.leftArm = new THREE.Mesh(armGeo, armMat);
    this.leftArm.position.set(-0.35, 1.75, 0);
    this.leftArm.castShadow = true;
    this.group.add(this.leftArm);

    this.rightArm = new THREE.Mesh(armGeo, armMat);
    this.rightArm.position.set(0.35, 1.75, 0);
    this.rightArm.castShadow = true;
    this.group.add(this.rightArm);
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
      this.leftLeg.rotation.x = kick;
      this.rightLeg.rotation.x = -kick;

      // Arm strokes (alternating breaststroke-like motion)
      const strokeL = Math.sin(this.swimPhase) * 1.1;
      const strokeR = Math.sin(this.swimPhase + Math.PI) * 1.1;
      this.leftArm.rotation.x = strokeL;
      this.rightArm.rotation.x = strokeR;
      // Arms sweep outward slightly
      this.leftArm.rotation.z = Math.cos(this.swimPhase) * 0.3 + 0.15;
      this.rightArm.rotation.z = -(Math.cos(this.swimPhase + Math.PI) * 0.3 + 0.15);

      // Cloak flows behind
      this.cloak.rotation.x = Math.sin(this.swimPhase * 0.5) * 0.2 + 0.3;
    } else {
      // ---- Land animation ----
      this.swimPhase = 0;

      // Damp arm rotation back to neutral
      this.leftArm.rotation.x *= 0.85;
      this.rightArm.rotation.x *= 0.85;
      this.leftArm.rotation.z *= 0.85;
      this.rightArm.rotation.z *= 0.85;

      if (isMoving) {
        this.walkPhase += delta * 10;
        const swing = Math.sin(this.walkPhase) * 0.5;
        this.leftLeg.rotation.x = swing;
        this.rightLeg.rotation.x = -swing;

        // Arms swing opposite to legs
        this.leftArm.rotation.x = -swing * 0.4;
        this.rightArm.rotation.x = swing * 0.4;

        // Subtle cloak billow while moving
        this.cloak.rotation.x = Math.sin(this.walkPhase * 0.7) * 0.12;
      } else {
        // Return to neutral
        this.leftLeg.rotation.x *= 0.85;
        this.rightLeg.rotation.x *= 0.85;
        this.cloak.rotation.x *= 0.9;
        this.walkPhase = 0;
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
