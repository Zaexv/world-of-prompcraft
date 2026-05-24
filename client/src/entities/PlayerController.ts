import * as THREE from 'three';
import { clamp, lerp } from '../utils/MathHelpers';
import { Water } from '../scene/Water';
import { CollisionSystem } from '../systems/CollisionSystem';

/**
 * Third-person player controller with WoW-style orbit camera:
 * left/right mouse drag to rotate, wheel zoom, WASD movement.
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
  /** Whether the camera is currently being rotated by mouse drag. */
  public isRotatingCamera = false;
  /** Character-facing override while RMB orbit is active. */
  public facingYawOverride: number | null = null;
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
  private zoomDistance = 10;
  private readonly zoomMin = 2;
  private readonly zoomMax = 20;
  /** Height above character feet for the orbit center (character head). */
  private readonly lookAtHeight = 1.7;

  // --- Input state ---
  private keys: Record<string, boolean> = {};
  private mouseSensitivity = 0.0032;
  private readonly minPitch = -75 * THREE.MathUtils.DEG2RAD;
  private readonly maxPitch = 80 * THREE.MathUtils.DEG2RAD;
  private activeOrbitButton: 0 | 2 | null = null;
  private pendingOrbitButton: 0 | 2 | null = null;
  private dragDistance = 0;
  private pointerLocked = false;

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

    // Initialise camera at desired orbit position
    this.cameraPos.copy(this.computeCameraTarget(0));
    this.effectiveDistance = this.zoomDistance;

    this.initMouseOrbit();
    this.initKeyboard();
    this.initMouseWheel();
  }

  // ----------------------------------------------------------------
  //  Mouse orbit
  // ----------------------------------------------------------------

  private initMouseOrbit(): void {
    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.domElement;
      if (!this.pointerLocked && this.isRotatingCamera) {
        this.endOrbitDrag();
      }
    });

    this.domElement.addEventListener('contextmenu', (e: MouseEvent) => {
      e.preventDefault();
    });

    this.domElement.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 2) return;
      if (e.button === 2) e.preventDefault();
      this.pendingOrbitButton = e.button as 0 | 2;
      this.dragDistance = 0;
    });

    window.addEventListener('mouseup', (e: MouseEvent) => {
      if (this.isRotatingCamera) {
        if (this.activeOrbitButton !== e.button) return;
        this.endOrbitDrag();
        if (this.pointerLocked && document.pointerLockElement === this.domElement) {
          document.exitPointerLock();
        }
        return;
      }

      // Not a drag, so preserve normal click behavior (NPC selection).
      if (this.pendingOrbitButton === e.button) {
        this.pendingOrbitButton = null;
      }
    });

    window.addEventListener('blur', () => {
      this.endOrbitDrag();
      this.pendingOrbitButton = null;
      if (this.pointerLocked && document.pointerLockElement === this.domElement) {
        document.exitPointerLock();
      }
    });

    window.addEventListener('mousemove', (e: MouseEvent) => {
      if (!this.isRotatingCamera && this.pendingOrbitButton !== null) {
        this.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
        if (this.dragDistance > 2) {
          this.activeOrbitButton = this.pendingOrbitButton;
          this.pendingOrbitButton = null;
          this.isRotatingCamera = true;
          this.domElement.dataset.cameraDrag = '1';
          this.domElement.style.cursor = 'none';
          this.domElement.requestPointerLock();
        }
      }
      if (!this.isRotatingCamera) return;
      this.dragDistance += Math.abs(e.movementX) + Math.abs(e.movementY);
      this.yaw -= e.movementX * this.mouseSensitivity;
      this.pitch -= e.movementY * this.mouseSensitivity;
      this.pitch = clamp(this.pitch, this.minPitch, this.maxPitch);
      if (this.activeOrbitButton === 2) {
        this.facingYawOverride = this.yaw;
      }
    });
  }

  private endOrbitDrag(): void {
    this.isRotatingCamera = false;
    this.activeOrbitButton = null;
    this.pendingOrbitButton = null;
    this.facingYawOverride = null;
    if (this.dragDistance > 2) {
      this.domElement.dataset.justCameraDragged = String(performance.now());
    }
    this.domElement.dataset.cameraDrag = '0';
    this.domElement.style.cursor = '';
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

    // --- Third-person camera (WoW-style) ---
    const target = this.computeCameraTarget(delta);
    const lerpFactor = 1 - Math.pow(0.001, delta);
    this.cameraPos.lerp(target, lerpFactor);
    this.camera.position.copy(this.cameraPos);

    // Look at the orbit center (character head)
    this._lookTarget.set(
      this.position.x,
      this.position.y + this.lookAtHeight,
      this.position.z,
    );
    this.camera.lookAt(this._lookTarget);
  }

  /** Whether the player is currently moving horizontally. */
  get isMoving(): boolean {
    return this.velocity.lengthSq() > 0.01;
  }

  // ----------------------------------------------------------------
  //  Helpers
  // ----------------------------------------------------------------

  // Reusable objects for camera computation (avoid per-frame allocations)
  private _camTarget = new THREE.Vector3();
  private _lookTarget = new THREE.Vector3();
  private _rayOrigin = new THREE.Vector3();
  private _rayDir = new THREE.Vector3();
  private _raycaster = new THREE.Raycaster();
  /** Minimum clearance above terrain for the camera. */
  private readonly cameraTerrainClearance = 0.5;
  /** Buffer distance from raycast hit to prevent Z-fighting. */
  private readonly cameraCollisionBuffer = 0.3;
  /** Smoothed effective distance — WoW: instant pull-in, smooth pull-out. */
  private effectiveDistance = 10;

  /**
   * WoW-style third-person camera.
   *
   * 1. Orbit center is the character's head (position + lookAtHeight).
   * 2. Camera offset = spherical arm from pitch/yaw, length = zoomDistance.
   * 3. Collision check:
   *    a. Binary-search terrain height along the ray.
   *    b. Three.js Raycaster against all collidable scene objects.
   *    c. Take the shorter of the two distances.
   * 4. Smoothing:
   *    - **Instant pull-in** when obstructed (camera never clips).
   *    - **Smooth pull-out** when obstruction clears (~0.5s ease).
   */
  private computeCameraTarget(delta: number): THREE.Vector3 {
    // Orbit center: character head
    const orbitY = this.position.y + this.lookAtHeight;
    this._rayOrigin.set(this.position.x, orbitY, this.position.z);

    // WoW-like orbit direction from yaw/pitch and zoom distance.
    const cosPitch = Math.cos(this.pitch);
    const armLength = this.zoomDistance;
    this._rayDir.set(
      -Math.sin(this.yaw) * cosPitch,
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * cosPitch,
    ).normalize();

    // ── Collision: find max allowed distance ────────────────────────────

    let maxDist = armLength;

    // (a) Terrain collision — binary search along the arm
    {
      let lo = 0;
      let hi = armLength;
      for (let iter = 0; iter < 6; iter++) {
        const mid = (lo + hi) / 2;
        const sx = this._rayOrigin.x + this._rayDir.x * mid;
        const sz = this._rayOrigin.z + this._rayDir.z * mid;
        const sy = this._rayOrigin.y + this._rayDir.y * mid;
        const terrainY = this.getHeightAt(sx, sz) + this.cameraTerrainClearance;
        if (sy >= terrainY) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      maxDist = Math.min(maxDist, lo);
    }

    // (b) Object collision — raycast against collidable meshes
    if (this.collisionSystem) {
      const collidables = this.collisionSystem.getCollidableObjects();
      if (collidables.length > 0) {
        this._raycaster.set(this._rayOrigin, this._rayDir);
        this._raycaster.far = armLength;
        this._raycaster.near = 0;
        const hits = this._raycaster.intersectObjects(collidables, true);
        if (hits.length > 0) {
          maxDist = Math.min(maxDist, hits[0].distance - this.cameraCollisionBuffer);
        }
      }
    }

    // Minimum distance so camera doesn't end up inside the character
    maxDist = Math.max(maxDist, this.zoomMin * 0.5);

    // ── WoW-style distance smoothing ────────────────────────────────────
    // Pull-in is instant — camera must never clip through geometry.
    // Pull-out is smooth — camera eases back to the desired distance.
    if (maxDist < this.effectiveDistance) {
      // Instant pull-in (WoW behaviour)
      this.effectiveDistance = maxDist;
    } else {
      // Smooth pull-out: exponential ease toward maxDist
      const returnSpeed = 3.0;
      this.effectiveDistance += (maxDist - this.effectiveDistance)
        * (1 - Math.exp(-returnSpeed * delta));
    }

    // ── Final camera position ───────────────────────────────────────────
    this._camTarget.set(
      this._rayOrigin.x + this._rayDir.x * this.effectiveDistance,
      this._rayOrigin.y + this._rayDir.y * this.effectiveDistance,
      this._rayOrigin.z + this._rayDir.z * this.effectiveDistance,
    );

    // Hard floor: camera must be above terrain at its landing position
    const terrainAtCamera = this.getHeightAt(this._camTarget.x, this._camTarget.z);
    const minY = terrainAtCamera + this.cameraTerrainClearance;
    if (this._camTarget.y < minY) {
      this._camTarget.y = minY;
    }

    return this._camTarget;
  }
}
