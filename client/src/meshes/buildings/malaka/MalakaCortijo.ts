import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createArchedDoor,
  createWindowWithGrille,
  createChimney,
  createFlowerPot,
  createWoodenShutters,
  createPergola
} from './MalakaKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';

/**
 * Helper to create a proper Mediterranean hip roof.
 */
function createHipRoof(width: number, depth: number, height: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    const ridgeLen = Math.max(0.1, Math.abs(width - depth));
    const isWide = width > depth;
    const rx = isWide ? ridgeLen / 2 : 0;
    const rz = isWide ? 0 : ridgeLen / 2;

    const vertices = new Float32Array([
        -width / 2, 0, -depth / 2, // 0
         width / 2, 0, -depth / 2, // 1
         width / 2, 0,  depth / 2, // 2
        -width / 2, 0,  depth / 2, // 3
        -rx, height, -rz,          // 4
         rx, height,  rz           // 5
    ]);

    const indices = [
        0, 1, 5,  0, 5, 4, // Front
        1, 2, 5,           // Right
        2, 3, 4,  2, 4, 5, // Back
        3, 0, 4            // Left
    ];

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
}

export class MalakaCortijo extends Mesh {
  static readonly type = 'malaka_cortijo';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    
    const originalMats = getMaterials();
    // Force the brilliant whitewash
    const whiteStucco = originalMats.stucco.clone();
    whiteStucco.color.set(0xffffff);
    whiteStucco.emissive.set(0x222222); 
    whiteStucco.map = null;
    const mats = { ...originalMats, stucco: whiteStucco };

    // ── DIMENSIONS (Matching the 'Molino/Cortijo' sketch) ────────────────────
    const towerSize = 4.8 * scale;
    const towerH = 8.2 * scale;
    
    const wingLW = 12 * scale;  // Back Wing (Left)
    const wingLD = 4.8 * scale;
    const wingLH = 4.2 * scale;
    
    const wingFW = 4.8 * scale; // Front Wing (Forward)
    const wingFD = 10 * scale;
    const wingFH = 6.4 * scale;

    const foundationH = 0.5 * scale;
    const ovr = 0.5 * scale;

    // ── 1. CORNER TOWER ──────────────────────────────────────────────────────
    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerSize, towerH, towerSize), mats.stucco);
    tower.position.y = towerH / 2;
    tower.castShadow = true;
    g.add(tower);

    const towerProxy = boxCollider(towerSize, towerH, towerSize);
    towerProxy.position.y = towerH / 2;
    g.add(towerProxy);

    // Tower Foundation
    const tFnd = new THREE.Mesh(new THREE.BoxGeometry(towerSize + 0.1, foundationH, towerSize + 0.1), mats.stone);
    tFnd.position.y = foundationH / 2;
    g.add(tFnd);

    // Tower Roof (Hip)
    const tRoof = createHipRoof(towerSize + ovr * 2, towerSize + ovr * 2, 2.2 * scale, mats.roof);
    tRoof.position.y = towerH - 0.05 * scale;
    g.add(tRoof);

    // ── 2. BACK WING (Left-Extending, Pitched Roof) ──────────────────────────
    const bWX = -towerSize / 2 - wingLW / 2;
    const backWing = new THREE.Mesh(new THREE.BoxGeometry(wingLW, wingLH, wingLD), mats.stucco);
    backWing.position.set(bWX, wingLH / 2, 0);
    backWing.castShadow = true;
    g.add(backWing);

    const bWProxy = boxCollider(wingLW, wingLH, wingLD);
    bWProxy.position.copy(backWing.position);
    g.add(bWProxy);

    const bWFnd = new THREE.Mesh(new THREE.BoxGeometry(wingLW, foundationH, wingLD + 0.1), mats.stone);
    bWFnd.position.set(bWX, foundationH / 2, 0);
    g.add(bWFnd);

    // Back Wing Roof (Ridge Hip)
    const bRoofW = wingLW + ovr;
    const bRoofD = wingLD + ovr * 2;
    const bRoof = createHipRoof(bRoofW, bRoofD, 2.4 * scale, mats.roof);
    bRoof.position.set(bWX - ovr/2, wingLH - 0.05 * scale, 0);
    g.add(bRoof);

    // Arched Gate (Portón de Carros) in Back Wing
    const gate = createArchedDoor(3.8 * scale, 4.4 * scale, 0.6 * scale, mats);
    gate.position.set(bWX + 2.5 * scale, 0, wingLD / 2 + 0.05 * scale);
    g.add(gate);

    // Windows for Back Wing
    for (let i = -1; i <= 0; i++) {
        const win = createWindowWithGrille(0.9 * scale, 1.2 * scale, scale, mats);
        win.position.set(bWX + i * 4 * scale - 1.5 * scale, 2.2 * scale, wingLD / 2 + 0.05 * scale);
        g.add(win);
    }

    // Chimney
    const chim = createChimney(scale, mats);
    chim.position.set(bWX - 4 * scale, wingLH + 0.5 * scale, 0);
    g.add(chim);

    // ── 3. FRONT WING (Forward-Extending, Flat Terrace) ──────────────────────
    const fWZ = towerSize / 2 + wingFD / 2;
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(wingFW, wingFH, wingFD), mats.stucco);
    frontWing.position.set(0, wingFH / 2, fWZ);
    frontWing.castShadow = true;
    g.add(frontWing);

    const fWProxy = boxCollider(wingFW, wingFH, wingFD);
    fWProxy.position.copy(frontWing.position);
    g.add(fWProxy);

    const fWFnd = new THREE.Mesh(new THREE.BoxGeometry(wingFW + 0.1, foundationH, wingFD), mats.stone);
    fWFnd.position.set(0, foundationH / 2, fWZ);
    g.add(fWFnd);

    // Flat Terrace (Terraza Plana)
    const terraceH = 0.3 * scale;
    const terrace = new THREE.Mesh(new THREE.BoxGeometry(wingFW + 0.1 * scale, terraceH, wingFD + 0.1 * scale), mats.terracotta);
    terrace.position.set(0, wingFH + terraceH / 2, fWZ);
    g.add(terrace);

    // Parapet Wall
    const pWH = 0.9 * scale;
    const pT = 0.25 * scale;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(wingFW, pWH, pT), mats.stucco);
    p1.position.set(0, wingFH + pWH / 2, fWZ + wingFD / 2 - pT / 2);
    g.add(p1);
    const p2 = new THREE.Mesh(new THREE.BoxGeometry(pT, pWH, wingFD), mats.stucco);
    p2.position.set(wingFW / 2 - pT / 2, wingFH + pWH / 2, fWZ);
    g.add(p2);
    const p3 = new THREE.Mesh(new THREE.BoxGeometry(pT, pWH, wingFD), mats.stucco);
    p3.position.set(-wingFW / 2 + pT / 2, wingFH + pWH / 2, fWZ);
    g.add(p3);

    // Windows for Front Wing (Two floors)
    for (let i = 0; i < 3; i++) {
        const wz = fWZ + i * 3.2 * scale - 3.2 * scale;
        // Ground floor
        const winG = new THREE.Group();
        winG.position.set(wingFW / 2 + 0.05 * scale, 2.2 * scale, wz);
        winG.rotation.y = Math.PI / 2;
        winG.add(createWindowWithGrille(0.9 * scale, 1.2 * scale, scale, mats));
        winG.add(createWoodenShutters(0.9 * scale, 1.2 * scale, scale, mats));
        g.add(winG);
        // Upper floor
        const winU = createWindowWithGrille(0.6 * scale, 0.6 * scale, scale, mats);
        winU.position.set(wingFW / 2 + 0.05 * scale, 4.8 * scale, wz);
        winU.rotation.y = Math.PI / 2;
        g.add(winU);
    }

    // ── 4. COURTYARD DETAILS ─────────────────────────────────────────────────
    const pergola = createPergola(7 * scale, 4 * scale, scale, mats);
    pergola.position.set(-towerSize - 1.5 * scale, 0, wingLD / 2 + 2 * scale);
    g.add(pergola);

    const potPos = [[bWX, wingLD/2 + 0.8*scale], [wingFW/2 + 0.8*scale, fWZ]];
    for (const [px, pz] of potPos) {
        const pot = createFlowerPot(scale);
        pot.position.set(px, 0, pz);
        g.add(pot);
    }

    return g;
  }
}

registerMesh(MalakaCortijo);
