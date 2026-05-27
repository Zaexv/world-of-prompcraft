import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

import { CollisionSystem } from '../systems/CollisionSystem';
import { buildTower } from '../systems/worldbuilder/objects/structures';
import { Capsule } from '../systems/collision/Capsule';
import { CapsuleController } from '../systems/collision/CapsuleController';

describe('Collision Integration', () => {
  it('registers and collides with a tower', async () => {
    const cs = new CollisionSystem();
    const tower = buildTower(new THREE.Vector3(2, 0, 0), 2.0);
    
    await cs.addCollidableFiltered(tower);

    const meshes = cs.getStaticMeshes();
    console.info("Registered static meshes:", meshes.length);
    expect(meshes.length).toBeGreaterThan(0);

    const capsule = new Capsule(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 2, 0),
      0.5
    );

    const controller = new CapsuleController();
    controller.update(capsule, new THREE.Vector3(10, 0, 0), 0.1, meshes);
    
    console.info("Capsule position after update:", capsule.start);
    // Should be blocked before x = 2 - tower_radius
  });
});
