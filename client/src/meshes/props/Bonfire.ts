import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import { createEmberParticles } from './fireParticles';

export class Bonfire extends Mesh {
  static readonly type = 'bonfire';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.9 });
    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: new THREE.Color(0xff3300),
      emissiveIntensity: 2.0,
    });

    for (let i = 0; i < 2; i++) {
      const logGeo = new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 2.5 * scale, 6);
      const log = new THREE.Mesh(logGeo, logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = i * (Math.PI / 2);
      log.castShadow = true;
      log.userData.isCollider = true;
      g.add(log);
    }

    const flameGeo = new THREE.ConeGeometry(0.6 * scale, 2.0 * scale, 6);
    const flame = new THREE.Mesh(flameGeo, fireMat);
    flame.position.y = 1.5 * scale;
    flame.userData.noCollision = true;
    g.add(flame);

    // Rising embers above the flame.
    g.add(createEmberParticles({ scale, count: 22, radius: 0.45, baseY: 0.6, rise: 2.4, speed: 1.4, size: 0.22 }));

    return g;
  }
}

registerMesh(Bonfire);
