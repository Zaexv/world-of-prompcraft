import * as THREE from 'three';
import { Capsule } from './Capsule';
import { ContactSolver } from './ContactSolver';

const _horizontalVelocity = new THREE.Vector3();
const _moveStep = new THREE.Vector3();
const _liftVec = new THREE.Vector3();
const _blockedCapsule = new Capsule();
const _liftedCapsule = new Capsule();

export class StepDetector {
  constructor(private contactSolver: ContactSolver) {}

  /**
   * Attempts to detect a step up.
   * Returns the vertical offset if a step is found, 0 otherwise.
   */
  public detectStep(
    capsule: Capsule,
    velocity: THREE.Vector3,
    delta: number,
    meshes: THREE.Mesh[]
  ): number {
    if (velocity.lengthSq() < 0.0001) return 0;

    _horizontalVelocity.set(velocity.x, 0, velocity.z);
    if (_horizontalVelocity.lengthSq() < 0.0001) return 0;

    _moveStep.copy(_horizontalVelocity).multiplyScalar(delta);
    
    // Check if blocked at current height
    _blockedCapsule.copy(capsule);
    _blockedCapsule.translate(_moveStep);
    const blockedContacts = this.contactSolver.getContacts(_blockedCapsule, meshes);
    
    if (blockedContacts.length === 0) {
      return 0; // Path is clear, no need to step up
    }

    // Optimization for tall vertical walls: 
    // If we are blocked at the maximum step height, we know we can't step up at all.
    // Check this FIRST to save multiple BVH queries.
    _liftedCapsule.copy(capsule);
    _liftedCapsule.translate(_liftVec.set(0, 0.5, 0));
    _liftedCapsule.translate(_moveStep);
    const maxBlockedContacts = this.contactSolver.getContacts(_liftedCapsule, meshes);
    if (maxBlockedContacts.length > 0) {
      return 0; // Wall is too tall to step over
    }

    // Now we know the max step (0.5) clears the obstacle. 
    // We check lower heights to find the minimal step up required.
    const heights = [0.1, 0.2, 0.3, 0.4, 0.5];
    for (const h of heights) {
      _liftedCapsule.copy(capsule);
      _liftedCapsule.translate(_liftVec.set(0, h, 0));
      _liftedCapsule.translate(_moveStep);

      const contacts = this.contactSolver.getContacts(_liftedCapsule, meshes);
      if (contacts.length === 0) {
        // Found the smallest height that clears the obstacle
        return h;
      }
    }

    return 0;
  }
}
