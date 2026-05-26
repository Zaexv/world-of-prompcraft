import * as THREE from 'three';

export interface AABB {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

export interface OBB {
  center: THREE.Vector3;
  halfSize: THREE.Vector3;
  rotation: THREE.Matrix3;
}

export interface ContactPoint {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  depth: number;
}

export interface Capsule {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
}

export type CollisionShapeType = 'MESH' | 'OBB' | 'AABB' | 'CAPSULE' | 'SPHERE';

export interface CollisionBody {
  id: string;
  type: CollisionShapeType;
  object: THREE.Object3D;
  aabb: AABB;
  obb?: OBB;
  isStatic: boolean;
  layers: number; // bitmask
}

export interface TriggerVolume extends CollisionBody {
  onEnter?: (other: CollisionBody) => void;
  onExit?: (other: CollisionBody) => void;
}
