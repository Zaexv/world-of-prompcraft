import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createArchedDoor,
  createPergola,
  withLOD,
} from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

/**
 * Helper to create a proper Mediterranean hip roof.
 * Uses world-unit UV mapping to prevent texture stretching.
 */
function createHipRoof(width: number, depth: number, height: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    const ridgeLen = Math.max(0.1, Math.abs(width - depth));
    const isWide = width > depth;
    const rx = isWide ? ridgeLen / 2 : 0;
    const rz = isWide ? 0 : ridgeLen / 2;

    const vertices = new Float32Array([
        -width / 2, 0, -depth / 2, // 0: BL
         width / 2, 0, -depth / 2, // 1: BR
         width / 2, 0,  depth / 2, // 2: FR
        -width / 2, 0,  depth / 2, // 3: FL
        -rx, height, -rz,          // 4: Ridge L
         rx, height,  rz           // 5: Ridge R
    ]);

    const indices = [
        0, 1, 5,  0, 5, 4, // Front/Back
        1, 2, 5,           
        2, 3, 4,  2, 4, 5, 
        3, 0, 4            
    ];

    // World-unit UV mapping (1 unit in UV = 1 unit in world space)
    const uvs = new Float32Array([
        -width / 2, -depth / 2,
         width / 2, -depth / 2,
         width / 2,  depth / 2,
        -width / 2,  depth / 2,
        -rx, -rz,
         rx,  rz
    ]);

    geo.setIndex(indices);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
}

export class MalakaBrokenCortijo extends Mesh {
  static readonly type = 'malaka_broken_cortijo';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    
    const originalMats = getMaterials();
    const whiteStucco = originalMats.stucco.clone();
    whiteStucco.color.set(0xffffff);
    whiteStucco.emissive.set(0x222222); 
    whiteStucco.map = null;
    
    const roofMat = originalMats.roof.clone();
    roofMat.side = THREE.DoubleSide;

    const mats = { ...originalMats, stucco: whiteStucco, roof: roofMat };

    const towerSize = 4.8 * scale;
    const towerH = 8.2 * scale;
    const wingLW = 12 * scale;
    const wingLD = 4.8 * scale;
    const wingLH = 4.2 * scale;
    const wingFW = 4.8 * scale;
    const wingFD = 10 * scale;
    const wingFH = 6.4 * scale;
    const zocaloH = 0.8 * scale;
    const ovr = 0.5 * scale;
    // Skirt the stone zocalos below grade (top stays at zocaloH) so the cortijo
    // doesn't float on slopes.
    const zocSkirt = zocaloH + 0.4 * scale;
    const zocY = zocaloH - zocSkirt / 2;

    // 1. CORNER TOWER
    const towerZoc = new THREE.Mesh(new THREE.BoxGeometry(towerSize, zocSkirt, towerSize), mats.stone);
    towerZoc.position.y = zocY;
    g.add(towerZoc);
    const towerWallH = towerH - zocaloH;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(towerSize - 0.06 * scale, towerWallH, towerSize - 0.06 * scale), mats.stucco);
    tower.position.y = zocaloH + towerWallH / 2;
    tower.castShadow = true;
    g.add(tower);
    const towerProxy = boxCollider(towerSize, towerH, towerSize);
    towerProxy.position.y = towerH / 2;
    g.add(towerProxy);
    const tRoof = createHipRoof(towerSize + ovr * 2, towerSize + ovr * 2, 2.2 * scale, mats.roof, scale);
    tRoof.position.y = towerH - 0.05 * scale;
    tRoof.userData.noCollision = true;
    g.add(tRoof);

    // 2. BACK WING
    const bWX = -towerSize / 2 - wingLW / 2;
    const bZoc = new THREE.Mesh(new THREE.BoxGeometry(wingLW, zocSkirt, wingLD), mats.stone);
    bZoc.position.set(bWX, zocY, 0);
    g.add(bZoc);
    const backWallH = wingLH - zocaloH;
    const backWing = new THREE.Mesh(new THREE.BoxGeometry(wingLW - 0.06 * scale, backWallH, wingLD - 0.06 * scale), mats.stucco);
    backWing.position.set(bWX, zocaloH + backWallH / 2, 0);
    backWing.castShadow = true;
    g.add(backWing);
    const bWProxy = boxCollider(wingLW, wingLH, wingLD);
    bWProxy.position.copy(backWing.position);
    g.add(bWProxy);
    const bRoofW = wingLW + ovr;
    const bRoofD = wingLD + ovr * 2;
    const bRoof = createHipRoof(bRoofW, bRoofD, 2.4 * scale, mats.roof, scale);
    bRoof.position.set(bWX - ovr/2, wingLH - 0.05 * scale, 0);
    g.add(bRoof);

    // Arched Gate (Portón de Carros) in Back Wing
    const gate = createArchedDoor(3.0 * scale, 3.0 * scale, 0.3 * scale, mats);
    gate.position.set(bWX + 2.5 * scale, zocaloH, wingLD / 2 + 0.05 * scale);
    gate.userData.noCollision = true;
    gate.traverse((child: THREE.Object3D) => {
      child.userData.noCollision = true;
    });
    g.add(gate);

    // 3. FRONT WING
    const fWZ = towerSize / 2 + wingFD / 2;
    const fZoc = new THREE.Mesh(new THREE.BoxGeometry(wingFW + 0.04 * scale, zocSkirt, wingFD + 0.04 * scale), mats.stone);
    fZoc.position.set(0, zocY, fWZ);
    g.add(fZoc);
    const frontWallH = wingFH - zocaloH;
    const frontWing = new THREE.Mesh(new THREE.BoxGeometry(wingFW - 0.06 * scale, frontWallH, wingFD - 0.06 * scale), mats.stucco);
    frontWing.position.set(0, zocaloH + frontWallH / 2, fWZ);
    frontWing.castShadow = true;
    g.add(frontWing);
    const fWProxy = boxCollider(wingFW, wingFH, wingFD);
    fWProxy.position.copy(frontWing.position);
    g.add(fWProxy);

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

    // Windows & Courtyard (simplified restoration)
    const pergola = createPergola(7 * scale, 4 * scale, scale, mats);
    pergola.position.set(-towerSize - 1.5 * scale, 0, wingLD / 2 + 2 * scale);
    g.add(pergola);

    // --- ROOF/TERRACE COLLIDERS ---
    const addHipRoofCollider = (width: number, depth: number, height: number, y: number, x: number, z: number) => {
        const rProxy = boxCollider(width, height, depth);
        rProxy.position.set(x, y + height / 2, z);
        g.add(rProxy);
    };
    addHipRoofCollider(towerSize + ovr * 2, towerSize + ovr * 2, 2.2 * scale, towerH, 0, 0);
    addHipRoofCollider(wingLW + ovr, wingLD + ovr * 2, 2.4 * scale, wingLH, bWX - ovr/2, 0);
    const terraceColl = boxCollider(wingFW, 1.2 * scale, wingFD);
    terraceColl.position.set(0, wingFH + 0.6 * scale, fWZ);
    g.add(terraceColl);

    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.stucco);
    applyWorldTiling(g, mats.roof);
    return withLOD(g);
  }
}
registerMesh(MalakaBrokenCortijo);
