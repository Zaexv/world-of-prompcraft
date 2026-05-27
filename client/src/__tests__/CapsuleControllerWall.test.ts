import { describe, it } from 'vitest';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { Capsule } from '../systems/collision/Capsule';
import { ContactSolver } from '../systems/collision/ContactSolver';

describe('CapsuleController Wall', () => {
  it('debugs overcorrection', () => {
    const solver = new ContactSolver();

    const geo = new THREE.BoxGeometry(2, 10, 2);
    geo.computeBoundsTree();
    const mesh = new THREE.Mesh(geo);
    mesh.position.set(2, 0, 0); // Wall from x=1 to x=3
    mesh.updateWorldMatrix(true, true);

    const capsule = new Capsule(
      new THREE.Vector3(1, 0, 0), // Already penetrating
      new THREE.Vector3(1, 2, 0),
      0.5
    );

    const contacts = solver.getContacts(capsule, [mesh]);
    console.log("Contacts at x=1:", contacts);
  });
});
