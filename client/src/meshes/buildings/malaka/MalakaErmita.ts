import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createRoofTile,
  createDoor,
  createWindowWithGrille,
  createFlowerPot,
} from './MalakaKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyMalakaPBR } from '../../../utils/PBRMaps';

const STONE_UNITS_PER_TILE = 2.2;

/**
 * Rewrite a BoxGeometry's UVs so the stone texture tiles by world size.
 */
function tileBoxUVsWorld(geo: THREE.BoxGeometry, w: number, h: number, d: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const faceSpan: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const uTiles = Math.max(1, Math.round(faceSpan[f][0] / STONE_UNITS_PER_TILE));
    const vTiles = Math.max(1, Math.round(faceSpan[f][1] / STONE_UNITS_PER_TILE));
    for (let i = 0; i < 4; i++) {
      const idx = f * 4 + i;
      uv.setXY(idx, uv.getX(idx) * uTiles, uv.getY(idx) * vTiles);
    }
  }
  uv.needsUpdate = true;
}

function stoneBox(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  tileBoxUVsWorld(geo, w, h, d);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createStoneCross(scale: number, mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const t = 0.1 * scale;
  const v = new THREE.Mesh(new THREE.BoxGeometry(t, 1.2 * scale, t), mat);
  const h = new THREE.Mesh(new THREE.BoxGeometry(0.6 * scale, t, t), mat);
  h.position.y = 0.2 * scale;
  g.add(v, h);
  v.castShadow = h.castShadow = true;
  return g;
}

export class MalakaErmita extends Mesh {
  static readonly type = 'malaka_ermita';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    
    // High-detail stone material
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    applyMalakaPBR(m, 'stone');
    const stoneMat = m;

    const naveW = 5 * scale;
    const naveD = 8 * scale;
    const naveH = 5 * scale;
    const facadeH = 9 * scale;

    // 1. Foundation & Base
    const foundH = 2.0 * scale;
    const foundation = stoneBox(naveW + 0.8 * scale, foundH, naveD + 1.2 * scale, stoneMat);
    foundation.position.y = -foundH / 2 + 0.3 * scale;
    g.add(foundation);

    const walkway = stoneBox(naveW + 4 * scale, 0.1 * scale, naveD + 4 * scale, stoneMat);
    walkway.position.y = 0.05 * scale;
    g.add(walkway);

    // 2. Main Nave Body (Whitewashed Stucco)
    const naveG = new THREE.Group();
    const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), mats.stucco);
    nave.position.y = naveH / 2 + 0.1 * scale;
    nave.castShadow = nave.receiveShadow = true;
    naveG.add(nave);

    // Horizontal String Courses (Stone Bands)
    for (const y of [naveH * 0.4, naveH * 0.8]) {
        const course = stoneBox(naveW + 0.1 * scale, 0.2 * scale, naveD + 0.1 * scale, stoneMat);
        course.position.y = y + 0.1 * scale;
        naveG.add(course);
    }

    // Corner Stone Quoins
    const qW = 0.45 * scale;
    const qH = 0.3 * scale;
    const qD = 0.45 * scale;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (let y = 0.5 * scale; y < naveH; y += 0.8 * scale) {
          const quoin = stoneBox(qW, qH, qD, stoneMat);
          quoin.position.set(sx * (naveW / 2), y + 0.1 * scale, sz * (naveD / 2));
          naveG.add(quoin);
        }
      }
    }
    g.add(naveG);

    const naveProxy = boxCollider(naveW, naveH, naveD);
    naveProxy.position.y = naveH / 2 + 0.1 * scale;
    g.add(naveProxy);

    // 3. Gabled Roof
    const roofH = 2.6 * scale;
    const roofOverhang = 1.0 * scale;
    const roofAngle = Math.atan2(roofH, (naveW + roofOverhang)/2);
    
    for (const side of [-1, 1]) {
        const sideW = Math.sqrt(Math.pow((naveW + roofOverhang)/2, 2) + Math.pow(roofH, 2));
        const pane = new THREE.Mesh(new THREE.BoxGeometry(sideW, 0.3 * scale, naveD + 0.2 * scale), mats.roof);
        pane.position.set(side * (naveW/4 + roofOverhang/4), naveH + roofH/2 + 0.1 * scale, 0);
        pane.rotation.z = -side * roofAngle;
        g.add(pane);
        
        // Eave tiles
        for (let z = -naveD/2; z <= naveD/2; z += 1.4 * scale) {
            const tile = createRoofTile(scale, mats);
            tile.position.set(side * (naveW/2 + 0.4 * scale), naveH + 0.2 * scale, z);
            tile.rotation.z = -side * (roofAngle + Math.PI/2);
            g.add(tile);
        }
    }

    // 4. Detailed Front Facade (Espadaña)
    const facadeW = naveW + 1.2 * scale;
    const facadeT = 1.2 * scale;
    const facadeZ = naveD / 2 + facadeT / 2 - 0.15 * scale;
    
    const lowerFacade = new THREE.Mesh(new THREE.BoxGeometry(facadeW, naveH + 2 * scale, facadeT), mats.stucco);
    lowerFacade.position.set(0, (naveH + 2 * scale) / 2 + 0.1 * scale, facadeZ);
    lowerFacade.castShadow = true;
    g.add(lowerFacade);

    // Espadaña part
    const espW = facadeW * 0.7;
    const espH = 4.2 * scale;
    const espG = new THREE.Group();
    const espBody = new THREE.Mesh(new THREE.BoxGeometry(espW, espH, facadeT), mats.stucco);
    espBody.position.y = espH / 2;
    espG.add(espBody);
    
    // Multi-stage Curved Shoulders
    for (const side of [-1, 1]) {
        const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * scale, 0.8 * scale, facadeT - 0.02 * scale, 16), mats.stucco);
        s1.rotation.x = Math.PI / 2;
        s1.position.set(side * (espW / 2 + 0.4 * scale), -0.4 * scale, 0);
        espG.add(s1);
        
        const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * scale, 0.6 * scale, facadeT - 0.01 * scale, 16), stoneMat);
        s2.rotation.x = Math.PI / 2;
        s2.position.set(side * (espW / 2), espH * 0.4, 0);
        espG.add(s2);
        
        // Sphere Finials on shoulders
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 8, 8), stoneMat);
        sphere.position.set(side * (espW / 2), espH * 0.4 + 0.6 * scale, 0);
        espG.add(sphere);
    }

    // Belfry Window Frame
    const bWinW = 1.6 * scale;
    const bWinH = 2.8 * scale;
    const bWinFrame = new THREE.Group();
    const bSideW = 0.3 * scale;
    
    for (const sx of [-1, 1]) {
        const side = stoneBox(bSideW, bWinH - bWinW/2, facadeT + 0.1 * scale, stoneMat);
        side.position.set(sx * (bWinW/2 + bSideW/2), (bWinH - bWinW/2)/2, 0);
        bWinFrame.add(side);
    }
    const bTop = new THREE.Mesh(new THREE.CylinderGeometry(bWinW/2 + bSideW, bWinW/2 + bSideW, facadeT + 0.1 * scale, 16, 1, false, 0, Math.PI), stoneMat);
    bTop.rotation.x = Math.PI/2;
    bTop.position.y = bWinH - bWinW/2;
    bWinFrame.add(bTop);

    bWinFrame.position.y = espH * 0.35;
    espG.add(bWinFrame);

    // Bell & Yoke
    const bellPoints = [];
    for (let i = 0; i <= 12; i++) {
        const r = 0.2 * scale + Math.pow(i/12, 2) * 0.4 * scale;
        const y = (i/12) * 0.8 * scale;
        bellPoints.push(new THREE.Vector2(r, -y));
    }
    const bell = new THREE.Mesh(new THREE.LatheGeometry(bellPoints, 16), new THREE.MeshStandardMaterial({ color: 0x998833, metalness: 1.0, roughness: 0.1 }));
    bell.position.set(0, espH * 0.35 + 0.8 * scale, 0);
    espG.add(bell);

    const yoke = new THREE.Mesh(new THREE.BoxGeometry(bWinW + 0.2 * scale, 0.3 * scale, 0.3 * scale), mats.wood);
    yoke.position.set(0, espH * 0.35 + 1.2 * scale, 0);
    espG.add(yoke);

    // Cross on top of Espadaña
    const fCross = createStoneCross(scale * 0.8, stoneMat);
    fCross.position.y = espH + 0.5 * scale;
    espG.add(fCross);

    espG.position.set(0, naveH + 2 * scale, facadeZ);
    g.add(espG);

    // Facade Finials (Main corners)
    for (const sx of [-1, 1]) {
        const finial = new THREE.Mesh(new THREE.ConeGeometry(0.35 * scale, 1.4 * scale, 4), stoneMat);
        finial.position.set(sx * (facadeW / 2), naveH + 2.4 * scale, facadeZ);
        g.add(finial);
    }

    const facadeProxy = boxCollider(facadeW, facadeH + 4 * scale, facadeT);
    facadeProxy.position.set(0, (facadeH + 4 * scale) / 2 + 0.1 * scale, facadeZ);
    g.add(facadeProxy);

    // 5. Portada (Detailed Entrance)
    const door = createDoor(2.4 * scale, 3.8 * scale, 0.5 * scale, mats);
    door.position.set(0, 0.1 * scale, facadeZ + facadeT / 2 + 0.05 * scale);
    g.add(door);

    // Flanking Pilasters
    for (const sx of [-1, 1]) {
        const pilaster = stoneBox(0.4 * scale, 4.0 * scale, 0.2 * scale, stoneMat);
        pilaster.position.set(sx * 1.6 * scale, 2.0 * scale, facadeZ + facadeT / 2 + 0.1 * scale);
        g.add(pilaster);
        
        const cap = stoneBox(0.5 * scale, 0.2 * scale, 0.3 * scale, stoneMat);
        cap.position.set(sx * 1.6 * scale, 4.0 * scale, facadeZ + facadeT / 2 + 0.15 * scale);
        g.add(cap);
    }

    const tejarozG = new THREE.Group();
    const tejarozW = 3.8 * scale;
    const tejarozD = 1.0 * scale;
    const tejarozBase = new THREE.Mesh(new THREE.BoxGeometry(tejarozW, 0.15 * scale, tejarozD), mats.roof);
    tejarozG.add(tejarozBase);
    
    // 3D tiles on tejaroz
    for (let i = 0; i < 7; i++) {
        const tile = createRoofTile(scale * 0.9, mats);
        const tx = (i / 6 - 0.5) * tejarozW;
        tile.position.set(tx, 0.15 * scale, 0);
        tile.rotation.x = Math.PI / 8;
        tejarozG.add(tile);
    }
    tejarozG.position.set(0, 4.2 * scale, facadeZ + facadeT / 2 + tejarozD / 2 - 0.1 * scale);
    tejarozG.rotation.x = Math.PI / 8;
    g.add(tejarozG);

    // 6. Windows with Stone Frames
    const winW = 0.9 * scale;
    const winH = 1.3 * scale;
    const winY = 2.8 * scale;
    
    // Front Oculus
    const oculusG = new THREE.Group();
    const oculusFrame = new THREE.Mesh(new THREE.TorusGeometry(0.6 * scale, 0.12 * scale, 8, 24), stoneMat);
    const oculusGlass = new THREE.Mesh(new THREE.CircleGeometry(0.6 * scale, 24), new THREE.MeshStandardMaterial({ color: 0x050505 }));
    oculusG.add(oculusFrame, oculusGlass);
    
    const roseCenter = new THREE.Mesh(new THREE.TorusGeometry(0.2 * scale, 0.05 * scale, 8, 16), stoneMat);
    roseCenter.position.z = 0.1 * scale;
    oculusG.add(roseCenter);
    for (let i = 0; i < 6; i++) {
        const spoke = stoneBox(0.06 * scale, 1.0 * scale, 0.1 * scale, stoneMat);
        spoke.rotation.z = (i / 6) * Math.PI;
        oculusG.add(spoke);
    }
    oculusG.position.set(0, naveH + 0.6 * scale, facadeZ + facadeT / 2 + 0.1 * scale);
    g.add(oculusG);

    // 7. Stepped Side Buttresses
    for (let i = -1; i <= 1; i += 2) {
        if (i === 0) continue;
        const sideZ = i * 2.5 * scale;
        for (const sideX of [-naveW/2, naveW/2]) {
            const buttG = new THREE.Group();
            const bW = 0.6 * scale;
            const bD = 1.2 * scale;
            const lowerH = naveH * 0.6;
            const upperH = naveH * 0.3;
            
            const lower = stoneBox(bW, lowerH, bD, stoneMat);
            lower.position.y = lowerH / 2;
            buttG.add(lower);
            
            const upper = stoneBox(bW, upperH, bD * 0.7, stoneMat);
            upper.position.set(0, lowerH + upperH / 2, -bD * 0.15);
            buttG.add(upper);

            buttG.position.set(sideX + (sideX > 0 ? bW/2 : -bW/2), 0.1 * scale, sideZ);
            g.add(buttG);

            // Windows
            const winG = new THREE.Group();
            const frame = stoneBox(0.4 * scale, winH + 0.6 * scale, winW + 0.6 * scale, stoneMat);
            winG.add(frame);
            const win = createWindowWithGrille(winW, winH, scale, mats);
            win.position.z = 0.1 * scale;
            winG.add(win);
            winG.rotation.y = sideX > 0 ? Math.PI/2 : -Math.PI/2;
            winG.position.set(sideX, winY, sideZ - 1 * scale); // Nudged between buttresses
            g.add(winG);
        }
    }

    // 8. Decorative touches
    for (let i = -1; i <= 1; i += 2) {
        const pot = createFlowerPot(scale * 1.3);
        pot.position.set(i * 3.8 * scale, 0.1 * scale, facadeZ + 2.5 * scale);
        g.add(pot);
    }

    return g;
  }
}

registerMesh(MalakaErmita);
