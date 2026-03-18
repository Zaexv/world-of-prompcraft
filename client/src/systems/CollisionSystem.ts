/**
 * Raycaster-based collision detection and resolution.
 *
 * Casts short rays in the movement direction at three heights (feet, waist, head)
 * to detect obstacles. Supports axis-separated sliding when full movement is blocked.
 * Works with any mesh geometry — no bounding-box approximation needed.
 */

import * as THREE from 'three';

export class CollisionSystem {
  private collidables: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private playerRadius = 0.5;
  private playerHeight = 2.0;

  /** Heights (relative to player base) at which rays are cast. */
  private readonly rayHeights = [0.2, 1.0, 1.8]; // feet, waist, head
  /** Extra clearance added beyond playerRadius when checking hits. */
  private readonly clearance = 0.2;
  /** Frame counter for throttling — only check every N frames. */
  private frameCount = 0;
  private readonly checkInterval = 3;

  // Reusable vectors to avoid per-frame allocations
  private _direction = new THREE.Vector3();
  private _origin = new THREE.Vector3();
  private _xOnly = new THREE.Vector3();
  private _zOnly = new THREE.Vector3();
  private _result = new THREE.Vector3();

  /** Register a single object (and its children) as collidable. */
  addCollidable(obj: THREE.Object3D): void {
    this.collidables.push(obj);
  }

  /** Register multiple objects as collidable. */
  addCollidables(objs: THREE.Object3D[]): void {
    for (const obj of objs) {
      this.collidables.push(obj);
    }
  }

  /**
   * Cast rays in the movement direction from the given position.
   * Returns true if any ray hits a collidable within the stop distance.
   */
  private isBlocked(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    moveDistance: number,
  ): boolean {
    const maxDist = moveDistance + this.playerRadius + this.clearance;

    for (const h of this.rayHeights) {
      this._origin.set(origin.x, origin.y + h, origin.z);
      this.raycaster.set(this._origin, direction);
      this.raycaster.far = maxDist;
      this.raycaster.near = 0;

      const hits = this.raycaster.intersectObjects(this.collidables, true);
      if (hits.length > 0 && hits[0].distance < maxDist) {
        return true;
      }
    }
    return false;
  }

  /**
   * Resolve a movement from `currentPos` to `desiredPos`, returning the
   * furthest safe position. If the full movement is blocked, tries sliding
   * along each axis independently.
   */
  resolveMovement(
    currentPos: THREE.Vector3,
    desiredPos: THREE.Vector3,
    _scene: THREE.Scene,
  ): THREE.Vector3 {
    if (this.collidables.length === 0) {
      return this._result.copy(desiredPos);
    }

    // Throttle: only run raycasts every N frames for performance
    this.frameCount++;
    if (this.frameCount > 10000) this.frameCount = 0;
    if (this.frameCount % this.checkInterval !== 0) {
      return this._result.copy(desiredPos);
    }

    const dx = desiredPos.x - currentPos.x;
    const dz = desiredPos.z - currentPos.z;
    const moveDistance = Math.sqrt(dx * dx + dz * dz);

    // No meaningful movement — skip raycasting
    if (moveDistance < 0.0001) {
      return this._result.copy(desiredPos);
    }

    // --- Try full movement ---
    this._direction.set(dx, 0, dz).normalize();

    if (!this.isBlocked(currentPos, this._direction, moveDistance)) {
      return this._result.copy(desiredPos);
    }

    // --- Full movement blocked: try X-only sliding ---
    let resultX = currentPos.x;
    let resultZ = currentPos.z;

    if (Math.abs(dx) > 0.0001) {
      this._xOnly.set(dx, 0, 0).normalize();
      if (!this.isBlocked(currentPos, this._xOnly, Math.abs(dx))) {
        resultX = desiredPos.x;
      }
    }

    // --- Try Z-only sliding ---
    if (Math.abs(dz) > 0.0001) {
      this._zOnly.set(0, 0, dz).normalize();
      if (!this.isBlocked(currentPos, this._zOnly, Math.abs(dz))) {
        resultZ = desiredPos.z;
      }
    }

    return this._result.set(resultX, desiredPos.y, resultZ);
  }
}
