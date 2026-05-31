import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createDoor,
  createWindowWithGrille,
  createWoodenShutters,
  createFlowerPot,
  createChimney,
  withLOD,
} from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenHouseReconstructed extends Mesh {
  static readonly type = 'malaka_broken_house_reconstructed';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // Dimensions
    const width = 6 * scale;
    const depth = 5 * scale;
    const houseHeight = 3.5 * scale;
    const foundationHeight = 0.2 * scale;

    // 1. Foundation
    const foundSkirt = foundationHeight + 0.4 * scale;
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2 * scale, foundSkirt, depth + 0.2 * scale),
      mats.stone
    );
    foundation.position.y = foundationHeight - foundSkirt / 2;
    foundation.castShadow = true;
    foundation.receiveShadow = true;
    foundation.userData.noCollision = true;
    g.add(foundation);

    // 2. Main Body
    const bodyHeight = houseHeight - foundationHeight;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(width, bodyHeight, depth),
      mats.stucco
    );
    body.position.y = foundationHeight + bodyHeight / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.noCollision = true;
    g.add(body);

    // 3. Azulejos
    const tileHeight = 0.7 * scale;
    const azulejoMat = mats.azulejo;
    
    const zocalo = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.05 * scale, tileHeight, depth + 0.05 * scale),
      azulejoMat
    );
    zocalo.position.y = foundationHeight + tileHeight / 2;
    zocalo.userData.noCollision = true;
    g.add(zocalo);

    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.07 * scale, 0.05 * scale, depth + 0.07 * scale),
      new THREE.MeshStandardMaterial({ color: 0xffffff })
    );
    strip.position.y = foundationHeight + tileHeight;
    strip.userData.noCollision = true;
    g.add(strip);

    // Main Collider
    const bodyProxy = boxCollider(width, houseHeight, depth);
    bodyProxy.position.y = houseHeight / 2;
    g.add(bodyProxy);

    // 4. Roof
    const roofHeight = 2.2 * scale;
    const roofOverhang = 0.5 * scale;
    const roofWidth = width + roofOverhang * 2;
    const roofDepth = depth + roofOverhang * 2;
    
    const roofGeo = new THREE.ConeGeometry(
      Math.sqrt(Math.pow(roofWidth / 2, 2) + Math.pow(roofDepth / 2, 2)),
      roofHeight,
      4
    );
    const roof = new THREE.Mesh(roofGeo, mats.roof);
    roof.position.y = houseHeight + roofHeight / 2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    roof.receiveShadow = true;
    roof.userData.noCollision = true;
    g.add(roof);

    // Roof Collider
    const rColl = boxCollider(roofWidth, roofHeight, roofDepth);
    rColl.position.y = houseHeight + roofHeight / 2;
    g.add(rColl);

    // 5. Chimney
    const chimney = createChimney(scale, mats);
    chimney.position.set(width * 0.25, houseHeight + roofHeight * 0.4, depth * 0.2);
    chimney.userData.noCollision = true;
    chimney.traverse(c => { c.userData.noCollision = true; });
    g.add(chimney);

    // 6. Door
    const door = createDoor(1.3 * scale, 2.4 * scale, 0.2 * scale, mats);
    door.position.set(0, foundationHeight, depth / 2 + 0.05 * scale);
    door.userData.noCollision = true;
    door.traverse(c => { c.userData.noCollision = true; });
    g.add(door);

    // 7. Windows
    const winW = 0.9 * scale;
    const winH = 1.1 * scale;
    const winY = foundationHeight + 1.9 * scale;

    const createWindowWithFrame = () => {
      const wg = new THREE.Group();
      const frameThickness = 0.15 * scale;
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(winW + frameThickness, winH + frameThickness, 0.1 * scale),
        mats.stone
      );
      wg.add(frame);
      const win = createWindowWithGrille(winW, winH, scale, mats);
      win.position.z = 0.02 * scale;
      wg.add(win);
      const shutters = createWoodenShutters(winW, winH, scale, mats);
      shutters.position.z = 0.05 * scale;
      wg.add(shutters);
      wg.userData.noCollision = true;
      wg.traverse(c => { c.userData.noCollision = true; });
      return wg;
    };

    for (const side of [-1, 1]) {
      const winGroup = createWindowWithFrame();
      winGroup.position.set(side * 1.8 * scale, winY, depth / 2 + 0.05 * scale);
      const pot = createFlowerPot(scale);
      pot.position.set(0, -winH / 2 - 0.2 * scale, 0.15 * scale);
      winGroup.add(pot);
      g.add(winGroup);
    }

    for (const side of [-1, 1]) {
      const winGroup = createWindowWithFrame();
      winGroup.position.set(side * (width / 2 + 0.05 * scale), winY, 0);
      winGroup.rotation.y = side * Math.PI / 2;
      g.add(winGroup);
    }

    // 8. Front Patio
    const patioDepth = 4 * scale;
    const patioWidth = width + 2 * scale;
    const patioHeight = 0.1 * scale;
    
    const patio = new THREE.Mesh(
      new THREE.BoxGeometry(patioWidth, patioHeight, patioDepth),
      mats.stone
    );
    patio.position.set(0, 0.05 * scale, depth / 2 + patioDepth / 2);
    patio.receiveShadow = true;
    patio.userData.noCollision = true;
    g.add(patio);

    const wallH = 0.9 * scale;
    const wallT = 0.3 * scale;
    
    const createPatioWall = (w: number, d: number) => {
      const wg = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mats.stucco);
      wall.position.y = wallH / 2;
      wg.add(wall);
      const wallZocalo = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.02 * scale, tileHeight * 0.7, d + 0.02 * scale),
        azulejoMat
      );
      wallZocalo.position.y = tileHeight * 0.35;
      wg.add(wallZocalo);
      wg.userData.noCollision = true;
      wg.traverse(c => { c.userData.noCollision = true; });
      return wg;
    };

    const leftWall = createPatioWall(wallT, patioDepth);
    leftWall.position.set(-patioWidth / 2 + wallT / 2, 0, depth / 2 + patioDepth / 2);
    g.add(leftWall);

    const rightWall = createPatioWall(wallT, patioDepth);
    rightWall.position.set(patioWidth / 2 - wallT / 2, 0, depth / 2 + patioDepth / 2);
    g.add(rightWall);

    const frontWallW = (patioWidth - 2 * scale) / 2;
    for (const side of [-1, 1]) {
      const fWall = createPatioWall(frontWallW, wallT);
      fWall.position.set(side * (patioWidth / 2 - frontWallW / 2), 0, depth / 2 + patioDepth - wallT / 2);
      g.add(fWall);
      const pot = createFlowerPot(scale);
      pot.position.set(side * (patioWidth / 2 - wallT / 2), wallH, depth / 2 + patioDepth - wallT / 2);
      g.add(pot);
    }

    // Patio Collider
    const patioProxy = boxCollider(patioWidth, wallH, patioDepth);
    patioProxy.position.set(0, wallH / 2, depth / 2 + patioDepth / 2);
    g.add(patioProxy);

    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.roof);
    return withLOD(g);
  }
}

registerMesh(MalakaBrokenHouseReconstructed);
