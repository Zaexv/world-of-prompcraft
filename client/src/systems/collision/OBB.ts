import * as THREE from 'three';
import { OBB as IOBB } from './types';

export class OBB implements IOBB {
  public center: THREE.Vector3 = new THREE.Vector3();
  public halfSize: THREE.Vector3 = new THREE.Vector3();
  public rotation: THREE.Matrix3 = new THREE.Matrix3();

  private static _tmpM = new THREE.Matrix4();

  constructor(center?: THREE.Vector3, halfSize?: THREE.Vector3, rotation?: THREE.Matrix3) {
    if (center) this.center.copy(center);
    if (halfSize) this.halfSize.copy(halfSize);
    if (rotation) this.rotation.copy(rotation);
  }

  public setFromMesh(mesh: THREE.Mesh): void {
    if (!mesh.geometry.boundingBox) {
      mesh.geometry.computeBoundingBox();
    }
    const bbox = mesh.geometry.boundingBox!;
    bbox.getCenter(this.center);
    
    // Get half size from local AABB
    this.halfSize.set(
      (bbox.max.x - bbox.min.x) / 2,
      (bbox.max.y - bbox.min.y) / 2,
      (bbox.max.z - bbox.min.z) / 2
    );

    // Apply world scale
    mesh.updateMatrixWorld(true);
    const worldScale = new THREE.Vector3();
    mesh.getWorldScale(worldScale);
    this.halfSize.multiply(worldScale);

    // Apply world center
    this.center.applyMatrix4(mesh.matrixWorld);

    // Get rotation matrix
    OBB._tmpM.extractRotation(mesh.matrixWorld);
    this.rotation.setFromMatrix4(OBB._tmpM);
  }

  /**
   * Separating Axis Theorem (SAT) Intersection Test
   * Tests 15 potential separating axes.
   */
  public intersectsOBB(other: OBB): boolean {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const a = this;
    const b = other;

    const Ra = a.rotation.elements;
    const Rb = b.rotation.elements;

    // Relative rotation matrix
    const R = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];
    const AbsR = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0]
    ];

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        // R[i][j] = dot(Ra_i, Rb_j)
        R[i][j] = Ra[i + 0] * Rb[j + 0] + Ra[i + 3] * Rb[j + 3] + Ra[i + 6] * Rb[j + 6];
        AbsR[i][j] = Math.abs(R[i][j]) + 1e-6; // epsilon
      }
    }

    // Relative translation vector
    const t = new THREE.Vector3().subVectors(b.center, a.center);
    // Bring translation into a's coordinate frame
    const T = [
      t.x * Ra[0] + t.y * Ra[3] + t.z * Ra[6],
      t.x * Ra[1] + t.y * Ra[4] + t.z * Ra[7],
      t.x * Ra[2] + t.y * Ra[5] + t.z * Ra[8]
    ];

    let ra, rb;

    // Test axes L = A0, A1, A2 (Face normals of A)
    for (let i = 0; i < 3; i++) {
      ra = a.halfSize.getComponent(i);
      rb = b.halfSize.x * AbsR[i][0] + b.halfSize.y * AbsR[i][1] + b.halfSize.z * AbsR[i][2];
      if (Math.abs(T[i]) > ra + rb) return false;
    }

    // Test axes L = B0, B1, B2 (Face normals of B)
    for (let i = 0; i < 3; i++) {
      ra = a.halfSize.x * AbsR[0][i] + a.halfSize.y * AbsR[1][i] + a.halfSize.z * AbsR[2][i];
      rb = b.halfSize.getComponent(i);
      if (Math.abs(T[0] * R[0][i] + T[1] * R[1][i] + T[2] * R[2][i]) > ra + rb) return false;
    }

    // Test axis L = A0 x B0
    ra = a.halfSize.y * AbsR[2][0] + a.halfSize.z * AbsR[1][0];
    rb = b.halfSize.y * AbsR[0][2] + b.halfSize.z * AbsR[0][1];
    if (Math.abs(T[2] * R[1][0] - T[1] * R[2][0]) > ra + rb) return false;

    // Test axis L = A0 x B1
    ra = a.halfSize.y * AbsR[2][1] + a.halfSize.z * AbsR[1][1];
    rb = b.halfSize.x * AbsR[0][2] + b.halfSize.z * AbsR[0][0];
    if (Math.abs(T[2] * R[1][1] - T[1] * R[2][1]) > ra + rb) return false;

    // Test axis L = A0 x B2
    ra = a.halfSize.y * AbsR[2][2] + a.halfSize.z * AbsR[1][2];
    rb = b.halfSize.x * AbsR[0][1] + b.halfSize.y * AbsR[0][0];
    if (Math.abs(T[2] * R[1][2] - T[1] * R[2][2]) > ra + rb) return false;

    // Test axis L = A1 x B0
    ra = a.halfSize.x * AbsR[2][0] + a.halfSize.z * AbsR[0][0];
    rb = b.halfSize.y * AbsR[1][2] + b.halfSize.z * AbsR[1][1];
    if (Math.abs(T[0] * R[2][0] - T[2] * R[0][0]) > ra + rb) return false;

    // Test axis L = A1 x B1
    ra = a.halfSize.x * AbsR[2][1] + a.halfSize.z * AbsR[0][1];
    rb = b.halfSize.x * AbsR[1][2] + b.halfSize.z * AbsR[1][0];
    if (Math.abs(T[0] * R[2][1] - T[2] * R[0][1]) > ra + rb) return false;

    // Test axis L = A1 x B2
    ra = a.halfSize.x * AbsR[2][2] + a.halfSize.z * AbsR[0][2];
    rb = b.halfSize.x * AbsR[1][1] + b.halfSize.y * AbsR[1][0];
    if (Math.abs(T[0] * R[2][2] - T[2] * R[0][2]) > ra + rb) return false;

    // Test axis L = A2 x B0
    ra = a.halfSize.x * AbsR[1][0] + a.halfSize.y * AbsR[0][0];
    rb = b.halfSize.y * AbsR[2][2] + b.halfSize.z * AbsR[2][1];
    if (Math.abs(T[1] * R[0][0] - T[0] * R[1][0]) > ra + rb) return false;

    // Test axis L = A2 x B1
    ra = a.halfSize.x * AbsR[1][1] + a.halfSize.y * AbsR[0][1];
    rb = b.halfSize.x * AbsR[2][2] + b.halfSize.z * AbsR[2][0];
    if (Math.abs(T[1] * R[1][1] - T[0] * R[1][1]) > ra + rb) return false;

    // Test axis L = A2 x B2
    ra = a.halfSize.x * AbsR[1][2] + a.halfSize.y * AbsR[0][2];
    rb = b.halfSize.x * AbsR[2][1] + b.halfSize.y * AbsR[2][0];
    if (Math.abs(T[1] * R[0][2] - T[0] * R[1][2]) > ra + rb) return false;

    // No separating axis found
    return true;
  }

  public getCorners(): THREE.Vector3[] {
    const corners: THREE.Vector3[] = [];
    const Ra = this.rotation.elements;
    const ax = new THREE.Vector3(Ra[0], Ra[1], Ra[2]);
    const ay = new THREE.Vector3(Ra[3], Ra[4], Ra[5]);
    const az = new THREE.Vector3(Ra[6], Ra[7], Ra[8]);

    for (let x = -1; x <= 1; x += 2) {
      for (let y = -1; y <= 1; y += 2) {
        for (let z = -1; z <= 1; z += 2) {
          const corner = this.center.clone()
            .addScaledVector(ax, x * this.halfSize.x)
            .addScaledVector(ay, y * this.halfSize.y)
            .addScaledVector(az, z * this.halfSize.z);
          corners.push(corner);
        }
      }
    }
    return corners;
  }
}
