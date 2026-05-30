import * as THREE from 'three';
import { Capsule } from './Capsule';

const _raycaster = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);
const _rayOrigin = new THREE.Vector3();

export class GroundSnap {
  private snapDistance: number = 0.5;

  constructor() {}

  /**
   * Returns the vertical distance to snap to the ground.
   * Returns 0 if no ground is found within snapDistance.
   */
  public getSnapDistance(capsule: Capsule, meshes: THREE.Mesh[]): number {
    if (meshes.length === 0) return 0;

    // Raycast down from just above the capsule bottom
    _rayOrigin.copy(capsule.start);
    _rayOrigin.y += 0.1; // Offset slightly to avoid starting inside the floor

    _raycaster.set(_rayOrigin, _down);
    _raycaster.far = capsule.radius + 0.1 + this.snapDistance;

    const intersects = _raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      // The distance to the ground should be exactly capsule.radius + 0.1
      const targetDistance = capsule.radius + 0.1;
      const error = intersects[0].distance - targetDistance;
      
      // If error is positive, we are floating above the floor.
      // We pull down by error, capped at snapDistance.
      if (error > 0 && error <= this.snapDistance) {
        return -error; // Return as negative value for downward movement
      }
    }

    return 0;
  }
}
