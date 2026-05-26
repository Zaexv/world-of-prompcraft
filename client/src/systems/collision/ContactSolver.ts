import * as THREE from 'three';
import { Capsule } from './Capsule';
import { ContactPoint } from './types';

const _tempVec1 = new THREE.Vector3();
const _tempVec2 = new THREE.Vector3();
const _tempVec3 = new THREE.Vector3();
const _capsuleBox = new THREE.Box3();
const _line1 = new THREE.Line3();
const _line2 = new THREE.Line3();
const _plane = new THREE.Plane();
const _v1 = new THREE.Vector3();
const _point1 = new THREE.Vector3();
const _point2 = new THREE.Vector3();

const EPS = 1e-10;

function lineToLineClosestPoints(line1: THREE.Line3, line2: THREE.Line3, target1: THREE.Vector3, target2: THREE.Vector3): void {
  const r = _tempVec1.copy(line1.end).sub(line1.start);
  const s = _tempVec2.copy(line2.end).sub(line2.start);
  const w = _tempVec3.copy(line2.start).sub(line1.start);

  const a = r.dot(s);
  const b = r.dot(r);
  const c = s.dot(s);
  const d = s.dot(w);
  const e = r.dot(w);

  let t1: number, t2: number;
  const divisor = b * c - a * a;

  if (Math.abs(divisor) < EPS) {
    const d1 = -d / c;
    const d2 = (a - d) / c;
    if (Math.abs(d1 - 0.5) < Math.abs(d2 - 0.5)) {
      t1 = 0;
      t2 = d1;
    } else {
      t1 = 1;
      t2 = d2;
    }
  } else {
    t1 = (d * a + e * c) / divisor;
    t2 = (t1 * a - d) / c;
  }

  t2 = Math.max(0, Math.min(1, t2));
  t1 = Math.max(0, Math.min(1, t1));

  if (target1) {
    target1.copy(line1.start).addScaledVector(r, t1);
  }
  if (target2) {
    target2.copy(line2.start).addScaledVector(s, t2);
  }
}

function triangleCapsuleIntersect(capsule: Capsule, triangle: THREE.Triangle): { normal: THREE.Vector3, point: THREE.Vector3, depth: number } | false {
  triangle.getPlane(_plane);

  const d1 = _plane.distanceToPoint(capsule.start) - capsule.radius;
  const d2 = _plane.distanceToPoint(capsule.end) - capsule.radius;

  if ((d1 > 0 && d2 > 0) || (d1 < -capsule.radius && d2 < -capsule.radius)) {
    return false;
  }

  const delta = Math.abs(d1 / (Math.abs(d1) + Math.abs(d2)));
  const intersectPoint = _v1.copy(capsule.start).lerp(capsule.end, delta);

  if (triangle.containsPoint(intersectPoint)) {
    return {
      normal: _plane.normal.clone(),
      point: intersectPoint.clone(),
      depth: Math.abs(Math.min(d1, d2))
    };
  }

  const r2 = capsule.radius * capsule.radius;
  _line1.set(capsule.start, capsule.end);

  const lines = [
    [triangle.a, triangle.b],
    [triangle.b, triangle.c],
    [triangle.c, triangle.a]
  ];

  for (let i = 0; i < lines.length; i++) {
    _line2.set(lines[i][0], lines[i][1]);
    lineToLineClosestPoints(_line1, _line2, _point1, _point2);

    if (_point1.distanceToSquared(_point2) < r2) {
      return {
        normal: _point1.clone().sub(_point2).normalize(),
        point: _point2.clone(),
        depth: capsule.radius - _point1.distanceTo(_point2)
      };
    }
  }

  return false;
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
          const result = triangleCapsuleIntersect(localCapsule, tri);
          
          if (result) {
            const worldPoint = result.point.applyMatrix4(worldMatrix);
            const worldNormal = result.normal.transformDirection(worldMatrix).normalize();
            
            // Convert local depth back to world depth
            const worldDepth = result.depth * meshScale;

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
