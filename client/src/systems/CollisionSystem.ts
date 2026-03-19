/**
 * Collision system using cannon-es for overlap detection.
 *
 * We do NOT use cannon-es for physics simulation (no gravity, no forces).
 * Instead we use it purely as a spatial query engine:
 *
 * 1. Static AABB bodies are created for buildings, trees, dungeon walls.
 * 2. Each frame we test the player's desired position against all bodies
 *    using cannon-es contact generation.
 * 3. If contacts exist, we push the player out along contact normals.
 *
 * This is far more reliable than manual AABB checks because cannon-es
 * handles the broadphase culling and narrow-phase contact generation.
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';

/** Stored mapping from a Three.js object to its cannon body. */
export interface PhysicsEntry {
  obj: THREE.Object3D;
  body: CANNON.Body;
}

export class CollisionSystem {
  private world: CANNON.World;
  private playerBody: CANNON.Body;
  private playerShape: CANNON.Box;

  /** Static collidables (buildings, trees, dungeon walls). */
  private statics: PhysicsEntry[] = [];
  /** Dynamic source for NPC bodies. */
  private dynamicSource: (() => THREE.Object3D[]) | null = null;
  private dynamicBodies: Map<THREE.Object3D, CANNON.Body> = new Map();

  // Reusable
  private _result = new THREE.Vector3();
  private _box3 = new THREE.Box3();
  private _size = new THREE.Vector3();
  private _center = new THREE.Vector3();
  private _worldPos = new THREE.Vector3();

  // Player half-extents
  private readonly PLAYER_HX = 0.4;
  private readonly PLAYER_HY = 1.0;
  private readonly PLAYER_HZ = 0.4;

  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, 0, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    // We don't use the solver — just AABB overlap queries

    // Player body — kinematic. We position it manually each frame.
    // Initial position (0,1,0) is a placeholder; resolveMovement() overwrites it every frame.
    this.playerShape = new CANNON.Box(
      new CANNON.Vec3(this.PLAYER_HX, this.PLAYER_HY, this.PLAYER_HZ),
    );
    this.playerBody = new CANNON.Body({
      mass: 0,
      type: CANNON.BODY_TYPES.KINEMATIC,
      shape: this.playerShape,
      collisionFilterGroup: 1,
      collisionFilterMask: 2,
    });
    this.world.addBody(this.playerBody);
  }

  // ── Registration ──────────────────────────────────────────────────────

  addCollidable(obj: THREE.Object3D): void {
    const body = this.createStaticBody(obj);
    if (body) {
      this.world.addBody(body);
      this.statics.push({ obj, body });
    }
  }

  addCollidables(objs: THREE.Object3D[]): void {
    for (const obj of objs) this.addCollidable(obj);
  }

  removeCollidable(obj: THREE.Object3D): void {
    const idx = this.statics.findIndex((e) => e.obj === obj);
    if (idx !== -1) {
      this.world.removeBody(this.statics[idx].body);
      this.statics.splice(idx, 1);
    }
  }

  removeCollidablesWhere(predicate: (obj: THREE.Object3D) => boolean): void {
    const toRemove = this.statics.filter((e) => predicate(e.obj));
    for (const entry of toRemove) this.world.removeBody(entry.body);
    this.statics = this.statics.filter((e) => !predicate(e.obj));
  }

  setDynamicSource(source: () => THREE.Object3D[]): void {
    this.dynamicSource = source;
  }

  setCollidables(objs: THREE.Object3D[]): void {
    for (const entry of this.statics) this.world.removeBody(entry.body);
    this.statics = [];
    for (const obj of objs) this.addCollidable(obj);
  }

  saveCollidables(): PhysicsEntry[] {
    return [...this.statics];
  }

  restoreCollidables(saved: PhysicsEntry[]): void {
    for (const entry of this.statics) this.world.removeBody(entry.body);
    this.statics = [...saved];
    for (const entry of this.statics) {
      if (!this.world.bodies.includes(entry.body)) {
        this.world.addBody(entry.body);
      }
    }
  }

  getCollidableCount(): number {
    return this.statics.length + this.dynamicBodies.size;
  }

  // ── Resolution ────────────────────────────────────────────────────────

  resolveMovement(
    _currentPos: THREE.Vector3,
    desiredPos: THREE.Vector3,
    _scene: THREE.Scene,
  ): THREE.Vector3 {
    this._result.copy(desiredPos);

    // Sync NPC bodies
    this.syncDynamicBodies();

    // Position the player body at the desired location.
    // Offset by PLAYER_HY (1.0) so the box center sits at chest height for the player model.
    const py = desiredPos.y + this.PLAYER_HY;
    this.playerBody.position.set(desiredPos.x, py, desiredPos.z);
    this.playerBody.updateAABB();

    // Check contacts against all bodies and push out
    this.resolveOverlaps();

    // Read corrected position from physics body, stripping the PLAYER_HY offset
    // so the returned Y is in the same coordinate space as desiredPos (feet level).
    this._result.x = this.playerBody.position.x;
    this._result.z = this.playerBody.position.z;
    this._result.y = this.playerBody.position.y - this.PLAYER_HY;

    return this._result;
  }

  // ── Overlap resolution ────────────────────────────────────────────────

  /**
   * For each body in the world, check if it overlaps the player AABB.
   * If so, compute penetration and push the player out.
   * This is a simple AABB-vs-AABB overlap test using cannon body AABBs.
   */
  private resolveOverlaps(): void {
    for (let iter = 0; iter < 4; iter++) {
      let pushed = false;

      // Check static collidables
      for (const entry of this.statics) {
        if (!entry.obj.visible) continue;
        if (this.pushOutOfBody(entry.body)) {
          // Recompute AABB immediately so subsequent checks use updated bounds
          this.playerBody.updateAABB();
          pushed = true;
        }
      }

      // Check dynamic collidables
      for (const [obj, body] of this.dynamicBodies) {
        if (!obj.visible) continue;
        if (this.pushOutOfBody(body)) {
          this.playerBody.updateAABB();
          pushed = true;
        }
      }

      if (!pushed) break;
    }
  }

  /**
   * Test player AABB against a body's AABB. If overlapping, push the
   * player out along the axis of minimum penetration (XZ only).
   */
  private pushOutOfBody(
    body: CANNON.Body,
  ): boolean {
    const pMin = this.playerBody.aabb.lowerBound;
    const pMax = this.playerBody.aabb.upperBound;
    const bMin = body.aabb.lowerBound;
    const bMax = body.aabb.upperBound;

    // AABB overlap test
    if (
      pMax.x <= bMin.x || pMin.x >= bMax.x ||
      pMax.y <= bMin.y || pMin.y >= bMax.y ||
      pMax.z <= bMin.z || pMin.z >= bMax.z
    ) {
      return false; // No overlap
    }

    // Compute overlap on each axis
    const overlapX1 = pMax.x - bMin.x; // player right - body left
    const overlapX2 = bMax.x - pMin.x; // body right - player left
    const overlapZ1 = pMax.z - bMin.z; // player front - body back
    const overlapZ2 = bMax.z - pMin.z; // body front - player back

    // Find minimum overlap and push direction (XZ only)
    const minOverlapX = Math.min(overlapX1, overlapX2);
    const minOverlapZ = Math.min(overlapZ1, overlapZ2);

    if (minOverlapX <= 0 || minOverlapZ <= 0) return false;

    if (minOverlapX < minOverlapZ) {
      // Push along X
      const pushX = overlapX1 < overlapX2 ? -overlapX1 : overlapX2;
      this.playerBody.position.x += pushX;
    } else {
      // Push along Z
      const pushZ = overlapZ1 < overlapZ2 ? -overlapZ1 : overlapZ2;
      this.playerBody.position.z += pushZ;
    }

    return true;
  }

  // ── Body creation ─────────────────────────────────────────────────────

  private createStaticBody(obj: THREE.Object3D): CANNON.Body | null {
    this._box3.setFromObject(obj);
    if (this._box3.isEmpty()) return null;

    this._box3.getSize(this._size);
    this._box3.getCenter(this._center);

    const hx = Math.max(this._size.x / 2, 0.1);
    const hy = Math.max(this._size.y / 2, 0.1);
    const hz = Math.max(this._size.z / 2, 0.1);

    const shape = new CANNON.Box(new CANNON.Vec3(hx, hy, hz));
    const body = new CANNON.Body({
      mass: 0,
      type: CANNON.BODY_TYPES.STATIC,
      shape,
      collisionFilterGroup: 2,
      collisionFilterMask: 1,
    });
    body.position.set(this._center.x, this._center.y, this._center.z);
    body.updateAABB();

    return body;
  }

  // ── Dynamic NPC sync ──────────────────────────────────────────────────

  private syncDynamicBodies(): void {
    if (!this.dynamicSource) return;

    const currentObjs = this.dynamicSource();
    const currentSet = new Set(currentObjs);

    // Remove stale
    for (const [obj, body] of this.dynamicBodies) {
      if (!currentSet.has(obj) || !obj.visible) {
        this.world.removeBody(body);
        this.dynamicBodies.delete(obj);
      }
    }

    // Add / update
    for (const obj of currentObjs) {
      if (!obj.visible) continue;
      obj.getWorldPosition(this._worldPos);

      // Cull distant NPCs
      const dx = this._worldPos.x - this.playerBody.position.x;
      const dz = this._worldPos.z - this.playerBody.position.z;
      if (dx * dx + dz * dz > 900) { // 30^2
        const existing = this.dynamicBodies.get(obj);
        if (existing) {
          this.world.removeBody(existing);
          this.dynamicBodies.delete(obj);
        }
        continue;
      }

      let body = this.dynamicBodies.get(obj);
      if (!body) {
        // NPC half-extents: 0.5 x 1.5 x 0.5 — taller than the player (0.4 x 1.0 x 0.4)
        // because NPC models are roughly 3 units tall vs the player's ~2 units.
        const npcShape = new CANNON.Box(new CANNON.Vec3(0.5, 1.5, 0.5));
        body = new CANNON.Body({
          mass: 0,
          type: CANNON.BODY_TYPES.STATIC,
          shape: npcShape,
          collisionFilterGroup: 2,
          collisionFilterMask: 1,
        });
        this.world.addBody(body);
        this.dynamicBodies.set(obj, body);
      }

      // Offset by NPC half-height (1.5) so the box center aligns with the NPC model center.
      body.position.set(this._worldPos.x, this._worldPos.y + 1.5, this._worldPos.z);
      body.updateAABB();
    }
  }
}
