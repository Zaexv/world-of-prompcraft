import * as THREE from 'three';
import { clamp, lerp } from '../utils/math/MathHelpers';
import { Water } from '../scene/Water';
import { CollisionSystem } from '../systems/CollisionSystem';
import { CapsuleController } from '../systems/collision/CapsuleController';
import { Capsule } from '../systems/collision/Capsule';

/**
 * Third-person player controller with WoW-style orbit camera:
 * left/right mouse drag to rotate, wheel zoom, WASD movement.
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
  
  // --- Physics ---
  private capsuleController = new CapsuleController();
  private capsule = new Capsule(
    new THREE.Vector3(0, 0.35, 0),
    new THREE.Vector3(0, 1.45, 0),
    0.35
  );

  // --- Swimming ---
  private readonly swimSpeed = 5;
  private readonly swimSprintSpeed = 8;
  private readonly swimDepth = 0.4;
  private readonly buoyancy = 12;
  private readonly swimGravity = -5;
  private readonly swimUpSpeed = 4;
  private verticalVelocity = 0;

  // --- Water proximity ---
  private readonly waterSlowRange = 1.5;
  private readonly waterSlowFactor = 0.6;

  // --- Collision ---
  private collisionSystem: CollisionSystem | null = null;

  // --- Camera ---
  private zoomDistance = 10;
  private readonly zoomMin = 2;
  private readonly zoomMax = 20;
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

  private cameraPos = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    domElement: HTMLElement,
    getHeightAt?: (x: number, z: number) => number,
  ) {
    this.camera = camera;
    this.domElement = domElement;
    this.getHeightAt = getHeightAt ?? (() => 0);

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

  setCollisionSystem(system: CollisionSystem): void {
    this.collisionSystem = system;
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

    this.velocity.set(dx, 0, dz);

    if (this.isSwimming) {
      // --- Swimming Physics (Legacy) ---
      const swimSurface = waterLevel - this.swimDepth;

      if (this.keys['Space']) {
        this.verticalVelocity = this.swimUpSpeed;
      } else {
        this.verticalVelocity += this.swimGravity * delta;
        const distFromSurface = this.position.y - swimSurface;
        this.verticalVelocity -= distFromSurface * this.buoyancy * delta;
        this.verticalVelocity *= (1 - 3 * delta);
      }

      this.position.x += dx * delta;
      this.position.z += dz * delta;
      this.position.y += this.verticalVelocity * delta;

      // Clamp: don't float above swim surface, don't go below terrain
      if (this.position.y > swimSurface) {
        this.position.y = swimSurface;
        this.verticalVelocity = Math.min(this.verticalVelocity, 0);
      }
      if (this.position.y < terrainHere) {
        this.position.y = terrainHere;
        this.verticalVelocity = 0;
      }

      // Sync capsule for when we exit water
      this.capsule.set(
        new THREE.Vector3(this.position.x, this.position.y + 0.35, this.position.z),
        new THREE.Vector3(this.position.x, this.position.y + 1.45, this.position.z),
        0.35
      );
      this.capsuleController.resetVerticalVelocity();
    } else {
      // --- Kinematic Capsule Physics ---
      const moveVec = new THREE.Vector3(dx, 0, dz);
      const meshes = this.collisionSystem?.getStaticMeshes() ?? [];
      
      // Sync capsule position to current player position
      this.capsule.set(
        new THREE.Vector3(this.position.x, this.position.y + 0.35, this.position.z),
        new THREE.Vector3(this.position.x, this.position.y + 1.45, this.position.z),
        0.35
      );

      if (this.keys['Space']) {
        this.capsuleController.jump(this.jumpVelocity);
      }

      this.capsuleController.update(this.capsule, moveVec, delta, meshes);
      
      // Update player position from capsule (start.y is feet + radius)
      this.position.set(
        this.capsule.start.x,
        this.capsule.start.y - 0.35,
        this.capsule.start.z
      );

      // Force terrain floor if no meshes are present or grounded is false but we are below terrain
      const currentTerrainY = this.getHeightAt(this.position.x, this.position.z);
      if (this.position.y < currentTerrainY) {
        this.position.y = currentTerrainY;
        this.capsuleController.isGrounded = true;
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
