import * as THREE from 'three';
import { applyStonePBR } from '../../../utils/PBRMaps';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';

function buildTowerGroup(scale: number, bodySegs: number, addWindow: boolean): THREE.Group {
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.85 });
  applyStonePBR(stoneMat);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * scale, 1.5 * scale, 8 * scale, bodySegs), stoneMat);
  body.position.y = 4 * scale;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isCollider = true;
  g.add(body);

  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a0845, roughness: 0.7 });
  const cap = new THREE.Mesh(new THREE.ConeGeometry(1.5 * scale, 2.5 * scale, bodySegs), capMat);
  cap.position.y = 9.25 * scale;
  cap.castShadow = true;
  cap.userData.noCollision = true;
  g.add(cap);

  if (addWindow) {
    const winMat = new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: new THREE.Color(0xffcc44),
      emissiveIntensity: 0.8,
    });
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scale, 0.6 * scale, 0.1 * scale), winMat);
    win.position.set(0, 5 * scale, 1.21 * scale);
    win.userData.noCollision = true;
    g.add(win);
  }
  return g;
}

export class Tower extends Mesh {
  static readonly type = 'tower';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const lod = new THREE.LOD();
    lod.position.copy(pos);
    lod.addLevel(buildTowerGroup(scale, 8, true), 0);    // Full (0–120)
    lod.addLevel(buildTowerGroup(scale, 6, false), 120); // Mid (120–280)
    lod.addLevel(buildTowerGroup(scale, 4, false), 280); // Low (280+)
    return lod;
  }
}

registerMesh(Tower);
