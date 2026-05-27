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

      if (body.isStatic && !this.staticBodies.includes(mesh)) {
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

  /** Check if an AABB intersects any static mesh. */
  public intersectsBox(box: THREE.Box3): boolean {
    for (const mesh of this.staticBodies) {
      if (!mesh.geometry.boundsTree) continue;

      // Local mesh check
      const meshInvMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
      const localBox = box.clone().applyMatrix4(meshInvMatrix);
      
      const hit = mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (b) => b.intersectsBox(localBox),
        intersectsTriangle: () => true, // Any triangle hit means blocked
      });

      if (hit) return true;
    }
    return false;
  }
}
