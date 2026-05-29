import * as THREE from 'three';

const _v1 = new THREE.Vector3();
const _temp1 = new THREE.Vector3();
const _temp2 = new THREE.Vector3();
const _temp3 = new THREE.Vector3();
const EPS = 1e-10;

/**
 * Finds the closest points between two line segments.
 */
export function lineToLineClosestPoints(line1: THREE.Line3, line2: THREE.Line3, target1: THREE.Vector3, target2: THREE.Vector3): void {
  const r = _temp1.copy(line1.end).sub(line1.start);
  const s = _temp2.copy(line2.end).sub(line2.start);
  const w = _temp3.copy(line2.start).sub(line1.start);

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

  if (target1) target1.copy(line1.start).addScaledVector(r, t1);
  if (target2) target2.copy(line2.start).addScaledVector(s, t2);
}

const _edge = new THREE.Line3();
const _segPt = new THREE.Vector3();
const _triPt = new THREE.Vector3();
const _ray = new THREE.Ray();

const _bestSeg = new THREE.Vector3();
const _bestTri = new THREE.Vector3();

/**
 * Finds the exact closest points between a line segment and a triangle.
 */
export function segmentToTriangleClosestPoints(
  segment: THREE.Line3,
  triangle: THREE.Triangle,
  targetSeg: THREE.Vector3,
  targetTri: THREE.Vector3
): number {
  let minDistSq = Infinity;

  // 1. Check if segment pierces the triangle
  segment.delta(_ray.direction).normalize();
  _ray.origin.copy(segment.start);
  const intersection = _ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, _v1);
  if (intersection) {
    const distToIntersect = intersection.distanceTo(segment.start);
    const segLength = segment.distance();
    if (distToIntersect >= 0 && distToIntersect <= segLength) {
      targetSeg.copy(intersection);
      targetTri.copy(intersection);
      return 0; // Distance is 0
    }
  }

  // 2. Endpoints of segment against the solid triangle
  triangle.closestPointToPoint(segment.start, _triPt);
  const distSq1 = segment.start.distanceToSquared(_triPt);
  if (distSq1 < minDistSq) {
    minDistSq = distSq1;
    _bestSeg.copy(segment.start);
    _bestTri.copy(_triPt);
  }

  triangle.closestPointToPoint(segment.end, _triPt);
  const distSq2 = segment.end.distanceToSquared(_triPt);
  if (distSq2 < minDistSq) {
    minDistSq = distSq2;
    _bestSeg.copy(segment.end);
    _bestTri.copy(_triPt);
  }

  // 3. Edges of triangle against the segment
  const edges = [
    [triangle.a, triangle.b],
    [triangle.b, triangle.c],
    [triangle.c, triangle.a]
  ];

  for (const [v1, v2] of edges) {
    _edge.set(v1, v2);
    lineToLineClosestPoints(segment, _edge, _segPt, _triPt);
    const distSq = _segPt.distanceToSquared(_triPt);
    if (distSq < minDistSq) {
      minDistSq = distSq;
      _bestSeg.copy(_segPt);
      _bestTri.copy(_triPt);
    }
  }

  targetSeg.copy(_bestSeg);
  targetTri.copy(_bestTri);
  return Math.sqrt(minDistSq);
}
