import * as THREE from 'three';
import { Capsule } from './Capsule';
import { ContactPoint } from './types';
import { segmentToTriangleClosestPoints } from './MathUtils';

const _capsuleBox = new THREE.Box3();
const _tempVec1 = new THREE.Vector3();
const _line1 = new THREE.Line3();
const _targetSeg = new THREE.Vector3();
const _targetTri = new THREE.Vector3();

export class ContactSolver {
  constructor() {}

  /**
   * Finds all contact points between a capsule and the static environment.
   */
  public getContacts(capsule: Capsule, meshes: THREE.Mesh[]): ContactPoint[] {
    const contacts: ContactPoint[] = [];
    capsule.getBoundingBox(_capsuleBox);

    for (const mesh of meshes) {
      if (!mesh.geometry.boundsTree) continue;

      const worldMatrix = mesh.matrixWorld;
      const meshInvMatrix = new THREE.Matrix4().copy(mesh.matrixWorld).invert();

      // Transform capsule to local mesh space
      const localCapsule = new Capsule();
      localCapsule.copy(capsule);
      localCapsule.start.applyMatrix4(meshInvMatrix);
      localCapsule.end.applyMatrix4(meshInvMatrix);
      
      // Scale radius for local space (assuming uniform scale)
      const meshScale = _tempVec1.setFromMatrixScale(worldMatrix).x;
      const invScale = 1.0 / meshScale;
      localCapsule.radius = capsule.radius * invScale;
      
      localCapsule.getBoundingBox(_capsuleBox);

      mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (box) => {
          return box.intersectsBox(_capsuleBox);
        },
        intersectsTriangle: (tri) => {
          _line1.set(localCapsule.start, localCapsule.end);
          const dist = segmentToTriangleClosestPoints(_line1, tri, _targetSeg, _targetTri);
          
          if (dist < localCapsule.radius) {
            const normal = new THREE.Vector3().subVectors(_targetSeg, _targetTri);
            
            // If the distance is 0 (segment pierces triangle), the normal is undefined.
            // Use the triangle's face normal.
            if (dist < 0.0001) {
              tri.getNormal(normal);
            } else {
              normal.normalize();
            }

            const worldPoint = _targetTri.clone().applyMatrix4(worldMatrix);
            const worldNormal = normal.transformDirection(worldMatrix).normalize();
            
            // Convert local depth back to world depth
            const localDepth = localCapsule.radius - dist;
            const worldDepth = localDepth * meshScale;

            contacts.push({
              point: worldPoint,
              normal: worldNormal,
              depth: worldDepth
            });
          }
          return false;
        }
      });
    }

    return this.deduplicateContacts(contacts);
  }

  private deduplicateContacts(contacts: ContactPoint[]): ContactPoint[] {
    if (contacts.length <= 1) return contacts;

    const result: ContactPoint[] = [];
    
    for (const contact of contacts) {
      let isDuplicate = false;
      for (let i = 0; i < result.length; i++) {
        const other = result[i];
        const normalDot = contact.normal.dot(other.normal);
        const distSq = contact.point.distanceToSquared(other.point);

        if (normalDot > 0.99 && distSq < 0.05) {
          isDuplicate = true;
          if (contact.depth > other.depth) {
            result[i] = contact;
          }
          break;
        }
      }
      if (!isDuplicate) {
        result.push(contact);
      }
    }

    return result;
  }
}
