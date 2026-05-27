import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { Capsule } from './client/src/systems/collision/Capsule';
import { ContactSolver } from './client/src/systems/collision/ContactSolver';

const solver = new ContactSolver();

const geo = new THREE.BoxGeometry(2, 2, 2);
geo.computeBoundsTree();
const mesh = new THREE.Mesh(geo);
mesh.position.set(0, 0, 0);
mesh.updateWorldMatrix(true, true);

// Capsule colliding with the right side of the box
// Box right face is at X=1. Capsule radius is 0.5.
// Capsule x=1.2, so depth should be 0.3.
const capsule = new Capsule(
  new THREE.Vector3(1.2, -1, 0),
  new THREE.Vector3(1.2, 1, 0),
  0.5
);

const contacts = solver.getContacts(capsule, [mesh]);
console.log("Contacts:", contacts);
