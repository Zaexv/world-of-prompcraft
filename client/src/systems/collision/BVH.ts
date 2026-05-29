import * as THREE from 'three';
import { CollisionBody } from './types';

export class BVHManager {
  private bodies: Map<string, CollisionBody> = new Map();
  private staticBodies: THREE.Mesh[] = [];

  /**
   * Pending BVH builds.  Drained by drainBvhQueue() — called once per frame
   * from CollisionSystem.update() so computation is spread across frames
   * instead of bursting all at once when a chunk loads.
   */
  private _bvhQueue: THREE.BufferGeometry[] = [];

  constructor() {}

  /**
   * Register a collision body.  For MESH bodies the BVH tree is NOT built
   * immediately — it is queued and built lazily via drainBvhQueue().
   * The body IS active for AABB checks straight away; per-triangle precision
   * activates once the tree finishes (typically within a few frames).
   */
  public async addBody(body: CollisionBody): Promise<void> {
    this.bodies.set(body.id, body);

    if (body.type === 'MESH' && body.object instanceof THREE.Mesh) {
      const mesh = body.object;

      if (!mesh.geometry.boundsTree) {
        this._bvhQueue.push(mesh.geometry);
      }

      if (body.isStatic && !this.staticBodies.includes(mesh)) {
        this.staticBodies.push(mesh);
      }
    }
    // Intentionally returns immediately — no per-body setTimeout.
  }

  /**
   * Process up to `maxPerFrame` pending BVH builds.
   * Call once per frame from CollisionSystem.update().
   */
  public drainBvhQueue(maxPerFrame = 2): void {
    const limit = Math.min(maxPerFrame, this._bvhQueue.length);
    for (let i = 0; i < limit; i++) {
      const geo = this._bvhQueue.shift()!;
      if (!geo.boundsTree) {
        geo.computeBoundsTree();
      }
    }
  }

  public get pendingBvhCount(): number {
    return this._bvhQueue.length;
  }

  public removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (!body) return;

    if (body.isStatic && body.object instanceof THREE.Mesh) {
      const index = this.staticBodies.indexOf(body.object);
      if (index !== -1) {
        this.staticBodies.splice(index, 1);
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

      // Transform query to local mesh space if needed (simplified for global AABB check)
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

  // Reusable scratch objects — avoids per-query allocation (GC pressure fix)
  private static _invMatrix = new THREE.Matrix4();
  private static _localBox  = new THREE.Box3();

  /** Check if an AABB intersects any static mesh. */
  public intersectsBox(box: THREE.Box3): boolean {
    for (const mesh of this.staticBodies) {
      if (!mesh.geometry.boundsTree) continue;

      // Reuse static scratch objects instead of allocating per-query
      BVHManager._invMatrix.copy(mesh.matrixWorld).invert();
      const localBox = BVHManager._localBox.copy(box).applyMatrix4(BVHManager._invMatrix);
      
      const hit = mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (b) => b.intersectsBox(localBox),
        intersectsTriangle: () => true, // Any triangle hit means blocked
      });

      if (hit) return true;
    }
    return false;
  }
}
