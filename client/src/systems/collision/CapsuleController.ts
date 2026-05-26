import * as THREE from 'three';
import { Capsule } from './Capsule';
import { ContactSolver } from './ContactSolver';
import { SlopeSolver, ContactType } from './SlopeSolver';
import { StepDetector } from './StepDetector';
import { GroundSnap } from './GroundSnap';

export class CapsuleController {
  private contactSolver: ContactSolver;
  private slopeSolver: SlopeSolver;
  private stepDetector: StepDetector;
  private groundSnap: GroundSnap;
  
  public isGrounded: boolean = false;
  private gravity: number = -20; // m/s^2
  private verticalVelocity: number = 0;

  constructor() {
    this.contactSolver = new ContactSolver();
    this.slopeSolver = new SlopeSolver();
    this.stepDetector = new StepDetector(this.contactSolver);
    this.groundSnap = new GroundSnap();
  }

  /**
   * Updates the capsule position based on velocity and collisions.
   */
  public update(
    capsule: Capsule,
    velocity: THREE.Vector3,
    delta: number,
    meshes: THREE.Mesh[]
  ): void {
    // Apply gravity
    if (!this.isGrounded) {
      this.verticalVelocity += this.gravity * delta;
    } else {
      this.verticalVelocity = Math.max(this.verticalVelocity, -1); // Small downward force to stay grounded
    }

    // Combine horizontal velocity and vertical velocity
    const moveVelocity = velocity.clone();
    moveVelocity.y += this.verticalVelocity;

    // Step Detection (pre-move)
    const stepUp = this.stepDetector.detectStep(capsule, moveVelocity, delta, meshes);
    if (stepUp > 0) {
      capsule.translate(new THREE.Vector3(0, stepUp, 0));
    }

    // Move capsule
    capsule.translate(moveVelocity.clone().multiplyScalar(delta));

    // Iterative Depenetration
    this.isGrounded = false;
    for (let i = 0; i < 4; i++) {
      const contacts = this.contactSolver.getContacts(capsule, meshes);
      if (contacts.length === 0) break;

      const classified = this.slopeSolver.classifyContacts(contacts);
      
      for (const contact of classified) {
        // Push out
        const push = contact.normal.clone().multiplyScalar(contact.depth);
        capsule.translate(push);

        // Adjust velocity
        if (contact.type === ContactType.FLOOR) {
          this.isGrounded = true;
          this.verticalVelocity = Math.max(this.verticalVelocity, 0);
        } else if (contact.type === ContactType.CEILING) {
          this.verticalVelocity = Math.min(this.verticalVelocity, 0);
        }
        
        // Cancel velocity into the wall/slope
        const dot = moveVelocity.dot(contact.normal);
        if (dot < 0) {
          moveVelocity.addScaledVector(contact.normal, -dot);
        }
      }
    }

    // Ground Snapping
    if (this.isGrounded) {
      const snapDist = this.groundSnap.getSnapDistance(capsule, meshes);
      if (snapDist !== 0) {
        capsule.translate(new THREE.Vector3(0, snapDist, 0));
      }
    }
  }

  public jump(force: number): void {
    if (this.isGrounded) {
      this.verticalVelocity = force;
      this.isGrounded = false;
    }
  }

  public resetVerticalVelocity(): void {
    this.verticalVelocity = 0;
  }
}
