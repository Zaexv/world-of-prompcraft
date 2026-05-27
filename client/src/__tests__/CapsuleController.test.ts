import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { Capsule } from '../systems/collision/Capsule';
import { CapsuleController } from '../systems/collision/CapsuleController';

describe('CapsuleController', () => {
  it('prevents walking through a box', () => {
    const controller = new CapsuleController();

    const geo = new THREE.BoxGeometry(2, 2, 2);
    geo.computeBoundsTree();
    const mesh = new THREE.Mesh(geo);
    mesh.position.set(0, 0, 0);
    mesh.updateWorldMatrix(true, true);

    const capsule = new Capsule(
      new THREE.Vector3(1.2, -1, 0),
      new THREE.Vector3(1.2, 1, 0),
      0.5
    );

    // Try to move into the box (-X direction)
    const velocity = new THREE.Vector3(-10, 0, 0);
    
    // We expect the controller to push the capsule out to X=1.5
    controller.update(capsule, velocity, 0.1, [mesh]);
    
    console.log("Capsule after update:", capsule.start);
    expect(capsule.start.x).toBeGreaterThanOrEqual(1.49);
  });
});
