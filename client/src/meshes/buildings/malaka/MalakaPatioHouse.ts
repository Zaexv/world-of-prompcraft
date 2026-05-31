import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createArchedDoor,
  createRoofTile,
  createWindowWithGrille,
  createFlowerPot,
} from './MalakaKit';

export class MalakaPatioHouse extends Mesh {
  static readonly type = 'malaka_patio_house';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const outerW = 10 * scale;
    const outerD = 10 * scale;
    const outerH = 6 * scale;
    const patioW = 4.5 * scale;
    const patioD = 4.5 * scale;
    const wallT = 1.2 * scale;

    // 1. Foundation
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(outerW + 0.4, 0.5 * scale, outerD + 0.4), mats.stone);
    foundation.position.y = 0.25 * scale;
    g.add(foundation);

    // 2. Main Building Volumes (4 wings around the patio)
    const wingH = outerH - 0.5 * scale;
    const wings = [
      { w: outerW, h: wingH, d: wallT, x: 0, z: (outerD - wallT) / 2 }, // Front
      { w: outerW, h: wingH, d: wallT, x: 0, z: -(outerD - wallT) / 2 }, // Back
      { w: wallT, h: wingH, d: outerD - wallT * 2, x: (outerW - wallT) / 2, z: 0 }, // Right
      { w: wallT, h: wingH, d: outerD - wallT * 2, x: -(outerW - wallT) / 2, z: 0 }, // Left
    ];

    for (const w of wings) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), mats.stucco);
      mesh.position.set(w.x, 0.5 * scale + w.h / 2, w.z);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.isCollider = true;
      g.add(mesh);
    }

    // 3. Central Patio Floor & Fountain
    const patioFloor = new THREE.Mesh(new THREE.PlaneGeometry(patioW + 1 * scale, patioD + 1 * scale), mats.stone);
    patioFloor.rotation.x = -Math.PI / 2;
    patioFloor.position.y = 0.51 * scale;
    g.add(patioFloor);

    // Fountain
    const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * scale, 1.0 * scale, 0.4 * scale, 8), mats.stone);
    fountainBase.position.y = 0.7 * scale;
    g.add(fountainBase);

    const waterMat = new THREE.MeshStandardMaterial({ color: 0x44aa88, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.8 });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * scale, 0.7 * scale, 0.1 * scale, 16), waterMat);
    water.position.y = 0.9 * scale;
    g.add(water);

    const fountainStem = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 0.8 * scale, 8), mats.stone);
    fountainStem.position.y = 1.1 * scale;
    g.add(fountainStem);

    // 4. Interior Arched Portico (The hallmark of the Patio house)
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i;
      const arcadeGroup = new THREE.Group();
      const dist = (patioW / 2) + 0.5 * scale;
      arcadeGroup.position.set(Math.cos(angle) * dist, 0.5 * scale, Math.sin(angle) * dist);
      arcadeGroup.rotation.y = -angle;

      const archW = 1.2 * scale;
      const archH = 2.4 * scale;
      for (let x = -1; x <= 1; x++) {
        const arch = createArchedDoor(archW, archH, 0.2 * scale, mats);
        // Make them white stucco arches instead of wood
        arch.traverse(c => { if(c instanceof THREE.Mesh && c.material === mats.wood) c.material = mats.stucco; });
        arch.position.x = x * 1.5 * scale;
        arcadeGroup.add(arch);
      }
      g.add(arcadeGroup);
    }

    // 5. Hip Roof (4-sided pitched roof)
    const roofH = 2.5 * scale;
    const roofOverhang = 0.6 * scale;
    const roofGeo = new THREE.ConeGeometry(Math.sqrt(Math.pow((outerW + roofOverhang)/2, 2) * 2), roofH, 4);
    const roof = new THREE.Mesh(roofGeo, mats.roof);
    roof.position.y = outerH + roofH / 2;
    roof.rotation.y = Math.PI / 4;
    g.add(roof);

    // 3D Tiles along eaves
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i + Math.PI / 4;
      const tileCount = 15;
      const edgeLen = outerW + roofOverhang;
      for (let j = 0; j < tileCount; j++) {
        const tile = createRoofTile(scale, mats);
        tile.userData.noCollision = true;
        tile.userData.noCollision = true; // Optimization: decorative tile
        const offset = (j / (tileCount - 1) - 0.5) * edgeLen;
        const tx = Math.cos(angle) * (edgeLen / 2) - Math.sin(angle) * offset;
        const tz = Math.sin(angle) * (edgeLen / 2) + Math.cos(angle) * offset;
        tile.position.set(tx, outerH + 0.1 * scale, tz);
        tile.rotation.y = angle;
        g.add(tile);
      }
    }

    // 6. Exterior Details
    // Main Entrance (Arched, large)
    const mainDoor = createArchedDoor(2.0 * scale, 3.2 * scale, 0.4 * scale, mats);
    mainDoor.position.set(0, 0.5 * scale, outerD / 2 + 0.1 * scale);
    g.add(mainDoor);

    // Exterior Windows with grilles
    const winW = 0.7 * scale;
    const winH = 1.0 * scale;
    const winY = 3.0 * scale;
    for (let x = -3.5 * scale; x <= 3.5 * scale; x += 7.0 * scale) {
      const win = createWindowWithGrille(winW, winH, scale, mats);
      win.position.set(x, winY, outerD / 2 + 0.05 * scale);
      g.add(win);
    }

    // 7. Patio Flower Pots
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const pot = createFlowerPot(scale * 1.2);
      pot.position.set(Math.cos(a) * (patioW / 2 + 0.3 * scale), 0.5 * scale, Math.sin(a) * (patioD / 2 + 0.3 * scale));
      g.add(pot);
    }

    return g;
  }
}

registerMesh(MalakaPatioHouse);
