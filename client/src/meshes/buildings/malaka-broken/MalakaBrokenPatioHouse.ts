import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createDoor,
  createRoofTile,
  createWindowWithGrille,
  createFlowerPot,
  createChimney,
  createWoodenShutters,
  createWoodenBench,
  createWoodenTable,
  createClimbingPlant,
  withLOD,
  MedMaterials,
} from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';

export class MalakaBrokenPatioHouse extends Mesh {
  static readonly type = 'malaka_broken_patio_house';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // 1. Dimensions
    const outerW = 12 * scale;
    const outerD = 12 * scale;
    const groundH = 3.5 * scale;
    const upperH = 3.2 * scale;
    const totalH = groundH + upperH;
    
    const patioW = 5.5 * scale;
    const patioD = 5.5 * scale;
    const wingT = (outerW - patioW) / 2; 
    const zocaloH = 0.8 * scale;

    // 2. Foundation — scale-aware step, skirt buried below grade (top stays at 0.49).
    const foundSkirt = 0.7 * scale;
    const foundation = new THREE.Mesh(new THREE.BoxGeometry(outerW + 0.8 * scale, foundSkirt, outerD + 0.8 * scale), mats.stone);
    foundation.position.y = 0.49 * scale - foundSkirt / 2;
    g.add(foundation);

    // 3. Wings
    const wings = [
      { w: outerW + 0.02 * scale, d: wingT, x: 0, z: (outerD - wingT) / 2 }, 
      { w: outerW + 0.02 * scale, d: wingT, x: 0, z: -(outerD - wingT) / 2 },
      { w: wingT, d: patioD - 0.02 * scale, x: (outerW - wingT) / 2, z: 0 }, 
      { w: wingT, d: patioD - 0.02 * scale, x: -(outerW - wingT) / 2, z: 0 }, 
    ];

    for (let i = 0; i < wings.length; i++) {
      const w = wings[i];
      const isFrontBack = (i <= 1);
      const wingGroup = new THREE.Group();
      wingGroup.position.set(w.x, 0.5 * scale, w.z);

      // --- Ground Floor ---
      // Zocalo — single proud stone band (a separate slightly-wider "cap" box on
      // top created the same coplanar stone-on-stone flicker as the inter-floor
      // cornice did). The stucco wall is narrower, so it cleanly steps in on top.
      const zw = isFrontBack ? w.w + 0.1 * scale : w.w + 0.04 * scale;
      const zd = isFrontBack ? w.d + 0.05 * scale : w.d + 0.04 * scale;
      const zocalo = new THREE.Mesh(new THREE.BoxGeometry(zw, zocaloH, zd), mats.stone);
      zocalo.position.y = zocaloH / 2;
      wingGroup.add(zocalo);

      // Main Wall (Stucco) — narrower than the zócalo so it steps in cleanly.
      const wallH = groundH - zocaloH;
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w.w - 0.08 * scale, wallH, w.d - 0.08 * scale), mats.stucco);
      wall.position.y = zocaloH + wallH / 2;
      wall.castShadow = wall.receiveShadow = true;
      wingGroup.add(wall);

      // --- Azulejo Zócalo ---
      const azH = 0.9 * scale;
      const azD = 0.02 * scale;
      const azMesh = new THREE.Mesh(
          (i <= 1) ? new THREE.BoxGeometry(w.w, azH, azD) : new THREE.BoxGeometry(azD, azH, w.d),
          mats.azulejo
      );
      azMesh.position.y = zocaloH + azH/2;
      if (i === 0) azMesh.position.z = -w.d/2 + azD/2;
      if (i === 1) azMesh.position.z = w.d/2 - azD/2;
      if (i === 2) azMesh.position.x = -w.w/2 + azD/2;
      if (i === 3) azMesh.position.x = w.w/2 - azD/2;
      wingGroup.add(azMesh);

      // --- Exposed Ceiling Beams ---
      // Sunk so their TOP face is well below groundH; at groundH the beam tops were
      // coplanar with the ground-wall top (full-width, wood vs stucco) → flicker.
      const beamCount = 6;
      for (let j = 0; j < beamCount; j++) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(w.w * 0.9, 0.1 * scale, 0.15 * scale), mats.wood);
          if (i <= 1) {
              beam.position.set(0, groundH - 0.12 * scale, (j / (beamCount-1) - 0.5) * w.d * 0.8);
          } else {
              beam.rotation.y = Math.PI / 2;
              beam.position.set((j / (beamCount-1) - 0.5) * w.w * 0.8, groundH - 0.12 * scale, 0);
          }
          wingGroup.add(beam);
      }

      // --- Cornice (single proud stone band) ---
      // One box, clearly proud of both walls. A separate slightly-wider "cap" box
      // stacked on it produced near-coplanar parallel stone faces that z-fought as
      // a flickering line right between the two floors (visible in blue_reflection.png).
      const cw = isFrontBack ? w.w + 0.12 * scale : w.w + 0.04 * scale;
      const cd = isFrontBack ? w.d + 0.12 * scale : w.d + 0.1 * scale;
      const corniceH = 0.22 * scale;
      const cornice = new THREE.Mesh(new THREE.BoxGeometry(cw, corniceH, cd), mats.stone);
      cornice.position.y = groundH;
      wingGroup.add(cornice);

      // --- Upper Floor ---
      const uWallH = upperH;
      const isBackWing = (i === 1); 
      
      if (isBackWing) {
        // Receded Central Balcony — the back wall stays full width, but the slab,
        // railing, pillars and pots span only the central opening between the side
        // wings (≈ patio width). At full façade width the terracotta floor clips
        // out past the side-wing walls.
        const balconyDepth = wingT * 0.7;
        const mainWallD = wingT - balconyDepth;
        const balconyW = patioW - 0.2 * scale;

        const uWall = new THREE.Mesh(new THREE.BoxGeometry(w.w, uWallH, mainWallD), mats.stucco);
        uWall.position.y = groundH + uWallH / 2;
        uWall.position.z = -balconyDepth / 2;
        wingGroup.add(uWall);

        const bFloor = new THREE.Mesh(new THREE.BoxGeometry(balconyW, 0.2 * scale, balconyDepth), mats.terracotta);
        bFloor.position.y = groundH + 0.12 * scale;
        bFloor.position.z = mainWallD / 2 + balconyDepth / 2;
        wingGroup.add(bFloor);

        const railH = 0.9 * scale;
        const railGroup = this.createRailing(balconyW, railH, scale, mats);
        railGroup.position.y = groundH + 0.22 * scale;
        railGroup.position.z = w.d / 2;
        wingGroup.add(railGroup);

        for (let j = -1; j <= 1; j++) {
          const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.18 * scale, uWallH, 0.18 * scale), mats.wood);
          pillar.position.set(j * (balconyW / 2 - 0.2 * scale), groundH + uWallH / 2, w.d / 2 - 0.12 * scale);
          wingGroup.add(pillar);
        }

        for (let j = -3; j <= 3; j++) {
            if (j === 0) continue;
            const pot = createFlowerPot(scale * 0.8);
            pot.position.set(j * (balconyW / 8), groundH + railH + 0.13 * scale, w.d / 2);
            wingGroup.add(pot);
        }

        // Climbing plant
        const climber = createClimbingPlant(balconyW * 0.4, groundH * 0.7, scale, mats);
        climber.position.set(balconyW * 0.3, zocaloH + 0.1 * scale, w.d / 2 - 0.05 * scale);
        wingGroup.add(climber);

      } else {
        const uWall = new THREE.Mesh(new THREE.BoxGeometry(w.w, uWallH, w.d), mats.stucco);
        uWall.position.y = groundH + uWallH / 2;
        uWall.castShadow = true;
        uWall.receiveShadow = true;
        wingGroup.add(uWall);
      }

      g.add(wingGroup);
      
      const proxy = boxCollider(w.w, totalH, w.d);
      proxy.position.set(w.x, 0.5 * scale + totalH / 2, w.z);
      g.add(proxy);
    }

    // 4. Central Patio Floor & Fountain
    const borderW = patioW + 0.6 * scale;
    const borderD = patioD + 0.6 * scale;
    const patioBorder = new THREE.Mesh(new THREE.PlaneGeometry(borderW, borderD), mats.stone);
    patioBorder.rotation.x = -Math.PI / 2;
    patioBorder.position.y = 0.505 * scale; 
    g.add(patioBorder);

    const patioFloorMat = mats.terracotta.clone();
    if (patioFloorMat.map) {
      patioFloorMat.map = patioFloorMat.map.clone();
      patioFloorMat.map.repeat.set(12, 12);
    }
    const patioFloor = new THREE.Mesh(new THREE.PlaneGeometry(patioW, patioD), patioFloorMat);
    patioFloor.rotation.x = -Math.PI / 2;
    patioFloor.position.y = 0.515 * scale; // clear the stone border plane (0.505) — flat coplanar planes z-fight at distance
    g.add(patioFloor);

    const fountainGroup = this.createFountain(scale, mats);
    fountainGroup.position.y = 0.51 * scale;
    g.add(fountainGroup);

    // Bench & Table
    const bench = createWoodenBench(scale, mats);
    bench.position.set(patioW / 2 - 0.8 * scale, 0.515 * scale, 0); 
    bench.rotation.y = -Math.PI / 2;
    g.add(bench);

    const table = createWoodenTable(scale, mats);
    table.position.set(patioW / 2 - 1.6 * scale, 0.515 * scale, 0);
    g.add(table);

    // Patio/Fountain Collider
    const fountainColl = boxCollider(patioW, 1.5 * scale, patioD);
    fountainColl.position.set(0, 0.51 * scale + 0.75 * scale, 0);
    g.add(fountainColl);

    // 5. Arched Portico (With Stone Trim)
    for (let i = 0; i < 4; i++) {
      const angle = (Math.PI / 2) * i;
      const arcadeGroup = new THREE.Group();
      const dist = (patioW / 2) + 0.13 * scale;
      arcadeGroup.position.set(Math.cos(angle) * dist, 0.5 * scale, Math.sin(angle) * dist);
      arcadeGroup.rotation.y = -angle;

      const archW = 1.4 * scale;
      const archH = 2.6 * scale;
      const count = Math.floor(patioW / (archW * 1.1));
      for (let x = -count/2; x <= count/2; x++) {
        const archShape = new THREE.Shape();
        archShape.moveTo(-archW / 2, 0);
        archShape.lineTo(-archW / 2, archH - archW / 2);
        archShape.absarc(0, archH - archW / 2, archW / 2, Math.PI, 0, true);
        archShape.lineTo(archW / 2, 0);
        archShape.closePath();

        const archGeo = new THREE.ExtrudeGeometry(archShape, { depth: 0.3 * scale, bevelEnabled: false });
        const arch = new THREE.Mesh(archGeo, mats.stucco);
        arch.position.set(x * archW * 1.3, 0, -0.15 * scale);
        arcadeGroup.add(arch);

        // Stone Trim for the arch
        const trimShape = new THREE.Shape();
        const tw = archW + 0.1 * scale;
        const th = archH + 0.05 * scale;
        trimShape.moveTo(-tw / 2, 0);
        trimShape.lineTo(-tw / 2, th - tw / 2);
        trimShape.absarc(0, th - tw / 2, tw / 2, Math.PI, 0, true);
        trimShape.lineTo(tw / 2, 0);
        
        const hole = new THREE.Path();
        hole.moveTo(-archW / 2, 0);
        hole.lineTo(archW / 2, 0);
        hole.lineTo(archW / 2, archH - archW / 2);
        hole.absarc(0, archH - archW / 2, archW / 2, 0, Math.PI, false);
        hole.lineTo(-archW / 2, 0);
        trimShape.holes.push(hole);

        const trimGeo = new THREE.ExtrudeGeometry(trimShape, { depth: 0.32 * scale, bevelEnabled: false });
        const trim = new THREE.Mesh(trimGeo, mats.stone);
        trim.position.set(x * archW * 1.3, 0, -0.16 * scale);
        arcadeGroup.add(trim);

        if (x < count / 2) {
            const pot = createFlowerPot(scale * 0.7);
            pot.position.set(x * archW * 1.3 + archW * 0.65, archH * 0.6, 0.07 * scale);
            arcadeGroup.add(pot);
        }
      }
      g.add(arcadeGroup);
    }

    // 6. Ring Hip Roof
    const roofH = 2.0 * scale;
    const roofOverhang = 0.5 * scale;
    
    for (let i = 0; i < 4; i++) {
        const angle = (Math.PI / 2) * i;
        const w = (i % 2 === 0) ? outerW : outerD;
        const roofPart = this.createRoofSegment(w + roofOverhang * 2.02, wingT + roofOverhang + 0.01 * scale, roofH, mats);
        roofPart.position.set(
            Math.cos(angle) * (outerD - wingT) / 2,
            totalH + 0.51 * scale, 
            Math.sin(angle) * (outerD - wingT) / 2
        );
        roofPart.rotation.y = -angle + Math.PI / 2;
        g.add(roofPart);

        // Roof Collider Segment
        const rProxy = boxCollider(w + roofOverhang * 2, roofH, wingT + roofOverhang);
        rProxy.position.set(
            Math.cos(angle) * (outerD - wingT) / 2,
            totalH + 0.51 * scale + roofH / 2,
            Math.sin(angle) * (outerD - wingT) / 2
        );
        rProxy.rotation.y = -angle + Math.PI / 2;
        g.add(rProxy);

        // 3D Tiles
        const tileCount = 20;
        const edgeLen = w + roofOverhang * 2;
        for (let j = 0; j < tileCount; j++) {
            const tile = createRoofTile(scale, mats);
            tile.userData.noCollision = true;
            const offset = (j / (tileCount - 1) - 0.5) * edgeLen;
            const tx = Math.cos(angle) * (outerD / 2 + roofOverhang + 0.02 * scale) - Math.sin(angle) * offset;
            const tz = Math.sin(angle) * (outerD / 2 + roofOverhang + 0.02 * scale) + Math.cos(angle) * offset;
            tile.position.set(tx, totalH + 0.62 * scale, tz); 
            tile.rotation.y = angle;
            g.add(tile);
        }

        // 3D Hip Tiles
        for (let hip = -1; hip <= 1; hip += 2) {
            const hipTiles = 8;
            for (let j = 0; j < hipTiles; j++) {
                const tile = createRoofTile(scale * 0.9, mats);
                const t = j / (hipTiles - 1);
                const localX = hip * (w / 2 + roofOverhang) * (1 - t);
                const localZ = -(wingT / 2 + roofOverhang) * (1 - t);
                const localY = t * roofH + 0.13 * scale; 
                
                const worldPos = new THREE.Vector3(localX, localY, localZ);
                worldPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle + Math.PI / 2);
                worldPos.add(new THREE.Vector3(
                    Math.cos(angle) * (outerD - wingT) / 2,
                    totalH + 0.51 * scale,
                    Math.sin(angle) * (outerD - wingT) / 2
                ));

                tile.position.copy(worldPos);
                tile.rotation.y = -angle + Math.PI / 4 * hip;
                tile.rotation.z = Math.PI / 4;
                g.add(tile);
            }
        }

        // Ridge Peak Tiles (The very top edge)
        const ridgeCount = 10;
        for (let j = 0; j < ridgeCount; j++) {
            const tile = createRoofTile(scale * 1.1, mats);
            const offset = (j / (ridgeCount - 1) - 0.5) * (w - wingT);
            const worldPos = new THREE.Vector3(offset, roofH + 0.1 * scale, -(wingT/2 + roofOverhang));
            worldPos.applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle + Math.PI / 2);
            worldPos.add(new THREE.Vector3(
                Math.cos(angle) * (outerD - wingT) / 2,
                totalH + 0.51 * scale,
                Math.sin(angle) * (outerD - wingT) / 2
            ));
            tile.position.copy(worldPos);
            tile.rotation.y = -angle + Math.PI / 2;
            g.add(tile);
        }

        if (i === 1) {
            const chimney = createChimney(scale * 1.2, mats);
            chimney.position.set(w * 0.3, totalH + 0.85 * scale, -(outerD - wingT) / 2 + wingT / 2);
            g.add(chimney);
        }
    }

    // 7. Windows and Doors
    const mainDoor = createDoor(2.2 * scale, 3.4 * scale, 0.5 * scale, mats);
    mainDoor.position.set(0, 0.5 * scale, outerD / 2 + 0.13 * scale);
    g.add(mainDoor);

    const winW = 0.8 * scale;
    const winH = 1.2 * scale;
    
    for (let side = -1; side <= 1; side += 2) {
        for (let yOff = 0; yOff <= 1; yOff++) {
            const y = (yOff === 0) ? zocaloH + 1.2 * scale : groundH + 1.2 * scale;
            const x = side * (outerW / 2 + 0.06 * scale);
            const zPositions = [-outerD / 3, 0, outerD / 3];
            zPositions.forEach((z, idx) => {
                // Back wing's upper floor is recessed for the central balcony, so
                // there is no flush side wall at z=-outerD/3 up there — an upper
                // window placed there floats. Skip it.
                if (yOff === 1 && idx === 0) return;
                const hVar = (yOff === 1 && idx === 1) ? 0.6 : 1.0;
                const winGroup = new THREE.Group();
                const win = createWindowWithGrille(winW, winH * hVar, scale, mats);
                winGroup.add(win);
                
                const shutters = createWoodenShutters(winW, winH * hVar, scale, mats);
                shutters.position.z = 0.13 * scale; 
                winGroup.add(shutters);

                // Add a "Window Glow" plane behind the glass
                const glowMat = new THREE.MeshStandardMaterial({ 
                    color: 0xffaa44, 
                    emissive: 0xffaa44, 
                    emissiveIntensity: 0.5,
                    transparent: true,
                    opacity: 0.3
                });
                const glow = new THREE.Mesh(new THREE.PlaneGeometry(winW * 0.9, winH * hVar * 0.9), glowMat);
                glow.position.z = -0.08 * scale; // behind glass back face (glass spans ±0.05) — no coplanar z-fight
                winGroup.add(glow);

                winGroup.rotation.y = side * Math.PI / 2;
                winGroup.position.set(x, y + 0.5 * scale + (1 - hVar) * winH * 0.5, z);
                g.add(winGroup);
            });
        }
    }

    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.stucco);
    applyWorldTiling(g, mats.roof);
    return withLOD(g);
  }

  private createRailing(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
    const g = new THREE.Group();
    const railT = 0.08 * scale;
    const top = new THREE.Mesh(new THREE.BoxGeometry(width, railT, railT), mats.wood);
    top.position.y = height;
    g.add(top);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(width, railT, railT), mats.wood);
    bottom.position.y = railT / 2;
    g.add(bottom);
    const bCount = Math.floor(width / (0.3 * scale));
    const bGeo = new THREE.BoxGeometry(0.04 * scale, height, 0.04 * scale);
    for (let i = 0; i <= bCount; i++) {
      const x = (i / bCount - 0.5) * width;
      const b = new THREE.Mesh(bGeo, mats.wood);
      b.position.set(x, height / 2, 0);
      g.add(b);
    }
    return g;
  }

  private createFountain(scale: number, mats: MedMaterials): THREE.Group {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * scale, 1.0 * scale, 0.4 * scale, 8), mats.stone);
    base.position.y = 0.2 * scale;
    g.add(base);

    const waterMat = new THREE.MeshStandardMaterial({ 
      color: 0x00ccff, 
      metalness: 0.1, 
      roughness: 0.05, 
      transparent: true, 
      opacity: 0.7,
      emissive: 0x003366,
      emissiveIntensity: 0.5
    });
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * scale, 0.75 * scale, 0.05 * scale, 16), waterMat);
    water.position.y = 0.42 * scale; 
    g.add(water);

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * scale, 0.18 * scale, 1.2 * scale, 8), mats.stone);
    stem.position.y = 0.8 * scale;
    g.add(stem);

    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.4 * scale, 0.2 * scale, 0.2 * scale, 8), mats.stone);
    bowl.position.y = 1.3 * scale;
    g.add(bowl);
    
    return g;
  }

  private createRoofSegment(width: number, depth: number, height: number, mats: MedMaterials): THREE.Mesh {
    const geo = new THREE.BufferGeometry();
    const w2 = width / 2;
    const d2 = depth / 2;
    const h = height;
    const vertices = new Float32Array([
      -w2, 0, d2,   w2, 0, d2,   w2-d2, h, 0,
      -w2, 0, d2,   w2-d2, h, 0, -w2+d2, h, 0,
      w2, 0, -d2,  -w2, 0, -d2,  -w2+d2, h, 0,
      w2, 0, -d2,  -w2+d2, h, 0,  w2-d2, h, 0,
    ]);
    // World-unit UVs (1 UV = 1 world unit), same as the sibling createHipRoof
    // helpers — raw BufferGeometry is skipped by applyWorldTiling, so without
    // this the roof maps sample at (0,0) and render untextured.
    const uvs = new Float32Array([
      -w2, d2,   w2, d2,   w2-d2, 0,
      -w2, d2,   w2-d2, 0, -w2+d2, 0,
      w2, -d2,  -w2, -d2, -w2+d2, 0,
      w2, -d2,  -w2+d2, 0,  w2-d2, 0,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, mats.roof);
  }
}

registerMesh(MalakaBrokenPatioHouse);
