import * as THREE from 'three';
import { Capsule } from './Capsule';

const _raycaster = new THREE.Raycaster();
const _down = new THREE.Vector3(0, -1, 0);

export class GroundSnap {
  private snapDistance: number = 0.5;

  constructor() {}

  /**
   * Returns the vertical distance to snap to the ground.
   * Returns 0 if no ground is found within snapDistance.
   */
  public getSnapDistance(capsule: Capsule, meshes: THREE.Mesh[]): number {
    // Raycast down from just above the capsule bottom
    const rayOrigin = capsule.start.clone();
    rayOrigin.y += 0.1; // Offset slightly to avoid starting inside the floor

    _raycaster.set(rayOrigin, _down);
    _raycaster.far = this.snapDistance + 0.1;

    const intersects = _raycaster.intersectObjects(meshes, true);

    if (intersects.length > 0) {
      const dist = intersects[0].distance - 0.1; // Remove the offset
      if (dist > 0 && dist <= this.snapDistance) {
        return -dist; // Return as negative value for downward movement
      }
    }

    return 0;
  }
}
