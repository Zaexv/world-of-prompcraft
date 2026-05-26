import * as THREE from 'three';
import { Capsule } from './Capsule';
import { ContactPoint } from './types';

const _tempVec1 = new THREE.Vector3();
const _tempVec2 = new THREE.Vector3();
const _tempVec3 = new THREE.Vector3();
const _capsuleBox = new THREE.Box3();
const _triangle = new THREE.Triangle();
const _line = new THREE.Line3();

// --- Math helper for triangle vs line segment ---
function closestPointOnTriangleToSegment(triangle: THREE.Triangle, segment: THREE.Line3, targetTri: THREE.Vector3, targetSeg: THREE.Vector3): void {
  // Simplified approximation: sample points along the segment
  let minDistSq = Infinity;
  const numSamples = 5;
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    _tempVec1.lerpVectors(segment.start, segment.end, t);
    triangle.closestPointToPoint(_tempVec1, _tempVec2);
    const distSq = _tempVec1.distanceToSquared(_tempVec2);
    if (distSq < minDistSq) {
      minDistSq = distSq;
      targetSeg.copy(_tempVec1);
      targetTri.copy(_tempVec2);
    }
  }
}

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
      
      localCapsule.getBoundingBox(_capsuleBox);

      mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (box) => {
          return box.intersectsBox(_capsuleBox);
        },
        intersectsTriangle: (tri) => {
          _line.start.copy(localCapsule.start);
          _line.end.copy(localCapsule.end);
          _triangle.copy(tri);
          
          const closestPointOnTriangle = _tempVec2;
          const closestPointOnSegment = _tempVec3;
          
          closestPointOnTriangleToSegment(_triangle, _line, closestPointOnTriangle, closestPointOnSegment);
          
          const distSq = closestPointOnTriangle.distanceToSquared(closestPointOnSegment);
          
          if (distSq < localCapsule.radius * localCapsule.radius) {
            const dist = Math.sqrt(distSq);
            const normal = new THREE.Vector3().subVectors(closestPointOnSegment, closestPointOnTriangle).normalize();
            
            if (dist < 0.0001) {
              _triangle.getNormal(normal);
            }

            const worldPoint = closestPointOnTriangle.clone().applyMatrix4(worldMatrix);
            const worldNormal = normal.clone().transformDirection(worldMatrix).normalize();
            const depth = localCapsule.radius - dist;

            contacts.push({
              point: worldPoint,
              normal: worldNormal,
              depth: depth
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
