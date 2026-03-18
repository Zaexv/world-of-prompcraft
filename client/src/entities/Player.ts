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
  private cloak: THREE.Mesh;
  private walkPhase = 0;

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
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.5; // centre of body
    body.castShadow = true;
    this.group.add(body);

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
  }

  /**
   * Called every frame.
   * @param delta  Time since last frame (seconds).
   * @param isMoving  Whether the player is currently moving.
   * @param velocity  Current velocity vector (used for facing direction).
   */
  update(delta: number, isMoving: boolean, velocity: THREE.Vector3): void {
    // --- Walk animation (leg oscillation + cloak billow) ---
    if (isMoving) {
      this.walkPhase += delta * 10;
      const swing = Math.sin(this.walkPhase) * 0.5;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;

      // Subtle cloak billow while moving
      this.cloak.rotation.x = Math.sin(this.walkPhase * 0.7) * 0.12;
    } else {
      // Return legs to neutral
      this.leftLeg.rotation.x *= 0.85;
      this.rightLeg.rotation.x *= 0.85;
      this.cloak.rotation.x *= 0.9;
      this.walkPhase = 0;
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
