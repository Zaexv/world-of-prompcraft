import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, createRoofTile, withLOD, MedMaterials } from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

function stoneBox(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createSimpleWoodenDoor(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
    const group = new THREE.Group();
    
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8, metalness: 0.8 });
    
    // LEFT DOOR
    const leftDoorGeo = new THREE.BoxGeometry(width/2, height, depth);
    leftDoorGeo.translate(width/4, 0, 0); 
    const leftDoor = new THREE.Mesh(leftDoorGeo, mats.door);
    leftDoor.position.set(-width/2, height/2, 0);
    leftDoor.rotation.y = -Math.PI / 2.5; 
    
    const leftHandle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), ironMat);
    leftHandle.position.set(width/2 - 0.2, 0, depth/2 + 0.03);
    leftDoor.add(leftHandle);
    
    group.add(leftDoor);

    // RIGHT DOOR
    const rightDoorGeo = new THREE.BoxGeometry(width/2, height, depth);
    rightDoorGeo.translate(-width/4, 0, 0); 
    const rightDoor = new THREE.Mesh(rightDoorGeo, mats.door);
    rightDoor.position.set(width/2, height/2, 0);
    rightDoor.rotation.y = Math.PI / 2.5; 

    const rightHandle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.03, 8, 16), ironMat);
    rightHandle.position.set(-width/2 + 0.2, 0, depth/2 + 0.03);
    rightDoor.add(rightHandle);

    group.add(rightDoor);

    return group;
}

/**
 * Creates a realistic rectangular glass window.
 */
function createRectangularGlassWindow(width: number, height: number, scale: number, stoneMat: THREE.Material, glassMat: THREE.Material): THREE.Group {
    const group = new THREE.Group();
    
    // 1. Stone Frame (Rectangular)
    const frameT = 0.4 * scale;
    const frame = stoneBox(width + frameT, height + frameT / 2, frameT, stoneMat);
    frame.position.y = (height + frameT / 4) / 2;
    group.add(frame);

    // 2. Glass Pane
    const glass = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1 * scale), glassMat);
    glass.position.y = height / 2;
    glass.position.z = 0.05 * scale;
    group.add(glass);

    // 3. Stone Tracery
    const mullionV = stoneBox(0.12 * scale, height, 0.15 * scale, stoneMat);
    mullionV.position.set(0, height/2, 0.1 * scale);
    group.add(mullionV);

    const mullionH = stoneBox(width, 0.12 * scale, 0.15 * scale, stoneMat);
    mullionH.position.set(0, height/2, 0.102 * scale);
    group.add(mullionH);

    return group;
}

export class MalakaBrokenChurch extends Mesh {
  static readonly type = 'malaka_broken_church';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();
    const stoneMat = mats.stone;

    // Helper for Corbel Tables
    const addCorbels = (parent: THREE.Group, width: number, length: number, height: number, spacing: number) => {
        const corbelG = new THREE.Group();
        const countX = Math.floor(width / spacing);
        const countZ = Math.floor(length / spacing);
        for (let i = 0; i <= countX; i++) {
            const x = -width/2 + i * spacing;
            for (const side of [-1, 1]) {
                const c = stoneBox(0.2 * scale, 0.3 * scale, 0.3 * scale, stoneMat);
                c.position.set(x, height - 0.2 * scale, side * (length/2 + 0.1 * scale));
                corbelG.add(c);
            }
        }
        for (let i = 0; i <= countZ; i++) {
            const z = -length/2 + i * spacing;
            for (const side of [-1, 1]) {
                const c = stoneBox(0.3 * scale, 0.3 * scale, 0.2 * scale, stoneMat);
                c.position.set(side * (width/2 + 0.1 * scale), height - 0.2 * scale, z);
                corbelG.add(c);
            }
        }
        parent.add(corbelG);
    };
    
    // 1. DIMENSIONS
    const naveW = 12 * scale;
    const naveD = 24 * scale;
    const naveH = 13 * scale;
    const transeptW = 22 * scale;
    const transeptD = 9 * scale;
    const transeptZ = -2 * scale;
    const facadeT = 1.8 * scale;
    const apseR = naveW / 2;
    const baseH = 1.2 * scale;

    // Plinth
    const frontEdgeZ = naveD / 2 + facadeT;
    const backEdgeZ = -naveD / 2 - apseR - 1 * scale;
    const plinthD = frontEdgeZ - backEdgeZ;
    const plinthZ = (frontEdgeZ + backEdgeZ) / 2;

    const plinthHeight = baseH + 0.4 * scale;
    const plinth = stoneBox(transeptW + 4 * scale, plinthHeight, plinthD, stoneMat);
    plinth.position.set(0, baseH - plinthHeight / 2, plinthZ);
    g.add(plinth);

    // 2. MAIN BODIES
    const createBody = (w: number, h: number, d: number, hollowFront = false) => {
      const group = new THREE.Group();
      if (hollowFront) {
         const thick = 1.0 * scale;
         const lw = new THREE.Mesh(new THREE.BoxGeometry(thick, h, d), mats.stucco);
         lw.position.set(-w/2 + thick/2, h/2, 0);
         const rw = new THREE.Mesh(new THREE.BoxGeometry(thick, h, d), mats.stucco);
         rw.position.set(w/2 - thick/2, h/2, 0);
         const bw = new THREE.Mesh(new THREE.BoxGeometry(w, h, thick), mats.stucco);
         bw.position.set(0, h/2, -d/2 + thick/2);
         const cw = new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), mats.stucco);
         cw.position.set(0, h - thick/2, 0);
         // Inner floor
         const fw = new THREE.Mesh(new THREE.BoxGeometry(w, thick, d), mats.stone);
         fw.position.set(0, -thick/2 + 0.02 * scale, 0); // slightly raised to avoid z-fighting with plinth
         
         for (const mesh of [lw, rw, bw, cw, fw]) {
             mesh.castShadow = true;
             mesh.receiveShadow = true;
             group.add(mesh);
         }
      } else {
         const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats.stucco);
         body.position.y = h / 2;
         body.castShadow = body.receiveShadow = true;
         group.add(body);
      }

      // Corner Quoins
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          for (let y = 0.3 * scale; y < h; y += 0.8 * scale) {
            const quoin = stoneBox(0.6 * scale, 0.4 * scale, 0.6 * scale, stoneMat);
            quoin.position.set(sx * (w / 2), y, sz * (d / 2));
            group.add(quoin);
          }
        }
      }
      return group;
    };

    const naveBody = createBody(naveW, naveH, naveD, true);
    naveBody.position.y = baseH;
    addCorbels(naveBody, naveW, naveD, naveH, 1.5 * scale);
    g.add(naveBody);

    const leftWing = createBody((transeptW - naveW)/2, naveH, transeptD);
    leftWing.position.set(-(transeptW + naveW)/4, baseH, transeptZ);
    addCorbels(leftWing, (transeptW - naveW)/2, transeptD, naveH, 1.5 * scale);
    
    const rightWing = createBody((transeptW - naveW)/2, naveH, transeptD);
    rightWing.position.set((transeptW + naveW)/4, baseH, transeptZ);
    addCorbels(rightWing, (transeptW - naveW)/2, transeptD, naveH, 1.5 * scale);
    
    const transGroup = new THREE.Group();
    transGroup.add(leftWing, rightWing);

    // Large Rectangular Windows
    for (const side of [-1, 1]) {
        const win = createRectangularGlassWindow(4 * scale, 8 * scale, scale, stoneMat, mats.glass);
        win.position.set(side * (transeptW / 2), naveH * 0.15, transeptZ);
        win.rotation.y = side * Math.PI / 2;
        transGroup.add(win);
    }
    g.add(transGroup);

    // 3. FRONT FACADE
    const facadeH = naveH + 6 * scale;
    const doorW = 5.0 * scale;
    const doorH = 7.0 * scale;
    const fw = naveW + 3.5 * scale;
    
    const facadeBody = new THREE.Group();
    const sideW = (fw - doorW) / 2;
    
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(sideW, facadeH, facadeT), mats.stucco);
    leftWall.position.set(-doorW/2 - sideW/2, facadeH/2, 0);
    facadeBody.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(sideW, facadeH, facadeT), mats.stucco);
    rightWall.position.set(doorW/2 + sideW/2, facadeH/2, 0);
    facadeBody.add(rightWall);

    const topWall = new THREE.Mesh(new THREE.BoxGeometry(doorW, facadeH - doorH, facadeT), mats.stucco);
    topWall.position.set(0, doorH + (facadeH - doorH)/2, 0);
    facadeBody.add(topWall);

    for (const mesh of [leftWall, rightWall, topWall]) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
    }
    facadeBody.position.set(0, baseH, naveD / 2 + facadeT / 2 - 0.1 * scale);
    g.add(facadeBody);

    const entranceDoor = createSimpleWoodenDoor(doorW, doorH, 0.4 * scale, mats);
    entranceDoor.position.set(0, baseH, naveD / 2 + facadeT - 0.1 * scale);
    g.add(entranceDoor);

    // Stairs leading to the door
    for (let i = 0; i < 3; i++) {
        const y = baseH - 0.2 * scale - i * 0.4 * scale;
        const z = naveD / 2 + facadeT + 0.6 * scale + i * 0.8 * scale;
        const step = stoneBox(doorW + 4 * scale, 0.4 * scale, 1.2 * scale, stoneMat);
        step.position.set(0, y, z);
        g.add(step);
    }

    // Interior elements
    const interiorG = new THREE.Group();
    const pewMat = mats.wood;
    
    // Elegant Carpet with Gold Trim
    const carpetGrp = new THREE.Group();
    const carpetMat = new THREE.MeshStandardMaterial({ color: 0x880000, roughness: 0.9 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, roughness: 0.6, metalness: 0.5 });
    
    // Main aisle carpet
    const mainCarpet = new THREE.Mesh(new THREE.BoxGeometry(3 * scale, 0.04 * scale, naveD - 2 * scale), carpetMat);
    const mainTrim = new THREE.Mesh(new THREE.BoxGeometry(3.2 * scale, 0.02 * scale, naveD - 1.8 * scale), trimMat);
    mainTrim.position.y = -0.01 * scale;
    carpetGrp.add(mainCarpet, mainTrim);

    // Transept cross carpet
    const transCarpet = new THREE.Mesh(new THREE.BoxGeometry(transeptW - 4 * scale, 0.04 * scale, 3 * scale), carpetMat);
    transCarpet.position.set(0, 0, transeptZ);
    const transTrim = new THREE.Mesh(new THREE.BoxGeometry(transeptW - 3.8 * scale, 0.02 * scale, 3.2 * scale), trimMat);
    transTrim.position.set(0, -0.01 * scale, transeptZ);
    carpetGrp.add(transCarpet, transTrim);
    
    carpetGrp.position.set(0, 0.03 * scale, 0); 
    interiorG.add(carpetGrp);

    // Columns lining the aisle
    const colMat = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.8 });
    for (let z = 2 * scale; z < naveD - 4 * scale; z += 4 * scale) {
        for (const sx of [-1, 1]) {
            const col = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * scale, 0.4 * scale, naveH - 1 * scale, 16), colMat);
            col.position.set(sx * 4.5 * scale, naveH/2 - 0.5 * scale, naveD/2 - z);
            const base = new THREE.Mesh(new THREE.BoxGeometry(1 * scale, 0.5 * scale, 1 * scale), stoneMat);
            base.position.set(sx * 4.5 * scale, 0.25 * scale, naveD/2 - z);
            interiorG.add(col, base);
        }
    }

    for (let z = 2 * scale; z < naveD - 4 * scale; z += 2.5 * scale) {
        for (const sx of [-1, 1]) {
            const bench = new THREE.Group();
            const seat = new THREE.Mesh(new THREE.BoxGeometry(3 * scale, 0.1 * scale, 0.6 * scale), pewMat);
            seat.position.y = 0.5 * scale;
            const back = new THREE.Mesh(new THREE.BoxGeometry(3 * scale, 0.6 * scale, 0.1 * scale), pewMat);
            back.position.set(0, 0.8 * scale, 0.3 * scale);
            const leg1 = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.5 * scale, 0.6 * scale), pewMat);
            leg1.position.set(-1.4 * scale, 0.25 * scale, 0);
            const leg2 = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.5 * scale, 0.6 * scale), pewMat);
            leg2.position.set(1.4 * scale, 0.25 * scale, 0);
            bench.add(seat, back, leg1, leg2);
            bench.position.set(sx * 2.5 * scale, 0, naveD/2 - z);
            interiorG.add(bench);

            // Bench collider
            const bColl = boxCollider(3 * scale, 1.0 * scale, 0.6 * scale);
            bColl.position.set(sx * 2.5 * scale, baseH + 0.5 * scale, naveD/2 - z);
            g.add(bColl);
        }
    }
    
    const altarG = new THREE.Group();
    const altarBase = new THREE.Mesh(new THREE.BoxGeometry(4 * scale, 1 * scale, 2 * scale), stoneMat);
    altarBase.position.y = 0.5 * scale;
    
    // Altar cloth
    const clothMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(4.1 * scale, 1.05 * scale, 2.1 * scale), clothMat);
    cloth.position.y = 0.5 * scale;
    altarG.add(altarBase, cloth);

    // Golden Chalice
    const chaliceMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1.0, roughness: 0.1 });
    const chalice = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.1 * scale, 0.4 * scale), chaliceMat);
    chalice.position.set(0, 1.2 * scale, 0.2 * scale);
    const chaliceBase = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.2 * scale, 0.2 * scale), chaliceMat);
    chaliceBase.position.set(0, 1.1 * scale, 0.2 * scale);
    altarG.add(chalice, chaliceBase);

    altarG.position.set(0, 0, -naveD/2 + 2 * scale);
    interiorG.add(altarG);

    // Altar collider
    const aColl = boxCollider(4 * scale, 1 * scale, 2 * scale);
    aColl.position.set(0, baseH + 0.5 * scale, -naveD/2 + 2 * scale);
    g.add(aColl);

    // Wall Decorations (Paintings/Stations of the Cross)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x332211 });
    const canvasMat = new THREE.MeshStandardMaterial({ color: 0xddccaa });
    for (let z = 2 * scale; z < naveD - 4 * scale; z += 4 * scale) {
        for (const sx of [-1, 1]) {
            const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 2 * scale, 1.5 * scale), frameMat);
            const canvas = new THREE.Mesh(new THREE.BoxGeometry(0.12 * scale, 1.8 * scale, 1.3 * scale), canvasMat);
            frame.add(canvas);
            
            // Position on the side walls
            frame.position.set(sx * (naveW/2 - 0.1 * scale), 2.5 * scale, naveD/2 - z);
            interiorG.add(frame);
        }
    }

    const candleMat = new THREE.MeshStandardMaterial({ color: 0xffffee, emissive: 0x554400 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
    
    // Elaborate multi-tiered Chandeliers with PointLights
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2, emissive: 0x332200 });
    const chainMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.9, roughness: 0.5 });
    for (let z = 2 * scale; z < naveD - 4 * scale; z += 8 * scale) {
        const chandelier = new THREE.Group();
        
        // Main Chain
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.05 * scale, 3 * scale), chainMat);
        chain.position.y = 11.5 * scale;
        chandelier.add(chain);
        
        // Large Ring
        const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.8 * scale, 0.08 * scale, 8, 24), goldMat);
        ring1.rotation.x = Math.PI / 2;
        ring1.position.y = 10 * scale;
        chandelier.add(ring1);

        // Small Ring
        const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.0 * scale, 0.06 * scale, 8, 24), goldMat);
        ring2.rotation.x = Math.PI / 2;
        ring2.position.y = 9 * scale;
        chandelier.add(ring2);

        // Support arms
        for (let i = 0; i < 4; i++) {
            const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * scale, 0.02 * scale, 2.5 * scale), goldMat);
            arm.position.y = 9.5 * scale;
            arm.rotation.z = Math.PI / 4;
            arm.rotation.y = i * Math.PI / 2;
            chandelier.add(arm);
        }

        // Illumination!
        const light = new THREE.PointLight(0xffddaa, 1.5, 25 * scale);
        light.position.y = 9.5 * scale;
        chandelier.add(light);
        
        // Candles on Large Ring
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const cx = Math.cos(angle) * 1.8 * scale;
            const cz = Math.sin(angle) * 1.8 * scale;
            const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * scale, 0.1 * scale, 0.4 * scale), candleMat);
            candle.position.set(cx, 10.2 * scale, cz);
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08 * scale, 0.2 * scale), flameMat);
            flame.position.set(0, 0.25 * scale, 0);
            candle.add(flame);
            chandelier.add(candle);
        }

        // Candles on Small Ring
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
            const cx = Math.cos(angle) * 1.0 * scale;
            const cz = Math.sin(angle) * 1.0 * scale;
            const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.3 * scale), candleMat);
            candle.position.set(cx, 9.15 * scale, cz);
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06 * scale, 0.15 * scale), flameMat);
            flame.position.set(0, 0.2 * scale, 0);
            candle.add(flame);
            chandelier.add(candle);
        }
        
        chandelier.position.set(0, 0, naveD/2 - z);
        interiorG.add(chandelier);
    }

    // Banners behind the altar
    const bannerMat = new THREE.MeshStandardMaterial({ color: 0x990000, roughness: 0.9 });
    for (const sx of [-1, 1]) {
        const banner = new THREE.Mesh(new THREE.BoxGeometry(1.5 * scale, 6 * scale, 0.1 * scale), bannerMat);
        banner.position.set(sx * 3 * scale, 4.5 * scale, -naveD/2 + 0.3 * scale);
        
        // Add a gold trim at the bottom
        const trim = new THREE.Mesh(new THREE.BoxGeometry(1.6 * scale, 0.2 * scale, 0.15 * scale), goldMat);
        trim.position.set(0, -2.9 * scale, 0);
        banner.add(trim);
        
        interiorG.add(banner);
    }
    for (const i of [-1, 1]) {
        const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * scale, 0.1 * scale, 0.5 * scale), candleMat);
        candle.position.set(i * 1.5 * scale, 1.25 * scale, -naveD/2 + 2 * scale);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.08 * scale, 0.2 * scale), flameMat);
        flame.position.set(0, 0.3 * scale, 0);
        candle.add(flame);
        interiorG.add(candle);
    }

    const crossWood = mats.wood;
    const vBeam = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 2.5 * scale, 0.1 * scale), crossWood);
    vBeam.position.set(0, 3.5 * scale, -naveD/2 + 0.2 * scale);
    const hBeam = new THREE.Mesh(new THREE.BoxGeometry(1.5 * scale, 0.2 * scale, 0.1 * scale), crossWood);
    hBeam.position.set(0, 4.0 * scale, -naveD/2 + 0.2 * scale);
    interiorG.add(vBeam, hBeam);
    
    interiorG.position.y = baseH;
    g.add(interiorG);

    // Rose Window
    const roseG = new THREE.Group();
    const roseR = 2.4 * scale;
    const roseFrame = new THREE.Mesh(new THREE.TorusGeometry(roseR, 0.4 * scale, 16, 48), stoneMat);
    const roseGlass = new THREE.Mesh(new THREE.CircleGeometry(roseR, 32), mats.glass);
    roseG.add(roseFrame, roseGlass);
    const roseCenter = new THREE.Mesh(new THREE.TorusGeometry(0.6 * scale, 0.2 * scale, 8, 24), stoneMat);
    roseCenter.position.z = 0.2 * scale;
    roseG.add(roseCenter);
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const spoke = stoneBox(0.12 * scale, roseR * 1.9, 0.25 * scale, stoneMat);
        spoke.rotation.z = a;
        roseG.add(spoke);
    }
    roseG.position.set(0, baseH + naveH + 2.0 * scale, naveD / 2 + facadeT + 0.1 * scale);
    g.add(roseG);

    // Removed front cross

    // 4. BELL TOWER
    const towerG = new THREE.Group();
    const tw = 5.2 * scale;
    const th1 = 20 * scale;
    const th2 = 9 * scale;
    const towerBody = stoneBox(tw, th1, tw, stoneMat);
    towerBody.position.y = th1 / 2;
    towerG.add(towerBody);

    const belfry = new THREE.Mesh(new THREE.BoxGeometry(tw - 0.8 * scale, th2, tw - 0.8 * scale), mats.stucco);
    belfry.position.y = th1 + th2 / 2;
    towerG.add(belfry);

    const bellMat = new THREE.MeshStandardMaterial({ color: 0xaa9933, metalness: 1.0, roughness: 0.1 });
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        const bW = 1.8 * scale;
        const bH = 4.5 * scale;
        const bWinG = new THREE.Group();
        const bFr = stoneBox(bW, bH, 0.8 * scale, stoneMat);
        bWinG.add(bFr);
        const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * scale, 0.55 * scale, 1.0 * scale, 16), bellMat);
        bell.position.set(0, -0.2 * scale, 0);
        bWinG.add(bell);
        const yoke = new THREE.Mesh(new THREE.BoxGeometry(bW * 0.9, 0.3 * scale, 0.3 * scale), mats.wood);
        yoke.position.y = 0.8 * scale;
        bWinG.add(yoke);
        bWinG.position.set(Math.sin(angle) * (tw/2), th1 + 4.5 * scale, Math.cos(angle) * (tw/2));
        bWinG.rotation.y = angle;
        towerG.add(bWinG);
    }

    const spireR = (tw - 0.8 * scale) * 0.45;
    const spireH = 7 * scale;
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.01, spireR, spireH, 4), mats.roof);
    spire.position.set(0, th1 + th2 + spireH / 2, 0);
    spire.rotation.y = Math.PI / 4;
    spire.castShadow = spire.receiveShadow = true;
    towerG.add(spire);

    // Removed tower cross

    towerG.position.set(-naveW / 2 - tw / 2 + 0.2 * scale, baseH, naveD / 2 - tw / 2 + 0.5 * scale);
    g.add(towerG);

    // 5. CROSSING DOME
    const domeG = new THREE.Group();
    const drumR = 5.8 * scale;
    const drumH = 3.5 * scale;
    const drumBody = new THREE.Mesh(new THREE.CylinderGeometry(drumR, drumR, drumH, 8), mats.stucco);
    drumBody.position.y = drumH / 2;
    domeG.add(drumBody);
    const cupola = new THREE.Mesh(new THREE.SphereGeometry(drumR + 0.3 * scale, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
    cupola.position.y = drumH;
    domeG.add(cupola);
    const lantern = stoneBox(1.5 * scale, 2.5 * scale, 1.5 * scale, stoneMat);
    lantern.position.y = drumH + drumR;
    // Removed dome cross
    domeG.position.set(0, baseH + naveH - 1 * scale, transeptZ);
    g.add(domeG);

    // 6. ROOFS
    const createGableRoof = (w: number, l: number, h: number) => {
      const rg = new THREE.Group();
      const over = 1.2 * scale;
      const sw = Math.sqrt(Math.pow(w / 2 + over, 2) + Math.pow(h, 2));
      const ang = Math.atan2(h, w / 2 + over);
      for (const s of [-1, 1]) {
        const pane = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.4 * scale, l), mats.roof);
        pane.position.set(s * (w / 4 + over / 2), h / 2, 0);
        pane.rotation.z = -s * ang;
        rg.add(pane);
        
        for (let z = -l/2; z <= l/2; z += 1.5 * scale) {
            const tile = createRoofTile(scale, mats);
            tile.position.set(s * (w/2 + over), -0.1 * scale, z);
            tile.rotation.z = -s * (ang + Math.PI/2);
            rg.add(tile);
        }
      }
      return rg;
    };
    const r1 = createGableRoof(naveW, naveD, 4.5 * scale);
    r1.position.y = baseH + naveH;
    g.add(r1);

    const r2 = createGableRoof(transeptW, transeptD, 4.5 * scale);
    r2.position.set(0, baseH + naveH, transeptZ);
    r2.rotation.y = Math.PI / 2;
    g.add(r2);

    // 7. APSE
    const apseG = new THREE.Group();
    const apseBody = new THREE.Mesh(new THREE.CylinderGeometry(apseR, apseR, naveH, 32), mats.stucco);
    apseBody.position.y = naveH / 2;
    apseG.add(apseBody);
    const apseRoof = new THREE.Mesh(new THREE.SphereGeometry(apseR + 0.4 * scale, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
    apseRoof.position.y = naveH - 0.1 * scale;
    apseG.add(apseRoof);
    // Removed apse cross
    apseG.position.set(0, baseH, -naveD / 2 + 0.1 * scale);
    g.add(apseG);

    // 8. BUTTRESSES & SIDE WINDOWS
    for (let z = -naveD / 2 + 3 * scale; z <= naveD / 2 - 3 * scale; z += 5 * scale) {
      if (Math.abs(z - transeptZ) < 4 * scale) continue;
      for (const side of [-1, 1]) {
        const buttG = new THREE.Group();
        const bW = 1.5 * scale;
        const bD = 2.0 * scale;
        const lowerH = naveH * 0.5;
        const upperH = naveH * 0.4;
        const lower = stoneBox(bW, lowerH, bD, stoneMat);
        lower.position.y = lowerH / 2;
        buttG.add(lower);
        const upper = stoneBox(bW, upperH, bD * 0.7, stoneMat);
        upper.position.set(0, lowerH + upperH / 2, -bD * 0.15);
        buttG.add(upper);
        const gargoyle = stoneBox(0.4 * scale, 0.25 * scale, 0.8 * scale, stoneMat);
        gargoyle.position.set(0, lowerH + upperH, -bD * 0.5);
        buttG.add(gargoyle);
        buttG.position.set(side * (naveW / 2 + 0.75 * scale), baseH, z);
        g.add(buttG);

        const sideWin = createRectangularGlassWindow(1.5 * scale, 4.5 * scale, scale, stoneMat, mats.glass);
        sideWin.position.set(side * (naveW / 2), baseH + naveH * 0.3, z);
        sideWin.rotation.y = side * Math.PI / 2;
        g.add(sideWin);
      }
    }

    // Colliders (Hollow interior for walking)
    const thick = 1.0 * scale;
    const nLeftColl = boxCollider(thick, naveH, naveD);
    nLeftColl.position.set(-naveW/2 + thick/2, baseH + naveH/2, 0);
    g.add(nLeftColl);

    const nRightColl = boxCollider(thick, naveH, naveD);
    nRightColl.position.set(naveW/2 - thick/2, baseH + naveH/2, 0);
    g.add(nRightColl);

    const nBackColl = boxCollider(naveW, naveH, thick);
    nBackColl.position.set(0, baseH + naveH/2, -naveD/2 + thick/2);
    g.add(nBackColl);

    const tLeftColl = boxCollider((transeptW - naveW)/2, naveH, transeptD);
    tLeftColl.position.set(-(transeptW + naveW)/4, baseH + naveH/2, transeptZ);
    g.add(tLeftColl);

    const tRightColl = boxCollider((transeptW - naveW)/2, naveH, transeptD);
    tRightColl.position.set((transeptW + naveW)/4, baseH + naveH/2, transeptZ);
    g.add(tRightColl);

    const towerColl = boxCollider(tw, th1 + th2, tw);
    towerColl.position.copy(towerG.position).add(new THREE.Vector3(0, (th1 + th2) / 2, 0));
    g.add(towerColl);

    const fSideW = (fw - doorW) / 2;
    const fLeftColl = boxCollider(fSideW, facadeH, facadeT);
    fLeftColl.position.set(-doorW/2 - fSideW/2, baseH + facadeH/2, naveD / 2 + facadeT / 2);
    g.add(fLeftColl);

    const fRightColl = boxCollider(fSideW, facadeH, facadeT);
    fRightColl.position.set(doorW/2 + fSideW/2, baseH + facadeH/2, naveD / 2 + facadeT / 2);
    g.add(fRightColl);

    // Floor colliders (to prevent falling through the church floor!)
    const floorD = naveD + facadeT;
    const nFloorColl = boxCollider(naveW, 0.4 * scale, floorD);
    nFloorColl.position.set(0, baseH - 0.2 * scale, facadeT / 2);
    g.add(nFloorColl);

    const tFloorColl = boxCollider(transeptW, 0.4 * scale, transeptD);
    tFloorColl.position.set(0, baseH - 0.2 * scale, transeptZ);
    g.add(tFloorColl);

    // Stairs colliders
    for (let i = 0; i < 3; i++) {
        const y = baseH - 0.2 * scale - i * 0.4 * scale;
        const z = naveD / 2 + facadeT + 0.6 * scale + i * 0.8 * scale;
        const stepColl = boxCollider(doorW + 4 * scale, 0.4 * scale, 1.2 * scale);
        stepColl.position.set(0, y, z);
        g.add(stepColl);
    }

    const apseColl = boxCollider(apseR * 2, naveH, apseR * 1.2);
    apseColl.position.set(0, baseH + naveH / 2, -naveD / 2 - apseR / 2);
    g.add(apseColl);

    // Roof Colliders
    const addGableColliders = (w: number, l: number, h: number, y: number, z: number, ry: number = 0) => {
        const over = 1.2 * scale;
        const sw = Math.sqrt(Math.pow(w / 2 + over, 2) + Math.pow(h, 2));
        const ang = Math.atan2(h, w / 2 + over);
        for (const s of [-1, 1]) {
            const rColl = boxCollider(sw, 0.4 * scale, l);
            const rg = new THREE.Group();
            rColl.position.set(s * (w / 4 + over / 2), h / 2, 0);
            rColl.rotation.z = -s * ang;
            rg.add(rColl);
            rg.position.set(0, y, z);
            rg.rotation.y = ry;
            g.add(rg);
        }
    };
    addGableColliders(naveW, naveD, 4.5 * scale, baseH + naveH, 0);
    addGableColliders(transeptW, transeptD, 4.5 * scale, baseH + naveH, transeptZ, Math.PI / 2);

    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.roof);
    applyWorldTiling(g, mats.stucco);
    applyWorldTiling(g, mats.wood);
    applyWorldTiling(g, mats.glass);
    applyWorldTiling(g, mats.door);

    return withLOD(g);
  }
}

registerMesh(MalakaBrokenChurch);
