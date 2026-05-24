/**
 * Collision system using swept AABB for movement resolution.
 *
 * Uses the standard game-industry approach:
 *
 * 1. Static AABB bodies are created for buildings, trees, dungeon walls.
 * 2. Each frame the player's movement is *swept* from current to desired
 *    position using entry/exit time analysis on each axis.
 * 3. On collision the remaining velocity is projected onto the contact
 *    surface (wall-sliding) and the sweep repeats for up to 3 iterations.
 *
 * This prevents tunneling, provides smooth wall-sliding, and handles
 * corners correctly via iterative velocity projection.
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';

/** Stored mapping from a Three.js object to its cannon body. */
export interface PhysicsEntry {
  obj: THREE.Object3D;
  body: CANNON.Body;
}

/** Result of a swept AABB test. */
interface SweepResult {
  /** Fraction of movement before first contact (0..1). */
  t: number;
  /** Contact normal (points away from the obstacle surface). */
  normalX: number;
  normalZ: number;
}

/** Skin width added to push the player slightly away from contact surfaces. */
const SKIN = 0.005;

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

  // Player half-extents (match visual model: ~0.5 wide, ~3.0 tall)
  private readonly PLAYER_HX = 0.4;
  private readonly PLAYER_HY = 1.5;
  private readonly PLAYER_HZ = 0.4;

  constructor() {
    this.world = new CANNON.World();
    this.world.gravity.set(0, 0, 0);
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

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

  /**
   * Register collision shapes for a group by decomposing it into its tagged
   * children. Only meshes with `userData.isCollider === true` produce a
   * collision body. If no children are tagged, falls back to a single AABB
   * around the entire group (backward compatibility).
   *
   * This prevents oversized bounding boxes on groups that contain both solid
   * geometry (trunks, pillars) and decorative geometry (canopies, vines).
   */
  addCollidableFiltered(group: THREE.Object3D): void {
    const tagged: THREE.Object3D[] = [];
    group.traverse((child) => {
      if (child.userData.isCollider === true && child !== group) {
        tagged.push(child);
      }
    });

    if (tagged.length === 0) {
      // No tagged children — fall back to whole-group AABB
      this.addCollidable(group);
      return;
    }

    // Ensure world matrices are up-to-date before computing AABBs
    group.updateWorldMatrix(true, true);

    for (const child of tagged) {
      const body = this.createStaticBody(child);
      if (body) {
        this.world.addBody(body);
        this.statics.push({ obj: child, body });
      }
    }
  }

  addCollidablesFiltered(groups: THREE.Object3D[]): void {
    for (const g of groups) this.addCollidableFiltered(g);
  }

  removeCollidable(obj: THREE.Object3D): void {
    // Remove exact match first
    const idx = this.statics.findIndex((e) => e.obj === obj);
    if (idx !== -1) {
      this.world.removeBody(this.statics[idx].body);
      this.statics.splice(idx, 1);
      return;
    }

    // For filtered groups: remove all child bodies whose mesh is a
    // descendant of the given object (handles addCollidableFiltered cleanup)
    const children: number[] = [];
    for (let i = 0; i < this.statics.length; i++) {
      let ancestor = this.statics[i].obj.parent;
      while (ancestor) {
        if (ancestor === obj) { children.push(i); break; }
        ancestor = ancestor.parent;
      }
    }
    for (let i = children.length - 1; i >= 0; i--) {
      this.world.removeBody(this.statics[children[i]].body);
      this.statics.splice(children[i], 1);
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

  /** Return the Three.js objects registered as collidables (for camera raycasting). */
  getCollidableObjects(): THREE.Object3D[] {
    const objs: THREE.Object3D[] = [];
    for (const entry of this.statics) {
      if (entry.obj.visible) objs.push(entry.obj);
    }
    return objs;
  }

  /**
   * Test whether a position (with a given half-extent radius) overlaps
   * any static collidable. Used by NPCs to avoid walking into walls/trees.
   */
  isPositionBlocked(x: number, y: number, z: number, halfExtent = 0.5): boolean {
    const minX = x - halfExtent;
    const maxX = x + halfExtent;
    const minY = y;
    const maxY = y + halfExtent * 4;
    const minZ = z - halfExtent;
    const maxZ = z + halfExtent;

    for (const entry of this.statics) {
      if (!entry.obj.visible) continue;
      const bMin = entry.body.aabb.lowerBound;
      const bMax = entry.body.aabb.upperBound;

      if (
        maxX > bMin.x && minX < bMax.x &&
        maxY > bMin.y && minY < bMax.y &&
        maxZ > bMin.z && minZ < bMax.z
      ) {
        return true;
      }
    }
    return false;
  }

  // ── Resolution ────────────────────────────────────────────────────────

  /**
   * Swept-AABB movement resolution with velocity-projection sliding.
   *
   * 1. Sweep the player AABB from `currentPos` toward `desiredPos`.
   * 2. On contact, advance to the collision point and project the
   *    remaining velocity onto the contact surface (wall sliding).
   * 3. Repeat for up to 3 iterations (handles corners).
   */
  resolveMovement(
    currentPos: THREE.Vector3,
    desiredPos: THREE.Vector3,
    _scene: THREE.Scene,
  ): THREE.Vector3 {
    this.playerBody.position.set(currentPos.x, currentPos.y + this.PLAYER_HY, currentPos.z);
    this.playerBody.updateAABB();

    // Sync NPC bodies before sweep
    this.syncDynamicBodies();

    let cx = currentPos.x;
    let cz = currentPos.z;
    let vx = desiredPos.x - currentPos.x;
    let vz = desiredPos.z - currentPos.z;
    const py = currentPos.y + this.PLAYER_HY; // AABB center Y

    // Up to 3 slide iterations (full move, first slide, corner slide)
    for (let iter = 0; iter < 3; iter++) {
      if (Math.abs(vx) < 1e-6 && Math.abs(vz) < 1e-6) break;

      const sweep = this.sweepAABB(cx, py, cz, vx, vz);

      if (sweep.t >= 1.0) {
        // No collision — apply full remaining velocity
        cx += vx;
        cz += vz;
        break;
      }

      // Advance to the collision point (minus skin)
      cx += vx * sweep.t;
      cz += vz * sweep.t;

      // Remaining velocity after the collision
      const remainVx = vx * (1 - sweep.t);
      const remainVz = vz * (1 - sweep.t);

      // Project remaining velocity onto the contact surface.
      // Surface tangent is perpendicular to the normal: tangent = (-nz, nx).
      // Projected velocity = dot(remain, tangent) * tangent
      const dot = remainVx * (-sweep.normalZ) + remainVz * sweep.normalX;
      vx = (-sweep.normalZ) * dot;
      vz = sweep.normalX * dot;
    }

    this._result.set(cx, currentPos.y, cz);
    return this._result;
  }

  // ── Swept AABB ────────────────────────────────────────────────────────

  /**
   * Sweep the player AABB from (cx, cy, cz) by velocity (vx, vz) against
   * all collidable bodies. Returns the earliest collision time and normal.
   *
   * Uses the standard entry/exit time algorithm:
   * For each axis, compute when the moving box *enters* and *exits* overlap
   * with the static box. The overall entry time is the maximum of per-axis
   * entry times; the overall exit time is the minimum of per-axis exit times.
   * A collision occurs when entryTime < exitTime AND entryTime ∈ [0, 1].
   */
  private sweepAABB(
    cx: number, cy: number, cz: number,
    vx: number, vz: number,
  ): SweepResult {
    const pHX = this.PLAYER_HX;
    const pHY = this.PLAYER_HY;
    const pHZ = this.PLAYER_HZ;

    // Player AABB bounds at current position
    const pMinX = cx - pHX;
    const pMaxX = cx + pHX;
    const pMinY = cy - pHY;
    const pMaxY = cy + pHY;
    const pMinZ = cz - pHZ;
    const pMaxZ = cz + pHZ;

    // Broad-phase in XZ: skip any body that cannot possibly intersect this frame's swept box.
    const endMinX = pMinX + vx;
    const endMaxX = pMaxX + vx;
    const endMinZ = pMinZ + vz;
    const endMaxZ = pMaxZ + vz;
    const sweepMinX = Math.min(pMinX, endMinX) - SKIN;
    const sweepMaxX = Math.max(pMaxX, endMaxX) + SKIN;
    const sweepMinZ = Math.min(pMinZ, endMinZ) - SKIN;
    const sweepMaxZ = Math.max(pMaxZ, endMaxZ) + SKIN;

    let bestT = 1.0;
    let bestNX = 0;
    let bestNZ = 0;

    // Test all static + dynamic bodies
    const allBodies = this.collectBodies();

    for (const body of allBodies) {
      const bMin = body.aabb.lowerBound;
      const bMax = body.aabb.upperBound;

      if (bMax.x < sweepMinX || bMin.x > sweepMaxX || bMax.z < sweepMinZ || bMin.z > sweepMaxZ) {
        continue;
      }

      // Y overlap test (static, we don't move vertically here)
      if (pMaxY <= bMin.y || pMinY >= bMax.y) continue;

      // --- X axis entry/exit ---
      let xEntry: number, xExit: number;
      if (vx === 0) {
        // No horizontal movement on X — check static overlap
        if (pMaxX <= bMin.x || pMinX >= bMax.x) continue; // no overlap, skip
        xEntry = -Infinity;
        xExit = Infinity;
      } else if (vx > 0) {
        xEntry = (bMin.x - pMaxX) / vx;
        xExit = (bMax.x - pMinX) / vx;
      } else {
        xEntry = (bMax.x - pMinX) / vx;
        xExit = (bMin.x - pMaxX) / vx;
      }

      // --- Z axis entry/exit ---
      let zEntry: number, zExit: number;
      if (vz === 0) {
        if (pMaxZ <= bMin.z || pMinZ >= bMax.z) continue;
        zEntry = -Infinity;
        zExit = Infinity;
      } else if (vz > 0) {
        zEntry = (bMin.z - pMaxZ) / vz;
        zExit = (bMax.z - pMinZ) / vz;
      } else {
        zEntry = (bMax.z - pMinZ) / vz;
        zExit = (bMin.z - pMaxZ) / vz;
      }

      const entryTime = Math.max(xEntry, zEntry);
      const exitTime = Math.min(xExit, zExit);

      // No collision if: entry > exit, or entry beyond this frame, or already past
      if (entryTime > exitTime || entryTime >= bestT || entryTime < -SKIN) continue;

      // Determine contact normal from which axis had the latest entry
      let nx = 0;
      let nz = 0;
      if (xEntry > zEntry) {
        nx = vx > 0 ? -1 : 1;
      } else {
        nz = vz > 0 ? -1 : 1;
      }

      bestT = Math.max(entryTime - SKIN, 0);
      bestNX = nx;
      bestNZ = nz;
    }

    return { t: bestT, normalX: bestNX, normalZ: bestNZ };
  }

  /**
   * Collect all active body AABBs for sweep testing.
   * Filters out invisible objects and returns only relevant bodies.
   */
  private collectBodies(): CANNON.Body[] {
    const bodies: CANNON.Body[] = [];
    for (const entry of this.statics) {
      if (entry.obj.visible) bodies.push(entry.body);
    }
    for (const [obj, body] of this.dynamicBodies) {
      if (obj.visible) bodies.push(body);
    }
    return bodies;
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
        const npcShape = new CANNON.Box(new CANNON.Vec3(0.4, 1.5, 0.4));
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

      body.position.set(this._worldPos.x, this._worldPos.y + 1.5, this._worldPos.z);
      body.updateAABB();
    }
  }
}
