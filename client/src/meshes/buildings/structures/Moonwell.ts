import * as THREE from 'three';
import { applyStonePBR } from '../../../utils/PBRMaps';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class Moonwell extends Mesh {
  static readonly type = 'moonwell';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.7 });
    applyStonePBR(stoneMat);
    const basinGeo = new THREE.CylinderGeometry(2 * scale, 2.2 * scale, 0.5 * scale, 12);
    const basin = new THREE.Mesh(basinGeo, stoneMat);
    basin.position.y = 0.25 * scale;
    basin.castShadow = true;
    basin.receiveShadow = true;
    basin.userData.isCollider = true;
    g.add(basin);

    const waterGeo = new THREE.CylinderGeometry(1.7 * scale, 1.7 * scale, 0.1 * scale, 12);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2244aa,
      emissive: new THREE.Color(0x0033cc),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.75,
      roughness: 0.2,
      // Transparent pool surface: don't write depth, or it punches holes in the
      // main sea plane (depthWrite:false) that overlaps it when the transparent
      // draw-order sort flips with camera rotation. See Forest.makeGroundPatch.
      depthWrite: false,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 0.5 * scale;
    water.userData.noCollision = true;
    g.add(water);

    const pillarGeo = new THREE.CylinderGeometry(0.15 * scale, 0.15 * scale, 3 * scale, 6);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      pillar.position.set(Math.cos(angle) * 2.5 * scale, 1.5 * scale, Math.sin(angle) * 2.5 * scale);
      pillar.castShadow = true;
      pillar.userData.isCollider = true;
      g.add(pillar);
    }

    const orbGeo = new THREE.SphereGeometry(0.3 * scale, 8, 8);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x88bbff,
      emissive: new THREE.Color(0x3366ff),
      emissiveIntensity: 1.2,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.y = 3.5 * scale;
    orb.userData.noCollision = true;
    g.add(orb);

    return g;
  }
}

registerMesh(Moonwell);
