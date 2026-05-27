import * as THREE from 'three';
import { Capsule as CapsuleInterface } from './types';

export class Capsule implements CapsuleInterface {
  public start: THREE.Vector3;
  public end: THREE.Vector3;
  public radius: number;

  constructor(start: THREE.Vector3 = new THREE.Vector3(0, 0, 0), end: THREE.Vector3 = new THREE.Vector3(0, 1, 0), radius: number = 0.5) {
    this.start = start;
    this.end = end;
    this.radius = radius;
  }

  public set(start: THREE.Vector3, end: THREE.Vector3, radius: number): void {
    this.start.copy(start);
    this.end.copy(end);
    this.radius = radius;
  }

  public copy(other: Capsule): this {
    this.start.copy(other.start);
    this.end.copy(other.end);
    this.radius = other.radius;
    return this;
  }

  public getBoundingBox(target: THREE.Box3): THREE.Box3 {
    target.setFromPoints([this.start, this.end]);
    target.min.subScalar(this.radius);
    target.max.addScalar(this.radius);
    return target;
  }

  public translate(v: THREE.Vector3): this {
    this.start.add(v);
    this.end.add(v);
    return this;
  }

  public getCenter(target: THREE.Vector3): THREE.Vector3 {
    return target.addVectors(this.start, this.end).multiplyScalar(0.5);
  }
}
