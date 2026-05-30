import * as THREE from 'three';
import { Capsule } from './Capsule';
import { ContactPoint } from './types';

const _capsuleBox = new THREE.Box3();
const _capsuleWorldBox = new THREE.Box3();
const _tempVec1 = new THREE.Vector3();
const _line1 = new THREE.Line3();
const _targetSeg = new THREE.Vector3();
const _targetTri = new THREE.Vector3();
const _meshInvMatrix = new THREE.Matrix4();
const _localCapsule = new Capsule();
const _tempNormal = new THREE.Vector3();

// Zero-allocation contact pool
const _contactsResult: ContactPoint[] = [];

export class ContactSolver {
  constructor() {}

  /**
   * Finds all contact points between a capsule and the static environment.
   */
  public getContacts(capsule: Capsule, meshes: THREE.Mesh[]): ContactPoint[] {
    let contactCount = 0;
    capsule.getBoundingBox(_capsuleWorldBox);

    for (let m = 0; m < meshes.length; m++) {
      const mesh = meshes[m]!;
      if (!mesh.geometry.boundsTree) continue;

      const worldMatrix = mesh.matrixWorld;
      
      // Fast AABB culling
      if (!mesh.userData.worldAABB) {
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        const box = mesh.geometry.boundingBox!.clone();
        box.applyMatrix4(worldMatrix);
        mesh.userData.worldAABB = box;
      }
      
      if (!_capsuleWorldBox.intersectsBox(mesh.userData.worldAABB)) {
        continue; // Capsule is completely outside this mesh's world AABB
      }

      // Cache inverse matrix to avoid 4x4 inversion in hot loop
      if (!mesh.userData.inverseMatrixWorld) {
        mesh.userData.inverseMatrixWorld = new THREE.Matrix4().copy(worldMatrix).invert();
      }
      _meshInvMatrix.copy(mesh.userData.inverseMatrixWorld);

      // Transform capsule to local mesh space
      _localCapsule.copy(capsule);
      _localCapsule.start.applyMatrix4(_meshInvMatrix);
      _localCapsule.end.applyMatrix4(_meshInvMatrix);
      
      // Scale radius for local space (assuming uniform scale)
      const meshScale = _tempVec1.setFromMatrixScale(worldMatrix).x;
      const invScale = 1.0 / meshScale;
      _localCapsule.radius = capsule.radius * invScale;
      
      // We use a local bounding box for the shapecast
      _localCapsule.getBoundingBox(_capsuleBox);

      mesh.geometry.boundsTree.shapecast({
        intersectsBounds: (box) => {
          return box.intersectsBox(_capsuleBox);
        },
        intersectsTriangle: (tri) => {
          _line1.set(_localCapsule.start, _localCapsule.end);
          // Use the highly-optimized built-in closestPointToSegment from three-mesh-bvh
          const dist = tri.closestPointToSegment(_line1, _targetTri, _targetSeg);
          
          if (dist < _localCapsule.radius) {
            _tempNormal.subVectors(_targetSeg, _targetTri);
            
            // If the distance is 0 (segment pierces triangle), the normal is undefined.
            // Use the triangle's face normal.
            if (dist < 0.0001) {
              tri.getNormal(_tempNormal);
            } else {
              _tempNormal.normalize();
            }

            // Convert local depth back to world depth
            const localDepth = _localCapsule.radius - dist;
            const worldDepth = localDepth * meshScale;

            let cp: ContactPoint;
            if (contactCount < _contactsResult.length) {
              cp = _contactsResult[contactCount]!;
            } else {
              cp = { point: new THREE.Vector3(), normal: new THREE.Vector3(), depth: 0 };
              _contactsResult.push(cp);
            }

            cp.point.copy(_targetTri).applyMatrix4(worldMatrix);
            cp.normal.copy(_tempNormal).transformDirection(worldMatrix).normalize();
            cp.depth = worldDepth;
            
            contactCount++;
          }
          return false;
        }
      });
    }

    return this.deduplicateContacts(_contactsResult, contactCount);
  }

  private deduplicateContacts(contacts: ContactPoint[], count: number): ContactPoint[] {
    if (count <= 1) {
      contacts.length = count;
      return contacts;
    }

    let uniqueCount = 0;
    
    for (let c = 0; c < count; c++) {
      const contact = contacts[c]!;
      let isDuplicate = false;
      
      for (let i = 0; i < uniqueCount; i++) {
        const other = contacts[i]!;
        const normalDot = contact.normal.dot(other.normal);
        const distSq = contact.point.distanceToSquared(other.point);

        if (normalDot > 0.99 && distSq < 0.05) {
          isDuplicate = true;
          if (contact.depth > other.depth) {
            other.point.copy(contact.point);
            other.normal.copy(contact.normal);
            other.depth = contact.depth;
          }
          break;
        }
      }
      
      if (!isDuplicate) {
        if (uniqueCount !== c) {
           contacts[uniqueCount]!.point.copy(contact.point);
           contacts[uniqueCount]!.normal.copy(contact.normal);
           contacts[uniqueCount]!.depth = contact.depth;
        }
        uniqueCount++;
      }
    }

    contacts.length = uniqueCount;
    return contacts;
  }
}
