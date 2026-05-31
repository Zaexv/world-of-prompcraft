import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createPergola, createArchedDoor } from './MalakaKit';

export class MalakaBodega extends Mesh {
  static readonly type = 'malaka_bodega';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const length = 15 * scale;
    const width = 8 * scale;
    const height = 6 * scale;

    // 1. Massive Industrial Nave
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mats.stucco);
    body.position.y = height / 2;
    body.castShadow = true;
    body.userData.isCollider = true;
    g.add(body);

    // 2. High Ventilation Windows (Ventanas Altas)
    const winW = 0.6 * scale;
    const winH = 0.6 * scale;
    for (let z = -length / 2 + 2 * scale; z <= length / 2 - 2 * scale; z += 3 * scale) {
      const winL = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, winH, winW), mats.glass);
      winL.position.set(-width / 2 - 0.05 * scale, height - 1 * scale, z);
      g.add(winL);

      const winR = winL.clone();
      winR.position.x = width / 2 + 0.05 * scale;
      g.add(winR);
    }

    // 3. Tasting Porch (Porche de Degustación)
    const porch = createPergola(4 * scale, 6 * scale, scale, mats);
    porch.userData.noCollision = true;
    porch.traverse(c => { c.userData.noCollision = true; });
    porch.position.set(width / 2 + 2 * scale, 0, 2 * scale);
    g.add(porch);

    // 4. Large Main Doors (End)
    const door = createArchedDoor(3.5 * scale, 4.5 * scale, 0.6 * scale, mats);
    door.userData.noCollision = true;
    door.traverse(c => { c.userData.noCollision = true; });
    door.position.set(0, 0, length / 2 + 0.1 * scale);
    g.add(door);

    // 5. Front Oculus
    const oculus = new THREE.Mesh(new THREE.CircleGeometry(0.6 * scale, 16), new THREE.MeshStandardMaterial({ color: 0x000000 }));
    oculus.position.set(0, height - 1.5 * scale, length / 2 + 0.31 * scale);
    oculus.userData.noCollision = true;
    g.add(oculus);

    // 6. Gabled Roof
    const roofH = 3 * scale;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, Math.sqrt(Math.pow(width/2 + 0.5 * scale, 2) * 2), roofH, 4), mats.roof);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = height + roofH / 2;
    roof.userData.noCollision = true;
    g.add(roof);

    return g;
  }
}

registerMesh(MalakaBodega);
