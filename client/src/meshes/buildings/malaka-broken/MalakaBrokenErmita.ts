import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createRoofTile,
  createArchedDoor,
  createWindowWithGrille,
  withLOD,
} from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

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

export class MalakaBrokenErmita extends Mesh {
  static readonly type = 'malaka_broken_ermita';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    const voidMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0 });

    const naveW = 5 * scale;
    const naveD = 8 * scale;
    const naveH = 5 * scale;
    const facadeH = 9 * scale;

    // 1. Deep Stone Foundation (Prevents 'flying' on slopes)
    const foundH = 2.0 * scale; // Deep enough to bury into hill
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(naveW + 0.4 * scale, foundH, naveD + 0.4 * scale), mats.stone);
    foundation.position.y = -foundH / 2 + 0.4 * scale; // Top sits slightly above ground
    g.add(foundation);

    // 1b. Stone Walkway around the base
    const walkway = new THREE.Mesh(new THREE.BoxGeometry(naveW + 5 * scale, 0.1 * scale, naveD + 5 * scale), mats.stone);
    walkway.position.y = 0.05 * scale;
    g.add(walkway);

    // 2. Main Nave Body (Andalusian White)
    const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), mats.stucco);
    nave.position.y = naveH / 2 + 0.1 * scale;
    nave.castShadow = nave.receiveShadow = true;
    g.add(nave);

    const naveProxy = boxCollider(naveW, naveH, naveD);
    naveProxy.position.y = naveH / 2 + 0.1 * scale;
    g.add(naveProxy);

    // 3. Gabled Roof (Vibrant Red)
    const roofH = 2.8 * scale;
    const roofOverhang = 0.8 * scale;
    const roofGeo = new THREE.CylinderGeometry(0.01, Math.sqrt(Math.pow((naveW + roofOverhang)/2, 2) * 2), roofH, 4);
    
    const uvAttribute = roofGeo.attributes.uv;
    if (uvAttribute) {
        for (let i = 0; i < uvAttribute.count; i++) {
            const x = roofGeo.attributes.position.getX(i);
            const z = roofGeo.attributes.position.getZ(i);
            uvAttribute.setXY(i, x / scale, z / scale);
        }
    }
    
    const roofMat = mats.roof.clone();
    roofMat.side = THREE.DoubleSide;
    
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = naveH + roofH / 2 + 0.1 * scale;
    g.add(roof);

    // 3b. High-detail 3D Roof Tiles
    const tileCount = 14;
    for (let side = 0; side < 2; side++) {
      const sz = side === 0 ? (naveD / 2) + 0.2 * scale : -(naveD / 2) - 0.2 * scale;
      for (let j = 0; j < tileCount; j++) {
        const tile = createRoofTile(scale, mats);
        tile.userData.noCollision = true;
        const tx = (j / (tileCount - 1) - 0.5) * (naveW + roofOverhang);
        tile.position.set(tx, naveH + 0.2 * scale, sz);
        g.add(tile);
      }
    }

    // 4. Front Facade (Espadaña)
    const facadeW = naveW + 1.2 * scale;
    const facadeT = 1.0 * scale;
    const facade = new THREE.Mesh(new THREE.BoxGeometry(facadeW, facadeH, facadeT), mats.stucco);
    facade.position.set(0, facadeH / 2 + 0.1 * scale, naveD / 2 + facadeT / 2);
    facade.castShadow = true;
    g.add(facade);

    const facadeProxy = boxCollider(facadeW, facadeH, facadeT);
    facadeProxy.position.set(0, facadeH / 2 + 0.1 * scale, naveD / 2 + facadeT / 2);
    g.add(facadeProxy);

    // 4c. Espadaña Crown (Hip Roof)
    const crownH = 0.8 * scale;
    const crownMat = mats.roof.clone();
    crownMat.side = THREE.DoubleSide;
    
    // Resize to 1.05 * scale
    const crown = createHipRoof(facadeW * 1.05, facadeT * 1.05, crownH, crownMat);
    crown.rotation.y = 0;
    crown.position.set(0, facadeH, naveD / 2 + facadeT / 2);
    crown.castShadow = true;
    g.add(crown);

    const crownTileCount = 4;
    for (let j = 0; j < crownTileCount; j++) {
      const tile = createRoofTile(scale * 0.8, mats);
      tile.userData.noCollision = true;
      const tx = (j / (crownTileCount - 1) - 0.5) * (facadeW * 0.8);
      tile.position.set(tx, facadeH + crownH + 0.2 * scale, naveD / 2 + facadeT / 2);
      g.add(tile);
    }

    // Bell Opening (Void only, no door)
    const bellOpeningGeo = new THREE.BoxGeometry(1.8 * scale, 2.5 * scale, facadeT + 0.2);
    const bellOpening = new THREE.Mesh(bellOpeningGeo, voidMat);
    bellOpening.position.set(0, facadeH - 1.5 * scale, naveD / 2 + facadeT / 2);
    g.add(bellOpening);

    // 4b. Realistic Bell Shape (Lathe-like curve)
    const bellPoints = [];
    for (let i = 0; i <= 10; i++) {
      const r = 0.2 * scale + Math.pow(i/10, 2) * 0.4 * scale;
      const y = (i/10) * 0.8 * scale;
      bellPoints.push(new THREE.Vector2(r, -y));
    }
    const bellGeo = new THREE.LatheGeometry(bellPoints, 16);
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 1.0, roughness: 0.1 });
    const bell = new THREE.Mesh(bellGeo, bellMat);
    bell.position.set(0, facadeH + 0.1 * scale, naveD / 2 + facadeT / 2);
    g.add(bell);

    const yoke = new THREE.Mesh(new THREE.BoxGeometry(1.6 * scale, 0.3 * scale, 0.4 * scale), mats.wood);
    yoke.position.set(0, facadeH + 0.3 * scale, naveD / 2 + facadeT / 2);
    g.add(yoke);

    // 5. Main Entrance
    const door = createArchedDoor(2.4 * scale, 3.8 * scale, 0.5 * scale, mats);
    door.position.set(0, 0.1 * scale, naveD / 2 + facadeT + 0.05 * scale);
    g.add(door);

    // 6. Recessed Oculus
    const oculusFrame = new THREE.Mesh(new THREE.TorusGeometry(0.6 * scale, 0.08 * scale, 8, 24), mats.stone);
    oculusFrame.position.set(0, facadeH - 4.5 * scale, naveD / 2 + facadeT + 0.1 * scale);
    g.add(oculusFrame);

    const oculusGlass = new THREE.Mesh(new THREE.CircleGeometry(0.55 * scale, 24), voidMat);
    oculusGlass.position.set(0, facadeH - 4.5 * scale, naveD / 2 + facadeT + 0.102 * scale);
    g.add(oculusGlass);

    // 7. More Windows (Side and Rear)
    const winW = 0.8 * scale;
    const winH = 1.2 * scale;
    for (let i = -1; i <= 1; i++) {
      const sideZ = i * 2.5 * scale;
      for (const sideX of [naveW/2 + 0.05 * scale, -naveW/2 - 0.05 * scale]) {
        const win = createWindowWithGrille(winW, winH, scale, mats);
        win.rotation.y = sideX > 0 ? Math.PI/2 : -Math.PI/2;
        win.position.set(sideX, 2.5 * scale, sideZ);
        g.add(win);
      }
    }

    const rearWin = createWindowWithGrille(winW, winH, scale, mats);
    rearWin.rotation.y = Math.PI;
    rearWin.position.set(0, 3.0 * scale, -naveD/2 - 0.05 * scale);
    g.add(rearWin);

    // Roof Colliders
    const addGableColliders = (w: number, l: number, h: number, y: number, z: number) => {
        const over = 0.8 * scale;
        const sw = Math.sqrt(Math.pow(w / 2 + over, 2) + Math.pow(h, 2));
        const ang = Math.atan2(h, w / 2 + over);
        for (const s of [-1, 1]) {
            const rColl = boxCollider(sw, 0.4 * scale, l);
            const rg = new THREE.Group();
            rColl.position.set(s * (w / 4 + over / 2), h / 2, 0);
            rColl.rotation.z = -s * ang;
            rg.add(rColl);
            rg.position.set(0, y, z);
            g.add(rg);
        }
    };
    addGableColliders(naveW, naveD, roofH, naveH + 0.1 * scale, 0);

    // World-tile the materials so the masonry and patterns stay consistent.
    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.stucco);
    applyWorldTiling(g, mats.roof);

    return withLOD(g);
  }
}

registerMesh(MalakaBrokenErmita);
