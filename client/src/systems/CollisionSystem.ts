import * as THREE from 'three';
import { BVHManager } from './collision/BVH';
import { CollisionDebug } from './collision/CollisionDebug';
import { CollisionBody, AABB } from './collision/types';

/** Stored mapping from a Three.js object to its collision body. */
export interface PhysicsEntry {
  obj: THREE.Object3D;
  body: CollisionBody;
}

/** Cache for inverted world matrices to avoid expensive per-mesh re-inversion. */
const _invMatrixCache = new WeakMap<THREE.Mesh, THREE.Matrix4>();

/** 
 * Grid-based spatial index for fast proximity lookups.
 * Grid size of 32m (half chunk) is efficient for large-scale queries.
 */
class SpatialGrid {
  private grid: Map<string, Set<THREE.Mesh>> = new Map();
  private readonly cellSize = 32;

  public add(mesh: THREE.Mesh): void {
    const box = new THREE.Box3().setFromObject(mesh);
    const minCX = Math.floor(box.min.x / this.cellSize);
    const maxCX = Math.floor(box.max.x / this.cellSize);
    const minCZ = Math.floor(box.min.z / this.cellSize);
    const maxCZ = Math.floor(box.max.z / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const key = `${cx},${cz}`;
        if (!this.grid.has(key)) this.grid.set(key, new Set());
        this.grid.get(key)!.add(mesh);
      }
    }
  }

  public remove(mesh: THREE.Mesh): void {
    for (const set of this.grid.values()) {
      set.delete(mesh);
    }
  }

  public query(x: number, z: number, radius: number): THREE.Mesh[] {
    const result = new Set<THREE.Mesh>();
    const minCX = Math.floor((x - radius) / this.cellSize);
    const maxCX = Math.floor((x + radius) / this.cellSize);
    const minCZ = Math.floor((z - radius) / this.cellSize);
    const maxCZ = Math.floor((z + radius) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const key = `${cx},${cz}`;
        const set = this.grid.get(key);
        if (set) {
          for (const mesh of set) result.add(mesh);
        }
      }
    }
    return Array.from(result);
  }

  public clear(): void {
    this.grid.clear();
  }
}

export class CollisionSystem {
  private bvhManager: BVHManager;
  private debug: CollisionDebug | null = null;
  private statics: Map<THREE.Object3D, CollisionBody> = new Map();
  private spatialGrid = new SpatialGrid();

  // Reusable
  private _box3 = new THREE.Box3();
  private _pos = new THREE.Vector3();
  private _localBox = new THREE.Box3();

  constructor() {
    this.bvhManager = new BVHManager();
  }

  /** Initialize debug visualizer once the scene is available. */
  initDebug(scene: THREE.Scene): void {
    this.debug = new CollisionDebug(scene, this.bvhManager);
  }

  // ── Registration ──────────────────────────────────────────────────────

  async addCollidable(obj: THREE.Object3D): Promise<void> {
    if (this.statics.has(obj)) return;

    const body = this.createCollisionBody(obj, true);
    if (body) {
      await this.bvhManager.addBody(body);
      this.statics.set(obj, body);
      if (body.object instanceof THREE.Mesh) {
        this.spatialGrid.add(body.object);
      }
      this.debug?.update();
    }
  }

  async addCollidables(objs: THREE.Object3D[]): Promise<void> {
    await Promise.all(objs.map(obj => this.addCollidable(obj)));
  }

  async addCollidableFiltered(group: THREE.Object3D): Promise<void> {
    if (group.userData.noCollision === true) return;

    if (group instanceof THREE.LOD) {
      const level0 = group.levels[0]?.object;
      if (level0) {
        await this.addCollidableFiltered(level0);
      }
      return;
    }

    const tagged: THREE.Object3D[] = [];
    const fallbackMeshes: THREE.Object3D[] = [];
    group.traverse((child) => {
      if (child === group || child.userData.noCollision === true) return;
      if (child.userData.isCollider === true) {
        tagged.push(child);
        return;
      }
      if (child instanceof THREE.Mesh) fallbackMeshes.push(child);
      if (child instanceof THREE.LOD) return;
    });

    const targets = tagged.length > 0 ? tagged : fallbackMeshes;
    if (targets.length === 0) {
      await this.addCollidable(group);
      return;
    }

    group.updateWorldMatrix(true, true);

    await Promise.all(targets.map(async (child) => {
      if (this.statics.has(child)) return;

      const body = this.createCollisionBody(child, true);
      if (body) {
        await this.bvhManager.addBody(body);
        this.statics.set(child, body);
        if (body.object instanceof THREE.Mesh) {
          this.spatialGrid.add(body.object);
        }
      }
    }));
    this.debug?.update();
  }

  async addCollidablesFiltered(groups: THREE.Object3D[]): Promise<void> {
    await Promise.all(groups.map(g => this.addCollidableFiltered(g)));
  }

  removeCollidable(obj: THREE.Object3D): void {
    const entry = this.statics.get(obj);
    if (entry) {
      this.bvhManager.removeBody(entry.id);
      if (entry.object instanceof THREE.Mesh) {
        this.spatialGrid.remove(entry.object);
      }
      this.statics.delete(obj);
      this.debug?.update();
      return;
    }

    const toRemove: THREE.Object3D[] = [];
    for (const [mesh] of this.statics) {
      let ancestor = mesh.parent;
      while (ancestor) {
        if (ancestor === obj) {
          toRemove.push(mesh);
          break;
        }
        ancestor = ancestor.parent;
      }
    }

    for (const mesh of toRemove) {
      const body = this.statics.get(mesh);
      if (body) {
        this.bvhManager.removeBody(body.id);
        if (body.object instanceof THREE.Mesh) {
          this.spatialGrid.remove(body.object);
        }
        this.statics.delete(mesh);
      }
    }
    
    if (toRemove.length > 0) this.debug?.update();
  }

  removeCollidablesWhere(predicate: (obj: THREE.Object3D) => boolean): void {
    const toRemove: [THREE.Object3D, CollisionBody][] = [];
    for (const [obj, body] of this.statics) {
      if (predicate(obj)) {
        toRemove.push([obj, body]);
      }
    }

    for (const [obj, body] of toRemove) {
      this.bvhManager.removeBody(body.id);
      if (body.object instanceof THREE.Mesh) {
        this.spatialGrid.remove(body.object);
      }
      this.statics.delete(obj);
    }

    if (toRemove.length > 0) this.debug?.update();
  }

  async setCollidables(objs: THREE.Object3D[]): Promise<void> {
    for (const body of this.statics.values()) {
      this.bvhManager.removeBody(body.id);
    }
    this.statics.clear();
    this.spatialGrid.clear();
    await this.addCollidables(objs);
  }

  saveCollidables(): PhysicsEntry[] {
    return Array.from(this.statics.entries()).map(([obj, body]) => ({ obj, body }));
  }

  restoreCollidables(saved: PhysicsEntry[]): void {
    for (const body of this.statics.values()) {
      this.bvhManager.removeBody(body.id);
    }
    this.statics.clear();
    this.spatialGrid.clear();
    for (const entry of saved) {
      this.statics.set(entry.obj, entry.body);
      if (entry.body.object instanceof THREE.Mesh) {
        this.spatialGrid.add(entry.body.object);
      }
      this.bvhManager.addBody(entry.body);
    }
    this.debug?.update();
  }

  getCollidableCount(): number {
    return this.statics.size;
  }

  getCollidableObjects(): THREE.Object3D[] {
    const result: THREE.Object3D[] = [];
    for (const [obj] of this.statics) {
      if (obj.visible) result.push(obj);
    }
    return result;
  }

  getStaticMeshes(nearPos?: THREE.Vector3, radius?: number): THREE.Mesh[] {
    if (!nearPos || radius === undefined) return this.bvhManager.getStaticMeshes();
    return this.spatialGrid.query(nearPos.x, nearPos.z, radius);
  }

  isPositionBlocked(x: number, y: number, z: number, halfExtent = 0.5): boolean {
    this._box3.min.set(x - halfExtent, y, z - halfExtent);
    this._box3.max.set(x + halfExtent, y + 1.8, z + halfExtent);
    
    this._pos.set(x, y, z);
    const nearby = this.getStaticMeshes(this._pos, 5.0);
    
    for (const mesh of nearby) {
      if (!mesh.geometry.boundsTree) continue;

      let invMatrix = _invMatrixCache.get(mesh);
      if (!invMatrix) {
        invMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
        _invMatrixCache.set(mesh, invMatrix);
      }

      this._localBox.copy(this._box3).applyMatrix4(invMatrix);

      const hit = mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (b) => b.intersectsBox(this._localBox),
        intersectsTriangle: () => true,
      });

      if (hit) return true;
    }
    return false;
  }

  // ── Resolution ────────────────────────────────────────────────────────

  resolveMovement(
    currentPos: THREE.Vector3,
    desiredPos: THREE.Vector3,
    _scene: THREE.Scene,
  ): THREE.Vector3 {
    return desiredPos;
  }

  // ── Helper ────────────────────────────────────────────────────────────

  private createCollisionBody(obj: THREE.Object3D, isStatic: boolean): CollisionBody | null {
    obj.updateWorldMatrix(true, true);
    
    // Custom box calculation that includes invisible objects (standard setFromObject ignores them)
    if (obj instanceof THREE.Mesh) {
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      this._box3.copy(obj.geometry.boundingBox!).applyMatrix4(obj.matrixWorld);
    } else {
      // Fallback for groups/others (will still ignore invisible children, 
      // but isCollider proxies are usually meshes anyway)
      this._box3.setFromObject(obj);
    }

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
    this.debug?.update();
  }
}
