import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { createEmberParticles } from './fireParticles';

export class Campfire extends Mesh {
  static readonly type = 'campfire';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const geo = new THREE.SphereGeometry(0.25 * scale, 5, 4);
      const mesh = new THREE.Mesh(geo, stoneMat);
      mesh.position.set(Math.cos(angle) * 0.6 * scale, 0.2 * scale, Math.sin(angle) * 0.6 * scale);
      mesh.userData.isCollider = true;
      g.add(mesh);
    }

    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const geo = new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 1.2 * scale, 5);
      const log = new THREE.Mesh(geo, logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = angle;
      log.position.y = 0.1 * scale;
      log.userData.noCollision = true;
      g.add(log);
    }

    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: new THREE.Color(0xff2200),
      emissiveIntensity: 1.5,
    });
    for (let i = 0; i < 3; i++) {
      const size = (0.1 + Math.random() * 0.1) * scale;
      const geo = new THREE.SphereGeometry(size, 5, 4);
      const orb = new THREE.Mesh(geo, fireMat);
      orb.position.set(
        (Math.random() - 0.5) * 0.3 * scale,
        (0.4 + Math.random() * 0.4) * scale,
        (Math.random() - 0.5) * 0.3 * scale,
      );
      orb.userData.noCollision = true;
      g.add(orb);
    }

    // Small rising embers above the fire orbs.
    g.add(createEmberParticles({ scale, count: 12, radius: 0.18, baseY: 0.5, rise: 1.4, speed: 1.0, size: 0.12 }));

    return g;
  }
}

registerMesh(Campfire);
