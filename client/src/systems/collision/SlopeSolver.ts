import * as THREE from 'three';
import { ContactPoint } from './types';

export enum ContactType {
  FLOOR,
  WALL,
  CEILING
}

export interface ClassifiedContact extends ContactPoint {
  type: ContactType;
}

export class SlopeSolver {
  private maxFloorAngle: number = 46 * (Math.PI / 180);
  private minFloorY: number = Math.cos(this.maxFloorAngle);
  private ceilingYThreshold: number = -0.1;

  constructor() {}

  public classifyContacts(contacts: ContactPoint[]): ClassifiedContact[] {
    return contacts.map(contact => {
      let type = ContactType.WALL;
      if (contact.normal.y > this.minFloorY) {
        type = ContactType.FLOOR;
      } else if (contact.normal.y < this.ceilingYThreshold) {
        type = ContactType.CEILING;
      }
      
      return {
        ...contact,
        type
      };
    });
  }

  /**
   * If on a steep slope, calculates the sliding direction.
   */
  public getSlideVelocity(velocity: THREE.Vector3, normal: THREE.Vector3): THREE.Vector3 {
    // Project velocity onto the plane defined by the normal
    const dot = velocity.dot(normal);
    const slide = new THREE.Vector3().copy(velocity).addScaledVector(normal, -dot);
    return slide;
  }
}
