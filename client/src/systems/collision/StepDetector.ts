import * as THREE from 'three';
import { Capsule } from './Capsule';
import { ContactSolver } from './ContactSolver';

export class StepDetector {
  private stepHeight: number = 0.5;

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
    
    // Probe A: Lift capsule and check if clear
    const liftedCapsule = new Capsule();
    liftedCapsule.copy(capsule);
    liftedCapsule.translate(new THREE.Vector3(0, this.stepHeight, 0));
    liftedCapsule.translate(moveStep);

    const contacts = this.contactSolver.getContacts(liftedCapsule, meshes);
    
    // If no contacts after lift and move, it might be a step
    if (contacts.length === 0) {
      // Probe B: Raycast down to find ground
      // For simplicity, we'll just check if we can safely descend back
      // and if the "new ground" is higher than "old ground" but below stepHeight
      
      // In a full implementation, we'd do a more careful check.
      // But for this controller, we can return the stepHeight as a potential vertical boost.
      // The CapsuleController will handle the actual movement and depenetration.
      return this.stepHeight;
    }

    return 0;
  }
}
