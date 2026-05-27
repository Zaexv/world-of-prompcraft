import { describe, it } from 'vitest';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { Capsule } from '../systems/collision/Capsule';
import { ContactSolver } from '../systems/collision/ContactSolver';

describe('CapsuleController Debug', () => {
  it('debugs deep penetration', () => {
    const solver = new ContactSolver();

    const geo = new THREE.BoxGeometry(2, 2, 2);
    geo.computeBoundsTree();
    const mesh = new THREE.Mesh(geo);
    mesh.position.set(0, 0, 0);
    mesh.updateWorldMatrix(true, true);

    const capsule = new Capsule(
      new THREE.Vector3(0.2, -1, 0),
      new THREE.Vector3(0.2, 1, 0),
      0.5
    );

    const contacts = solver.getContacts(capsule, [mesh]);
    console.info("Contacts at x=0.2:", contacts);
  });
});
