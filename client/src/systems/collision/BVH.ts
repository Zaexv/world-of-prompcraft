import * as THREE from 'three';
import { CollisionBody } from './types';

export class BVHManager {
  private bodies: Map<string, CollisionBody> = new Map();
  private staticBodies: THREE.Mesh[] = [];
  
  // For static environment merging (optional, but good for performance)
  // private mergedBVH: MeshBVH | null = null;

  constructor() {}

  public async addBody(body: CollisionBody): Promise<void> {
    this.bodies.set(body.id, body);

    if (body.type === 'MESH' && body.object instanceof THREE.Mesh) {
      const mesh = body.object;
      
      // Asynchronous BVH computation
      if (!mesh.geometry.boundsTree) {
        await new Promise<void>((resolve) => {
          // three-mesh-bvh can be slow for large geometries, so we use a promise
          // to avoid blocking the main thread if possible (though it's still synchronous in the library
          // unless workers are used, but we can wrap it)
          setTimeout(() => {
            mesh.geometry.computeBoundsTree();
            resolve();
          }, 0);
        });
      }

      if (body.isStatic) {
        this.staticBodies.push(mesh);
      }
    }
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
    
    // Sort by distance
    intersects.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Shapecast using BVH meshes.
   * This is what Agent 2 will use for the capsule controller.
   */
  public shapecast(
    mesh: THREE.Mesh, 
    _intersects: (
      box: THREE.Box3, 
      isLeaf: boolean, 
      score: number, 
      depth: number, 
      nodeIndex: number
    ) => boolean | number
  ): boolean {
    if (!mesh.geometry.boundsTree) return false;
    // This is just a placeholder for the actual shapecast call
    // mesh.geometry.boundsTree.shapecast(...)
    return false;
  }
}
