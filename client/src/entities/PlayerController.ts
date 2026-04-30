import * as THREE from 'three';
import { clamp, lerp } from '../utils/MathHelpers';
import { Water } from '../scene/Water';
import { CollisionSystem } from '../systems/CollisionSystem';

/**
 * First/Third-person player controller with pointer-lock mouse look,
 * WASD movement, jumping, swimming, and third-person camera follow.
 *
 * When terrain drops below water level the player transitions to swimming:
 * reduced speed, buoyancy instead of gravity, and a different animation state.
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
  /** Whether the player is currently swimming. */
  public isSwimming = false;

  // --- Movement ---
  private readonly walkSpeed = 8;
  private readonly runSpeed = 16;
  private readonly jumpVelocity = 10;
  private readonly gravity = -20;
  private verticalVelocity = 0;
  private isGrounded = true;

  // --- Swimming ---
  private readonly swimSpeed = 5;
  private readonly swimSprintSpeed = 8;
  /** How far below water surface the player floats (0 = surface). */
  private readonly swimDepth = 0.4;
  /** Buoyancy force pulling the player toward the surface. */
  private readonly buoyancy = 12;
  /** Gravity while swimming (weaker). */
  private readonly swimGravity = -5;
  /** Vertical impulse when pressing space while swimming (swim upward). */
  private readonly swimUpSpeed = 4;

  // --- Water proximity ---
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
  //  Water helpers
  // ----------------------------------------------------------------

  /**
   * Returns how far the terrain at (x, z) is above water level.
   * Positive = above water, negative = submerged terrain.
   */
  private terrainWaterMargin(x: number, z: number): number {
    const terrainY = this.getHeightAt(x, z);
    return terrainY - Water.getWaterLevel();
  }

  /** Whether the terrain at (x, z) is below the water surface. */
  private isWaterAt(x: number, z: number): boolean {
    return this.getHeightAt(x, z) < Water.getWaterLevel();
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

    const waterLevel = Water.getWaterLevel();
    const terrainHere = this.getHeightAt(this.position.x, this.position.z);
    const inWater = terrainHere < waterLevel;

    // Determine swimming state
    this.isSwimming = inWater;

    let speed: number;
    if (this.isSwimming) {
      speed = running ? this.swimSprintSpeed : this.swimSpeed;
    } else {
      speed = running ? this.runSpeed : this.walkSpeed;

      // Water proximity slow-down (only on land near water edges)
      const currentMargin = this.terrainWaterMargin(this.position.x, this.position.z);
      if (currentMargin < this.waterSlowRange && currentMargin >= 0) {
        const t = currentMargin / this.waterSlowRange;
        speed *= lerp(this.waterSlowFactor, 1.0, t);
      }
    }

    // Direction relative to camera yaw
    const moveAngle = this.yaw;
    const sinYaw = Math.sin(moveAngle);
    const cosYaw = Math.cos(moveAngle);

    const dx = (forward * sinYaw + strafe * cosYaw) * speed;
    const dz = (forward * cosYaw - strafe * sinYaw) * speed;

    // --- Candidate position ---
    const prevX = this.position.x;
    const prevZ = this.position.z;
    this.position.x += dx * delta;
    this.position.z += dz * delta;

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

    // --- Vertical movement ---
    const terrainY = this.getHeightAt(this.position.x, this.position.z);
    const swimSurface = waterLevel - this.swimDepth;

    if (this.isSwimming) {
      // Swimming physics: buoyancy + gentle gravity
      this.isGrounded = false;

      // Space = swim upward, otherwise gentle sink
      if (this.keys['Space']) {
        this.verticalVelocity = this.swimUpSpeed;
      } else {
        // Apply gentle gravity + buoyancy toward the swim surface
        this.verticalVelocity += this.swimGravity * delta;

        // Buoyancy: pull toward the swim surface level
        const distFromSurface = this.position.y - swimSurface;
        this.verticalVelocity -= distFromSurface * this.buoyancy * delta;

        // Damping so the player doesn't oscillate forever
        this.verticalVelocity *= (1 - 3 * delta);
      }

      this.position.y += this.verticalVelocity * delta;

      // Clamp: don't float above swim surface, don't go below terrain
      if (this.position.y > swimSurface) {
        this.position.y = swimSurface;
        this.verticalVelocity = Math.min(this.verticalVelocity, 0);
      }
      if (this.position.y < terrainY) {
        this.position.y = terrainY;
        this.verticalVelocity = 0;
      }
    } else {
      // Normal land physics
      if (this.keys['Space'] && this.isGrounded) {
        this.verticalVelocity = this.jumpVelocity;
        this.isGrounded = false;
      }

      if (!this.isGrounded) {
        this.verticalVelocity += this.gravity * delta;
        this.position.y += this.verticalVelocity * delta;
        if (this.position.y <= terrainY) {
          this.position.y = terrainY;
          this.verticalVelocity = 0;
          this.isGrounded = true;
        }
      } else {
        this.position.y = terrainY;
      }
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

  // Reusable objects for camera computation (avoid per-frame allocations)
  private _camOffset = new THREE.Vector3();
  private _camPitchQ = new THREE.Quaternion();
  private _camYawQ = new THREE.Quaternion();
  private _camTarget = new THREE.Vector3();
  private static readonly _pitchAxis = new THREE.Vector3(1, 0, 0);
  private static readonly _yawAxis = new THREE.Vector3(0, 1, 0);
  /** Minimum clearance above terrain for the camera. */
  private readonly cameraTerrainClearance = 1.5;
  /** Number of sample points along the player→camera ray for terrain collision. */
  private readonly cameraRaySamples = 8;

  private computeCameraTarget(): THREE.Vector3 {
    // Offset behind player, rotated by yaw and pitched
    this._camOffset.set(0, this.cameraHeight, -this.zoomDistance);
    this._camPitchQ.setFromAxisAngle(PlayerController._pitchAxis, this.pitch);
    this._camOffset.applyQuaternion(this._camPitchQ);
    this._camYawQ.setFromAxisAngle(PlayerController._yawAxis, this.yaw);
    this._camOffset.applyQuaternion(this._camYawQ);

    this._camTarget.set(
      this.position.x + this._camOffset.x,
      this.position.y + this._camOffset.y,
      this.position.z + this._camOffset.z,
    );

    // --- Terrain collision along player→camera ray ---
    // Sample terrain heights between the player and the desired camera position.
    // If terrain is above the ray at any sample, pull the camera closer to the player.
    const playerHeadY = this.position.y + this.cameraHeight;
    let safeFraction = 1.0;
    for (let i = 1; i <= this.cameraRaySamples; i++) {
      const t = i / this.cameraRaySamples;
      const sampleX = this.position.x + this._camOffset.x * t;
      const sampleZ = this.position.z + this._camOffset.z * t;
      const sampleY = this.position.y + this._camOffset.y * t;
      const terrainY = this.getHeightAt(sampleX, sampleZ) + this.cameraTerrainClearance;
      if (sampleY < terrainY) {
        // This sample is underground — pull camera to just before this point
        const prevT = (i - 1) / this.cameraRaySamples;
        safeFraction = Math.min(safeFraction, Math.max(prevT, 0.1));
        break;
      }
    }

    if (safeFraction < 1.0) {
      this._camTarget.set(
        this.position.x + this._camOffset.x * safeFraction,
        playerHeadY + (this._camOffset.y - this.cameraHeight) * safeFraction,
        this.position.z + this._camOffset.z * safeFraction,
      );
    }

    // Final clamp: ensure camera is always above terrain at its final position
    const terrainAtCamera = this.getHeightAt(this._camTarget.x, this._camTarget.z);
    const minY = terrainAtCamera + this.cameraTerrainClearance;
    if (this._camTarget.y < minY) {
      this._camTarget.y = minY;
    }

    return this._camTarget;
  }
}
