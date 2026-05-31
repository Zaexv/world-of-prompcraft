import * as THREE from 'three';
import { applyStonePBR } from '../../../utils/PBRMaps';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

export class PortalArch extends Mesh {
  static readonly type = 'portal_arch';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.75 });
    applyStonePBR(stoneMat);
    const portalMat = new THREE.MeshStandardMaterial({
      color: 0x8844ff,
      emissive: new THREE.Color(0x6622ff),
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.6,
    });

    for (const side of [-1, 1] as const) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25 * scale, 0.3 * scale, 5 * scale, 8),
        stoneMat,
      );
      pillar.position.set(side * 1.5 * scale, 2.5 * scale, 0);
      pillar.castShadow = true;
      pillar.userData.isCollider = true;
      g.add(pillar);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.6 * scale, 0.4 * scale, 0.6 * scale),
        stoneMat,
      );
      cap.position.set(side * 1.5 * scale, 5.2 * scale, 0);
      cap.userData.noCollision = true;
      g.add(cap);
    }

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(3.4 * scale, 0.5 * scale, 0.4 * scale),
      stoneMat,
    );
    lintel.position.y = 5.5 * scale;
    lintel.userData.isCollider = true;
    g.add(lintel);

    const portalGeo = new THREE.PlaneGeometry(2.6 * scale, 4.8 * scale);
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.y = 2.9 * scale;
    portal.userData.noCollision = true;
    g.add(portal);

    return g;
  }
}

registerMesh(PortalArch);
