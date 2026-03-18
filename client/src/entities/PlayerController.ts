import * as THREE from 'three';
import { clamp, lerp } from '../utils/MathHelpers';
import { Water } from '../scene/Water';
import { CollisionSystem } from '../systems/CollisionSystem';

/**
 * First/Third-person player controller with pointer-lock mouse look,
 * WASD movement, jumping, and third-person camera follow.
 *
 * Includes water collision: the player cannot walk into deep water
 * and is slowed when near the water's edge.
 */
export class PlayerController {
  /** Player world position (client-authoritative for now). */
  public readonly position = new THREE.Vector3(0, 0, 0);
  /** Camera yaw in radians. */
  public yaw = 0;
  /** Camera pitch in radians. */
  public pitch = 0;
  /** Whether pointer lock is currently active. */
  public isPointerLocked = false;

  // --- Movement ---
  private readonly walkSpeed = 8;
  private readonly runSpeed = 16;
  private readonly jumpVelocity = 10;
  private readonly gravity = -20;
  private verticalVelocity = 0;
  private isGrounded = true;

  // --- Water collision ---
  /** Wading depth offset above water level — player stops here. */
  private readonly wadingOffset = 0.3;
  /** Distance from water edge where movement starts slowing. */
  private readonly waterSlowRange = 1.5;
  /** Speed multiplier when near water. */
  private readonly waterSlowFactor = 0.6;

  // --- Collision ---
  private collisionSystem: CollisionSystem | null = null;
  private scene: THREE.Scene | null = null;

  // --- Camera ---
  private zoomDistance = 8;
  private readonly zoomMin = 4;
  private readonly zoomMax = 20;
  private readonly cameraHeight = 4;

  // --- Input state ---
  private keys: Record<string, boolean> = {};
  private mouseSensitivity = 0.002;

  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  private getHeightAt: (x: number, z: number) => number;

  // Smooth camera position
  private cameraPos = new THREE.Vector3();
  // Reusable vectors for collision (avoid per-frame allocations)
  private _collCurrent = new THREE.Vector3();
  private _collDesired = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    getHeightAt?: (x: number, z: number) => number,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.getHeightAt = getHeightAt ?? (() => 0);

    // Initialise camera behind player
    this.cameraPos.copy(this.computeCameraTarget());

    this.initPointerLock();
    this.initKeyboard();
    this.initMouseWheel();
  }

  // ----------------------------------------------------------------
  //  Pointer Lock
  // ----------------------------------------------------------------

  private initPointerLock(): void {
    this.domElement.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        this.domElement.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
    });

    document.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isPointerLocked) return;
      this.yaw -= e.movementX * this.mouseSensitivity;
      this.pitch -= e.movementY * this.mouseSensitivity;
      this.pitch = clamp(this.pitch, -80 * THREE.MathUtils.DEG2RAD, 80 * THREE.MathUtils.DEG2RAD);
    });
  }

  // ----------------------------------------------------------------
  //  Keyboard
  // ----------------------------------------------------------------

  private initKeyboard(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e: KeyboardEvent) => {
      this.keys[e.code] = false;
    });
  }

  // ----------------------------------------------------------------
  //  Mouse Wheel (zoom)
  // ----------------------------------------------------------------

  private initMouseWheel(): void {
    this.domElement.addEventListener('wheel', (e: WheelEvent) => {
      this.zoomDistance += e.deltaY * 0.01;
      this.zoomDistance = clamp(this.zoomDistance, this.zoomMin, this.zoomMax);
    }, { passive: true });
  }

  // ----------------------------------------------------------------
  //  Water collision helpers
  // ----------------------------------------------------------------

  /**
   * Returns how far the terrain at (x, z) is above the wading threshold.
   * Positive = safely above water, negative = below water.
   */
  private terrainWaterMargin(x: number, z: number): number {
    const terrainY = this.getHeightAt(x, z);
    const wadingLevel = Water.getWaterLevel() + this.wadingOffset;
    return terrainY - wadingLevel;
  }

  // ----------------------------------------------------------------
  //  Collision
  // ----------------------------------------------------------------

  setCollisionSystem(system: CollisionSystem, scene: THREE.Scene): void {
    this.collisionSystem = system;
    this.scene = scene;
  }

  // ----------------------------------------------------------------
  //  Update (call once per frame)
  // ----------------------------------------------------------------

  /** The horizontal velocity from the last frame (useful for Player model). */
  public readonly velocity = new THREE.Vector3();

  update(delta: number): void {
    // --- Gather input ---
    const forward = (this.keys['KeyW'] ? 1 : 0) - (this.keys['KeyS'] ? 1 : 0);
    const strafe = (this.keys['KeyA'] ? 1 : 0) - (this.keys['KeyD'] ? 1 : 0);
    const running = !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'];
    let speed = running ? this.runSpeed : this.walkSpeed;

    // Direction relative to camera yaw
    const moveAngle = this.yaw;
    const sinYaw = Math.sin(moveAngle);
    const cosYaw = Math.cos(moveAngle);

    // --- Water proximity slow-down ---
    const currentMargin = this.terrainWaterMargin(this.position.x, this.position.z);
    if (currentMargin < this.waterSlowRange && currentMargin >= 0) {
      // Linearly blend from full speed to waterSlowFactor as we approach water
      const t = currentMargin / this.waterSlowRange; // 1 = far, 0 = at edge
      speed *= lerp(this.waterSlowFactor, 1.0, t);
    }

    const dx = (forward * sinYaw + strafe * cosYaw) * speed;
    const dz = (forward * cosYaw - strafe * sinYaw) * speed;

    // --- Candidate position ---
    const prevX = this.position.x;
    const prevZ = this.position.z;
    const candidateX = this.position.x + dx * delta;
    const candidateZ = this.position.z + dz * delta;

    // --- Water collision: prevent walking into deep water ---
    const marginAtCandidate = this.terrainWaterMargin(candidateX, candidateZ);

    if (marginAtCandidate >= 0) {
      // Candidate is above water — allow full movement
      this.position.x = candidateX;
      this.position.z = candidateZ;
    } else {
      // Try sliding along each axis independently (walk along the edge)
      const marginX = this.terrainWaterMargin(candidateX, this.position.z);
      const marginZ = this.terrainWaterMargin(this.position.x, candidateZ);

      if (marginX >= 0) {
        this.position.x = candidateX;
      }
      if (marginZ >= 0) {
        this.position.z = candidateZ;
      }
      // If both axes would put us in water, we simply don't move.
    }

    // --- Obstacle collision: raycast-based resolution ---
    if (this.collisionSystem && this.scene) {
      try {
        const currentVec = this._collCurrent;
        const desiredVec = this._collDesired;
        currentVec.set(prevX, this.position.y, prevZ);
        desiredVec.set(this.position.x, this.position.y, this.position.z);
        const resolved = this.collisionSystem.resolveMovement(currentVec, desiredVec, this.scene);
        this.position.x = resolved.x;
        this.position.z = resolved.z;
      } catch {
        // If collision fails, allow movement (don't crash the loop)
      }
    }

    this.velocity.set(dx, 0, dz);

    // --- Jump / Gravity ---
    if (this.keys['Space'] && this.isGrounded) {
      this.verticalVelocity = this.jumpVelocity;
      this.isGrounded = false;
    }

    const terrainY = this.getHeightAt(this.position.x, this.position.z);
    const waterLevel = Water.getWaterLevel();

    if (!this.isGrounded) {
      this.verticalVelocity += this.gravity * delta;
      this.position.y += this.verticalVelocity * delta;
      // Land on terrain
      if (this.position.y <= terrainY) {
        this.position.y = terrainY;
        this.verticalVelocity = 0;
        this.isGrounded = true;
      }
    } else {
      this.position.y = terrainY;
    }

    // Hard clamp: player must never go below water level
    if (this.position.y < waterLevel) {
      this.position.y = waterLevel;
    }

    // --- Third-person camera ---
    const target = this.computeCameraTarget();
    const lerpFactor = 1 - Math.pow(0.001, delta); // smooth follow
    this.cameraPos.lerp(target, lerpFactor);
    this.camera.position.copy(this.cameraPos);

    // Look at a point slightly above the player
    const lookTarget = this.position.clone();
    lookTarget.y += 1.5;
    this.camera.lookAt(lookTarget);
  }

  /** Whether the player is currently moving horizontally. */
  get isMoving(): boolean {
    return this.velocity.lengthSq() > 0.01;
  }

  // ----------------------------------------------------------------
  //  Helpers
  // ----------------------------------------------------------------

  private computeCameraTarget(): THREE.Vector3 {
    // Offset behind player, rotated by yaw and pitched
    const offset = new THREE.Vector3(0, this.cameraHeight, -this.zoomDistance);
    // Apply pitch
    const pitchQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      this.pitch,
    );
    offset.applyQuaternion(pitchQ);
    // Apply yaw
    const yawQ = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.yaw,
    );
    offset.applyQuaternion(yawQ);

    return new THREE.Vector3(
      this.position.x + offset.x,
      this.position.y + offset.y,
      this.position.z + offset.z,
    );
  }
}
