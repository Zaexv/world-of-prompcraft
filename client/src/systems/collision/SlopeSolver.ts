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

  private _classifiedResults: ClassifiedContact[] = [];

  constructor() {}

  public classifyContacts(contacts: ContactPoint[]): ClassifiedContact[] {
    // Reuse array to avoid allocation
    this._classifiedResults.length = 0;
    
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      let type = ContactType.WALL;
      if (contact.normal.y > this.minFloorY) {
        type = ContactType.FLOOR;
      } else if (contact.normal.y < this.ceilingYThreshold) {
        type = ContactType.CEILING;
      }
      
      // We still need to return a ClassifiedContact which adds the 'type' field.
      // To avoid object creation, we could cast, but adding a field is safer if we reuse objects.
      // For now, let's just use the existing objects and add the type field to them (mutation)
      // or create new ones if we must. Since they are only used within the resolution loop,
      // mutation is acceptable if we document it.
      const classified = contact as ClassifiedContact;
      classified.type = type;
      this._classifiedResults.push(classified);
    }
    
    return this._classifiedResults;
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
