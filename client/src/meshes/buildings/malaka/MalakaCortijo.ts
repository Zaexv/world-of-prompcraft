import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createArchedDoor, createWindowWithGrille } from './MalakaKit';

export class MalakaCortijo extends Mesh {
  static readonly type = 'malaka_cortijo';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const mainW = 12 * scale;
    const mainH = 4 * scale;

    // 1. L-Shaped Main Body (two wings)
    const wing1 = new THREE.Mesh(new THREE.BoxGeometry(mainW, mainH, 4 * scale), mats.stucco);
    wing1.position.set(0, mainH / 2, 0);
    wing1.castShadow = true;
    wing1.userData.isCollider = true;
    g.add(wing1);

    const wing2 = new THREE.Mesh(new THREE.BoxGeometry(4 * scale, mainH, 6 * scale), mats.stucco);
    wing2.position.set(-mainW / 2 + 2 * scale, mainH / 2, 5 * scale);
    wing2.castShadow = true;
    wing2.userData.isCollider = true;
    g.add(wing2);

    // 2. Flat Terrace (Terraza Plana)
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(mainW - 0.2 * scale, 0.4 * scale, 4 * scale - 0.2 * scale), mats.stone);
    terrace.position.set(0, mainH + 0.2 * scale, 0);
    g.add(terrace);

    // 3. Small Tower with Pitched Roof
    const towerW = 3.5 * scale;
    const towerH = 3 * scale;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), mats.stucco);
    tower.position.set(0, mainH + towerH / 2, 0);
    tower.userData.noCollision = true; // Optimization: high-up detail
    g.add(tower);

    const tRoof = new THREE.Mesh(new THREE.ConeGeometry(towerW * 0.8, 1.8 * scale, 4), mats.roof);
    tRoof.position.set(0, mainH + towerH + 0.9 * scale, 0);
    tRoof.rotation.y = Math.PI / 4;
    tRoof.userData.noCollision = true;
    g.add(tRoof);

    // 4. Large Arched Gate (Portón de Carros)
    const gate = createArchedDoor(3.5 * scale, 3.2 * scale, 0.6 * scale, mats);
    gate.userData.noCollision = true;
    gate.traverse(c => { c.userData.noCollision = true; });
    gate.position.set(2 * scale, 0, 2.05 * scale);
    g.add(gate);

    // 5. Exterior Windows & Details
    for (let x = -4 * scale; x <= 4 * scale; x += 4 * scale) {
      if (Math.abs(x - 2 * scale) < 1) continue; // Skip if gate is here
      const win = createWindowWithGrille(0.8 * scale, 1.2 * scale, scale, mats);
      win.position.set(x, 2.2 * scale, 2.05 * scale);
      win.userData.noCollision = true;
      g.add(win);
    }

    return g;
  }
}

registerMesh(MalakaCortijo);
