import * as THREE from 'three';
import { CollisionBody } from './types';

export class BVHManager {
  private bodies: Map<string, CollisionBody> = new Map();
  private staticBodies: THREE.Mesh[] = [];

  /**
   * Pending BVH builds.  Drained by drainBvhQueue() — called once per frame
   * from CollisionSystem.update() so computation is spread across frames
   * instead of bursting all at once when a chunk loads.
   * Bodies tagged userData.skipBvh are never enqueued here; they use the AABB
   * fallback in intersectsBox() instead.
   */
  private _bvhQueue: THREE.BufferGeometry[] = [];

  // World-space AABB stored at registration time.
  // Used as an instant fallback for bodies that have skipBvh or whose BVH tree
  // has not yet been built (avoids the "walk through buildings" window).
  private _staticAabbMap = new Map<THREE.Mesh, THREE.Box3>();

  // Spatial grid — divides the world into CELL×CELL cells.
  // intersectsBox() only checks bodies whose cells overlap the query box,
  // reducing O(n-all-statics) to O(n-nearby-statics) per movement frame.
  private static readonly _CELL = 64;
  private _grid = new Map<string, Set<THREE.Mesh>>();
  private _meshCells = new Map<THREE.Mesh, string[]>();

  // Reusable scratch objects — avoids per-query allocation (GC pressure fix)
  private static _invMatrix = new THREE.Matrix4();
  private static _localBox  = new THREE.Box3();
  private static _candidateSet = new Set<THREE.Mesh>();

  constructor() {}

  /**
   * Register a collision body.
   * - Bodies with userData.skipBvh skip the BVH queue entirely and use AABB collision.
   * - Other MESH bodies queue a BVH build (drained lazily by drainBvhQueue).
   * - All static bodies are immediately available for AABB fallback collision.
   */
  public async addBody(body: CollisionBody): Promise<void> {
    this.bodies.set(body.id, body);

    if (body.type === 'MESH' && body.object instanceof THREE.Mesh) {
      const mesh = body.object;

      // Queue BVH build only for bodies that haven't opted out.
      // Procedural buildings tag themselves skipBvh to use instant AABB collision.
      if (!mesh.geometry.boundsTree && !mesh.userData.skipBvh) {
        this._bvhQueue.push(mesh.geometry);
      }

      if (body.isStatic && !this.staticBodies.includes(mesh)) {
        this.staticBodies.push(mesh);
        this._addToGrid(mesh);
        // Store world-AABB for instant collision even before BVH is built
        this._staticAabbMap.set(mesh, new THREE.Box3(
          body.aabb.min.clone(),
          body.aabb.max.clone(),
        ));
      }
    }
    // Intentionally returns immediately — no per-body setTimeout.
  }

  /**
   * Process up to `maxPerFrame` pending BVH builds within a frame-time budget.
   * Call once per frame from CollisionSystem.update().
   */
  public drainBvhQueue(maxPerFrame = 2, budgetMs = 4): void {
    const start = performance.now();
    let built = 0;
    while (built < maxPerFrame && this._bvhQueue.length > 0) {
      if (performance.now() - start > budgetMs) break;
      const geo = this._bvhQueue.shift()!;
      if (!geo.boundsTree) {
        geo.computeBoundsTree();
      }
      built++;
    }
  }

  public get pendingBvhCount(): number {
    return this._bvhQueue.length;
  }

  public removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (!body) return;

    if (body.isStatic && body.object instanceof THREE.Mesh) {
      const mesh = body.object;

      // Evict from BVH build queue — prevents building a tree for a removed body
      const qIdx = this._bvhQueue.indexOf(mesh.geometry);
      if (qIdx !== -1) this._bvhQueue.splice(qIdx, 1);

      const index = this.staticBodies.indexOf(mesh);
      if (index !== -1) {
        this.staticBodies.splice(index, 1);
        this._removeFromGrid(mesh);
        this._staticAabbMap.delete(mesh);
      }
    }

    this.bodies.delete(id);
  }

  public getBodies(): CollisionBody[] {
    return Array.from(this.bodies.values());
  }

  public getStaticMeshes(): THREE.Mesh[] {
    return this.staticBodies;
  }

  /**
   * Raycast against all colliders, utilizing BVH where available.
   */
  public raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
    for (const body of this.bodies.values()) {
      body.object.raycast(raycaster, intersects);
    }

    // Sort only when there are multiple hits (skip trivial single-result case)
    if (intersects.length > 1) {
      intersects.sort((a, b) => a.distance - b.distance);
    }
  }

  /**
   * Shapecast using BVH meshes.
   */
  public shapecast(
    _intersects: (
      box: THREE.Box3,
      isLeaf: boolean,
      score: number | undefined,
      depth: number,
      nodeIndex: number
    ) => boolean | number
  ): boolean {
    let hit = false;

    for (const mesh of this.staticBodies) {
      if (!mesh.geometry.boundsTree) continue;

      const res = mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (box, isLeaf, score, depth, nodeIndex) => {
          const result = _intersects(box, isLeaf, score, depth, nodeIndex);
          if (result === true) hit = true;
          return result;
        },
        intersectsTriangle: (_triangle, _triangleIndex, _contained, _depth) => {
          return false;
        }
      });
      if (res) return true;
    }

    return hit;
  }

  /**
   * Check if an AABB intersects any static mesh.
   *
   * - Uses the spatial grid to narrow candidates from all statics to only those
   *   whose grid cells overlap the query box (O(nearby) instead of O(all)).
   * - For bodies WITH a BVH tree: exact per-triangle shapecast in local space.
   * - For bodies WITHOUT a BVH tree (skipBvh or not yet built): instant AABB
   *   check using the world-space AABB stored at registration time.
   */
  public intersectsBox(box: THREE.Box3): boolean {
    const CELL = BVHManager._CELL;
    const c0x = Math.floor(box.min.x / CELL);
    const c0z = Math.floor(box.min.z / CELL);
    const c1x = Math.floor(box.max.x / CELL);
    const c1z = Math.floor(box.max.z / CELL);

    const candidates = BVHManager._candidateSet;
    candidates.clear();

    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const cell = this._grid.get(`${cx},${cz}`);
        if (cell) { for (const mesh of cell) candidates.add(mesh); }
      }
    }

    for (const mesh of candidates) {
      if (mesh.geometry.boundsTree) {
        // Exact BVH shapecast in local mesh space
        BVHManager._invMatrix.copy(mesh.matrixWorld).invert();
        const localBox = BVHManager._localBox.copy(box).applyMatrix4(BVHManager._invMatrix);
        const hit = mesh.geometry.boundsTree.shapecast({
          intersectsBounds: (b) => b.intersectsBox(localBox),
          intersectsTriangle: () => true,
        });
        if (hit) return true;
      } else {
        // AABB fallback — instant, no BVH required.
        // Covers skipBvh bodies (procedural buildings) and the build-pending window.
        const aabb = this._staticAabbMap.get(mesh);
        if (aabb && box.intersectsBox(aabb)) return true;
      }
    }

    return false;
    }

    /**
    * Returns a list of candidate meshes that overlap the given box.
    * Uses the spatial grid for O(nearby) performance.
    */
    public getCandidates(box: THREE.Box3): THREE.Mesh[] {
    const CELL = BVHManager._CELL;
    const c0x = Math.floor(box.min.x / CELL);
    const c0z = Math.floor(box.min.z / CELL);
    const c1x = Math.floor(box.max.x / CELL);
    const c1z = Math.floor(box.max.z / CELL);

    const candidates = BVHManager._candidateSet;
    candidates.clear();

    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const cell = this._grid.get(`${cx},${cz}`);
        if (cell) {
          for (const mesh of cell) {
            candidates.add(mesh);
          }
        }
      }
    }

    return Array.from(candidates);
    }


  // ── Spatial grid helpers ──────────────────────────────────────────────────

  private _addToGrid(mesh: THREE.Mesh): void {
    const aabb = new THREE.Box3().setFromObject(mesh);
    const CELL = BVHManager._CELL;
    const cells: string[] = [];
    const c0x = Math.floor(aabb.min.x / CELL);
    const c0z = Math.floor(aabb.min.z / CELL);
    const c1x = Math.floor(aabb.max.x / CELL);
    const c1z = Math.floor(aabb.max.z / CELL);
    for (let cx = c0x; cx <= c1x; cx++) {
      for (let cz = c0z; cz <= c1z; cz++) {
        const key = `${cx},${cz}`;
        let cell = this._grid.get(key);
        if (!cell) { cell = new Set(); this._grid.set(key, cell); }
        cell.add(mesh);
        cells.push(key);
      }
    }
    this._meshCells.set(mesh, cells);
  }

  private _removeFromGrid(mesh: THREE.Mesh): void {
    const cells = this._meshCells.get(mesh);
    if (!cells) return;
    for (const key of cells) {
      this._grid.get(key)?.delete(mesh);
    }
    this._meshCells.delete(mesh);
  }
}
