import * as THREE from 'three';
import { CollisionBody } from './types';

/** Cache for inverted world matrices to avoid expensive per-mesh re-inversion. */
const _invMatrixCache = new WeakMap<THREE.Mesh, THREE.Matrix4>();

/**
 * BVHManager handles the generation and querying of collision trees.
 *
 * Performance Note: BVH generation is synchronous and expensive.
 * We use a frame-budgeted queue to spread the cost over multiple frames
 * to prevent the "world-gen stutter" when loading many objects at once.
 */
export class BVHManager {
  private bodies: Map<string, CollisionBody> = new Map();
  private staticBodies: THREE.Mesh[] = [];

  private buildQueue: Array<{ mesh: THREE.Mesh; resolve: () => void }> = [];
  private isProcessingQueue = false;
  private readonly FRAME_BUDGET_MS = 2.0;

  constructor() {}

  /**
   * Register a collision body.  For MESH bodies the BVH tree is NOT built
   * immediately — it is queued and built lazily.
   */
  public async addBody(body: CollisionBody): Promise<void> {
    this.bodies.set(body.id, body);

    if (body.type === 'MESH' && body.object instanceof THREE.Mesh) {
      const mesh = body.object;
      
      // Asynchronous BVH computation via frame-budgeted queue
      if (!mesh.geometry.boundsTree) {
        await new Promise<void>((resolve) => {
          this.buildQueue.push({ mesh, resolve });
          this.startQueueProcessor();
        });
      }

      if (body.isStatic && !this.staticBodies.includes(mesh)) {
        this.staticBodies.push(mesh);
      }
    }
  }

  private startQueueProcessor(): void {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    this.processQueue();
  }

  private processQueue(): void {
    if (this.buildQueue.length === 0) {
      this.isProcessingQueue = false;
      return;
    }

    const start = performance.now();
    while (this.buildQueue.length > 0 && (performance.now() - start) < this.FRAME_BUDGET_MS) {
      const item = this.buildQueue.shift();
      if (!item) break;
      const { mesh, resolve } = item;
      
      if (!mesh.geometry.boundsTree) {
        mesh.geometry.computeBoundsTree();
      }
      resolve();
    }

    if (this.buildQueue.length > 0) {
      requestAnimationFrame(() => this.processQueue());
    } else {
      this.isProcessingQueue = false;
    }
  }

  public removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (!body) return;

    if (body.object instanceof THREE.Mesh) {
      const idx = this.buildQueue.findIndex(item => item.mesh === body.object);
      if (idx !== -1) {
        this.buildQueue.splice(idx, 1);
      }
    }

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

  public raycast(raycaster: THREE.Raycaster, intersects: THREE.Intersection[]): void {
    for (const body of this.bodies.values()) {
      body.object.raycast(raycaster, intersects);
    }
    if (intersects.length > 1) {
      intersects.sort((a, b) => a.distance - b.distance);
    }
  }

  // Reusable scratch objects
  private static _localBox = new THREE.Box3();

  /** Check if an AABB intersects any static mesh. */
  public intersectsBox(box: THREE.Box3): boolean {
    for (const mesh of this.staticBodies) {
      if (!mesh.geometry.boundsTree) continue;

      // matrixWorld.invert() is expensive, use cached inverted matrix for static meshes
      let invMatrix = _invMatrixCache.get(mesh);
      if (!invMatrix) {
        invMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
        _invMatrixCache.set(mesh, invMatrix);
      }

      const localBox = BVHManager._localBox.copy(box).applyMatrix4(invMatrix);
      
      const hit = mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (b) => b.intersectsBox(localBox),
        intersectsTriangle: () => true,
      });

      if (hit) return true;
    }
    return false;
  }
}
