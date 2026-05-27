import * as THREE from 'three';
import { Capsule } from './Capsule';
import { ContactSolver } from './ContactSolver';

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

    const horizontalVelocity = new THREE.Vector3(velocity.x, 0, velocity.z);
    if (horizontalVelocity.lengthSq() < 0.0001) return 0;

    const moveStep = horizontalVelocity.clone().multiplyScalar(delta);
    
    // Check if blocked at current height
    const blockedCapsule = new Capsule();
    blockedCapsule.copy(capsule);
    blockedCapsule.translate(moveStep);
    const blockedContacts = this.contactSolver.getContacts(blockedCapsule, meshes);
    
    if (blockedContacts.length === 0) {
      return 0; // Path is clear, no need to step up
    }

    // Probe A: Lift capsule and check if clear
    // We try multiple heights to find the smallest one that works, or just a more reasonable one.
    // For now, let's just make it return a smaller step if the path is clear.
    const liftedCapsule = new Capsule();
    
    // Check multiple heights for more precise stepping
    const heights = [0.1, 0.2, 0.3, 0.4, 0.5];
    for (const h of heights) {
      liftedCapsule.copy(capsule);
      liftedCapsule.translate(new THREE.Vector3(0, h, 0));
      liftedCapsule.translate(moveStep);

      const contacts = this.contactSolver.getContacts(liftedCapsule, meshes);
      if (contacts.length === 0) {
        // Found a height that clears the obstacle
        return h;
      }
    }

    return 0;
  }
}
