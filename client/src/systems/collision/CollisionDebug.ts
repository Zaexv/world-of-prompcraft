import * as THREE from 'three';
import { BVHManager } from './BVH';
import { CollisionBody } from './types';

export class CollisionDebug {
  private scene: THREE.Scene;
  private bvhManager: BVHManager;
  private helpers: THREE.Group;
  private enabled: boolean = false;

  constructor(scene: THREE.Scene, bvhManager: BVHManager) {
    this.scene = scene;
    this.bvhManager = bvhManager;
    this.helpers = new THREE.Group();
    this.helpers.visible = false;
    this.scene.add(this.helpers);

    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.code === 'KeyC') {
        this.toggle();
      }
    });
  }

  public toggle(): void {
    this.enabled = !this.enabled;
    this.helpers.visible = this.enabled;
    if (this.enabled) {
      this.update();
    }
  }

  public update(): void {
    if (!this.enabled) return;

    // Clear old helpers
    while (this.helpers.children.length > 0) {
      const child = this.helpers.children[0];
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        } else {
          child.material.dispose();
        }
      }
      this.helpers.remove(child);
    }

    const bodies = this.bvhManager.getBodies();
    for (const body of bodies) {
      this.createHelperForBody(body);
    }
  }

  private createHelperForBody(body: CollisionBody): void {
    if (body.type === 'MESH' && body.object instanceof THREE.Mesh) {
      // Green wireframe for BVH/Mesh
      const wireframe = new THREE.BoxHelper(body.object, 0x00ff00);
      this.helpers.add(wireframe);
    } else if (body.type === 'OBB' && body.obb) {
      // Yellow wireframe for OBB
      const geo = new THREE.BoxGeometry(
        body.obb.halfSize.x * 2,
        body.obb.halfSize.y * 2,
        body.obb.halfSize.z * 2
      );
      const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
      const mesh = new THREE.Mesh(geo, mat);
      
      mesh.position.copy(body.obb.center);
      const rot = new THREE.Euler().setFromRotationMatrix(
        new THREE.Matrix4().setFromMatrix3(body.obb.rotation)
      );
      mesh.rotation.copy(rot);
      this.helpers.add(mesh);
    } else if (body.type === 'AABB') {
      // Cyan wireframe for AABB
      const box = new THREE.Box3(body.aabb.min, body.aabb.max);
      const helper = new THREE.Box3Helper(box, 0x00ffff);
      this.helpers.add(helper);
    }
  }
}
