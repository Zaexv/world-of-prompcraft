import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createPergola, createArchedDoor, withLOD } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenBodega extends Mesh {
  static readonly type = 'malaka_broken_bodega';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const length = 15 * scale;
    const width = 8 * scale;
    const height = 6 * scale;

    // 0. Stone Foundation (Prevents flying)
    const foundationH = 1.2 * scale;
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4 * scale, foundationH, length + 0.4 * scale), mats.stone);
    foundation.position.y = foundationH / 2 - 0.2 * scale; // Sunk into ground
    foundation.userData.noCollision = true;
    g.add(foundation);

    // 1. Massive Industrial Nave
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mats.stucco);
    body.position.y = foundationH + height / 2 - 0.2 * scale;
    body.castShadow = true;
    body.userData.noCollision = true;
    g.add(body);

    const bodyProxy = boxCollider(width, height + foundationH, length);
    bodyProxy.position.y = (height + foundationH) / 2 - 0.2 * scale;
    g.add(bodyProxy);

    // 2. High Ventilation Windows (Ventanas Altas)
    const winW = 0.6 * scale;
    const winH = 0.6 * scale;
    for (let z = -length / 2 + 2 * scale; z <= length / 2 - 2 * scale; z += 3 * scale) {
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, winH, winW), mats.glass);
      winL.position.set(-width / 2 - 0.05 * scale, foundationH + height - 1.2 * scale, z);
      winL.userData.noCollision = true;
      g.add(winL);

      const winR = winL.clone();
      winR.position.x = width / 2 + 0.05 * scale;
      winR.userData.noCollision = true;
      g.add(winR);
    }

    // 3. Tasting Porch (Porche de Degustación)
    const porch = createPergola(4 * scale, 6 * scale, scale, mats);
    porch.userData.noCollision = true;
    porch.traverse(c => { c.userData.noCollision = true; });
    porch.position.set(width / 2 + 2 * scale, foundationH - 0.2 * scale, 2 * scale);
    g.add(porch);

    // 4. Large Main Doors (End)
    const door = createArchedDoor(3.5 * scale, 4.5 * scale, 0.6 * scale, mats);
    door.userData.noCollision = true;
    door.traverse(c => { c.userData.noCollision = true; });
    door.position.set(0, foundationH - 0.2 * scale, length / 2 + 0.1 * scale);
    g.add(door);

    // 5. Front Oculus
    const oculus = new THREE.Mesh(new THREE.CircleGeometry(0.6 * scale, 16), new THREE.MeshStandardMaterial({ color: 0x000000 }));
    oculus.position.set(0, foundationH + height - 1.7 * scale, length / 2 + 0.31 * scale);
    oculus.userData.noCollision = true;
    g.add(oculus);

    // 6. Gabled Roof
    const roofH = 3 * scale;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, Math.sqrt(Math.pow(width/2 + 0.5 * scale, 2) * 2), roofH, 4), mats.roof);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = foundationH + height + roofH / 2 - 0.2 * scale;
    roof.userData.noCollision = true;
    g.add(roof);

    // Roof Colliders
    const over = 0.5 * scale;
    const sw = Math.sqrt(Math.pow(width / 2 + over, 2) + Math.pow(roofH, 2));
    const ang = Math.atan2(roofH, width / 2 + over);
    for (const s of [-1, 1]) {
        const rColl = boxCollider(sw, 0.4 * scale, length);
        const rg = new THREE.Group();
        rColl.position.set(s * (width / 4 + over / 2), roofH / 2, 0);
        rColl.rotation.z = -s * ang;
        rg.add(rColl);
        rg.position.set(0, foundationH + height - 0.2 * scale, 0);
        g.add(rg);
    }

    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.roof);
    return withLOD(g);
  }
}

registerMesh(MalakaBrokenBodega);
