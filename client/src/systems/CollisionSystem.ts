import * as THREE from 'three';
import { BVHManager } from './collision/BVH';
import { CollisionDebug } from './collision/CollisionDebug';
import { CollisionBody, AABB } from './collision/types';

/** Stored mapping from a Three.js object to its collision body. */
export interface PhysicsEntry {
  obj: THREE.Object3D;
  body: CollisionBody;
}

export class CollisionSystem {
  private bvhManager: BVHManager;
  private debug: CollisionDebug | null = null;
  private statics: PhysicsEntry[] = [];
  private dynamicBodies: Map<THREE.Object3D, CollisionBody> = new Map();

  // Reusable
  private _box3 = new THREE.Box3();

  constructor() {
    this.bvhManager = new BVHManager();
  }

  /** Initialize debug visualizer once the scene is available. */
  initDebug(scene: THREE.Scene): void {
    this.debug = new CollisionDebug(scene, this.bvhManager);
  }

  // ── Registration ──────────────────────────────────────────────────────

  async addCollidable(obj: THREE.Object3D): Promise<void> {
    if (this.statics.some(e => e.obj === obj)) return;

    const body = this.createCollisionBody(obj, true);
    if (body) {
      await this.bvhManager.addBody(body);
      this.statics.push({ obj, body });
      this.debug?.update();
    }
  }

  async addCollidables(objs: THREE.Object3D[]): Promise<void> {
    await Promise.all(objs.map(obj => this.addCollidable(obj)));
  }

  /**
   * Register collision shapes for a group by decomposing it into its tagged
   * children. Tagged colliders (`userData.isCollider === true`) are preferred.
   */
  async addCollidableFiltered(group: THREE.Object3D): Promise<void> {
    if (group.userData.noCollision === true) return;

    const tagged: THREE.Object3D[] = [];
    const fallbackMeshes: THREE.Object3D[] = [];
    group.traverse((child) => {
      if (child === group || child.userData.noCollision === true) return;
      if (child.userData.isCollider === true) {
        tagged.push(child);
        return;
      }
      if (child instanceof THREE.Mesh) fallbackMeshes.push(child);
    });

    const targets = tagged.length > 0 ? tagged : fallbackMeshes;
    if (targets.length === 0) {
      await this.addCollidable(group);
      return;
    }

    group.updateWorldMatrix(true, true);

    await Promise.all(targets.map(async (child) => {
      if (this.statics.some(e => e.obj === child)) return;

      const body = this.createCollisionBody(child, true);
      if (body) {
        await this.bvhManager.addBody(body);
        this.statics.push({ obj: child, body });
      }
    }));
    this.debug?.update();
  }

  async addCollidablesFiltered(groups: THREE.Object3D[]): Promise<void> {
    await Promise.all(groups.map(g => this.addCollidableFiltered(g)));
  }

  removeCollidable(obj: THREE.Object3D): void {
    const idx = this.statics.findIndex((e) => e.obj === obj);
    if (idx !== -1) {
      this.bvhManager.removeBody(this.statics[idx].body.id);
      this.statics.splice(idx, 1);
      this.debug?.update();
      return;
    }

    const children: number[] = [];
    for (let i = 0; i < this.statics.length; i++) {
      let ancestor = this.statics[i].obj.parent;
      while (ancestor) {
        if (ancestor === obj) { children.push(i); break; }
        ancestor = ancestor.parent;
      }
    }
    for (let i = children.length - 1; i >= 0; i--) {
      this.bvhManager.removeBody(this.statics[children[i]].body.id);
      this.statics.splice(children[i], 1);
    }
    if (children.length > 0) this.debug?.update();
  }

  removeCollidablesWhere(predicate: (obj: THREE.Object3D) => boolean): void {
    const toRemove = this.statics.filter((e) => predicate(e.obj));
    for (const entry of toRemove) {
      this.bvhManager.removeBody(entry.body.id);
    }
    this.statics = this.statics.filter((e) => !predicate(e.obj));
    if (toRemove.length > 0) this.debug?.update();
  }

  async setCollidables(objs: THREE.Object3D[]): Promise<void> {
    for (const entry of this.statics) {
      this.bvhManager.removeBody(entry.body.id);
    }
    this.statics = [];
    await this.addCollidables(objs);
  }

  saveCollidables(): PhysicsEntry[] {
    return [...this.statics];
  }

  restoreCollidables(saved: PhysicsEntry[]): void {
    for (const entry of this.statics) {
      this.bvhManager.removeBody(entry.body.id);
    }
    this.statics = [...saved];
    for (const entry of this.statics) {
      this.bvhManager.addBody(entry.body);
    }
    this.debug?.update();
  }

  getCollidableCount(): number {
    return this.statics.length + this.dynamicBodies.size;
  }

  getCollidableObjects(): THREE.Object3D[] {
    return this.statics
      .filter(e => e.obj.visible)
      .map(e => e.obj);
  }

  getStaticMeshes(): THREE.Mesh[] {
    return this.bvhManager.getStaticMeshes();
  }

  isPositionBlocked(x: number, y: number, z: number, halfExtent = 0.5): boolean {
    this._box3.min.set(x - halfExtent, y, z - halfExtent);
    this._box3.max.set(x + halfExtent, y + 1.8, z + halfExtent);
    return this.bvhManager.intersectsBox(this._box3);
  }

  // ── Resolution ────────────────────────────────────────────────────────

  /**
   * Movement resolution façade.
   * Temporary: returns desiredPos until Agent 2 implements the Kinematic Solver.
   */
  resolveMovement(
    currentPos: THREE.Vector3,
    desiredPos: THREE.Vector3,
    _scene: THREE.Scene,
  ): THREE.Vector3 {
    // For now, allow all movement. Agent 2 will swap this with the Capsule Solver.
    return desiredPos;
  }

  // ── Helper ────────────────────────────────────────────────────────────

  private createCollisionBody(obj: THREE.Object3D, isStatic: boolean): CollisionBody | null {
    obj.updateWorldMatrix(true, true);
    this._box3.setFromObject(obj);
    if (this._box3.isEmpty()) return null;

    const aabb: AABB = {
      min: this._box3.min.clone(),
      max: this._box3.max.clone()
    };

    return {
      id: THREE.MathUtils.generateUUID(),
      type: obj instanceof THREE.Mesh ? 'MESH' : 'AABB',
      object: obj,
      aabb,
      isStatic,
      layers: 1
    };
  }

  update(): void {
    // Drain max 2 BVH builds per frame — prevents burst spikes when chunks load.
    this.bvhManager.drainBvhQueue(2);
    this.debug?.update();
  }
}
