import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createRoofTile,
  createChimney,
  createDoor,
  createWindowWithGrille,
  createWoodenShutters,
  createFlowerPot,
  createPergola,
  withLOD,
} from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenHouse extends Mesh {
  static readonly type = 'malaka_broken_house';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const seed = Math.abs(Math.floor(pos.x * 100 + pos.z * 100));
    const isTwoStory = seed % 3 === 0;
    const hasBalcony = seed % 2 === 0;
    const hasChimney = seed % 4 === 0;

    const width = 4 * scale;
    const depth = 4 * scale;
    const floors = isTwoStory ? 2 : 1;
    const floorHeight = 2.5 * scale;
    const totalHeight = floors * floorHeight;

    // 1. Stone Foundation
    const foundH = 0.6 * scale;
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(width + 0.1, foundH, depth + 0.1), mats.stone);
    foundation.position.y = foundH / 2;
    foundation.castShadow = foundation.receiveShadow = true;
    g.add(foundation);

    // 2. Main Stucco Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, totalHeight - foundH, depth), mats.stucco);
    body.position.y = foundH + (totalHeight - foundH) / 2;
    body.castShadow = body.receiveShadow = true;
    g.add(body);

    const bodyProxy = boxCollider(width, totalHeight - foundH, depth);
    bodyProxy.position.y = foundH + (totalHeight - foundH) / 2;
    g.add(bodyProxy);

    // 3. Roof with 3D Overhang Beams
    const roofOverhang = 0.5 * scale;
    const roofRadius = Math.sqrt(Math.pow((width + roofOverhang)/2, 2) * 2);
    const roofHeight = 1.8 * scale;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(roofRadius, roofHeight, 4), mats.roof);
    roof.position.y = totalHeight + (roofHeight / 2);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = roof.receiveShadow = true;
    g.add(roof);

    // 3b. Visible 3D Roof Tiles
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i + Math.PI / 4;
      const tileCount = 8;
      const edgeLen = width + roofOverhang;
      for (let j = 0; j < tileCount; j++) {
        const tile = createRoofTile(scale, mats);
        tile.userData.noCollision = true;
        tile.userData.noCollision = true; // Optimization: decorative tile
        const offset = (j / (tileCount - 1) - 0.5) * edgeLen;
        const tx = Math.cos(angle) * (edgeLen / 2) - Math.sin(angle) * offset;
        const tz = Math.sin(angle) * (edgeLen / 2) + Math.cos(angle) * offset;
        tile.position.set(tx, totalHeight + 0.1 * scale, tz);
        tile.rotation.y = angle;
        g.add(tile);
      }
    }

    if (hasChimney) {
      const chim = createChimney(scale, mats);
      chim.position.set(width/4, totalHeight + roofHeight/3, depth/4);
      g.add(chim);
    }

    // 4. Arched Door
    const door = createDoor(1.0 * scale, 2.2 * scale, 0.2 * scale, mats);
    door.position.set(0, 0, depth / 2 + 0.05 * scale);
    g.add(door);

    // 5. Windows
    const winW = 0.6 * scale;
    const winH = 0.8 * scale;
    for (let f = 1; f <= floors; f++) {
      const fy = (f - 1) * floorHeight + 1.3 * scale;
      if (f > 1 || width > 3) {
        const wx = (f === 1) ? 1.2 * scale : 0;
        const winGroup = new THREE.Group();
        winGroup.position.set(wx, fy, depth / 2 + 0.05 * scale);
        winGroup.add(createWindowWithGrille(winW, winH, scale, mats));
        winGroup.add(createWoodenShutters(winW, winH, scale, mats));
        const pot = createFlowerPot(scale);
        pot.position.set(0, -winH/2 - 0.1 * scale, 0.1 * scale);
        winGroup.add(pot);
        g.add(winGroup);

        if (f === 2 && hasBalcony) {
          const balcGeo = new THREE.BoxGeometry(1.6 * scale, 0.1 * scale, 0.7 * scale);
          const balc = new THREE.Mesh(balcGeo, mats.stone);
          balc.position.set(wx, fy - 0.7 * scale, depth / 2 + 0.35 * scale);
          g.add(balc);

          const ironMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
          for (let i = -0.7; i <= 0.7; i += 0.1) {
            const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02 * scale, 0.8 * scale, 0.02 * scale), ironMat);
            bar.position.set(wx + i * scale, fy - 0.3 * scale, depth / 2 + 0.7 * scale);
            g.add(bar);
          }
        }
      }
    }

    if (seed % 5 === 0) {
      const pergola = createPergola(width + 2 * scale, depth / 2, scale, mats);
      pergola.position.set(0, 0, depth / 2 + depth / 4);
      g.add(pergola);
    }

    // Keep stone foundation/balcony masonry a constant scale (no stretching).
    applyWorldTiling(g, mats.stone);

    return withLOD(g);
  }
}

registerMesh(MalakaBrokenHouse);
