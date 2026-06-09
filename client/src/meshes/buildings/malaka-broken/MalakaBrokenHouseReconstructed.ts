import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import {
  getMaterials,
  createWindowWithGrille,
  createWoodenShutters,
  createFlowerPot,
  createChimney,
  createWoodenBench,
  createWoodenTable,
  withLOD,
} from './MalakaBrokenKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { applyWorldTiling } from '../worldTiled';
import { addLightEmitter } from '../../../scene/PointLightPool';

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
    
    const patioDepth = 4 * scale;
    const patioWidth = width + 2 * scale;

    // ═══════════════════════════════════════════════════════════════════════
    //  HOUSE STRUCTURE
    // ═══════════════════════════════════════════════════════════════════════

    // 1. Foundation (Stone)
    const foundSkirt = foundationHeight + 0.4 * scale;
    const foundation = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.2 * scale, foundSkirt, depth + 0.2 * scale),
      mats.stone
    );
    foundation.position.y = foundationHeight - foundSkirt / 2;
    foundation.castShadow = true;
    foundation.receiveShadow = true;
    g.add(foundation);

    // Vibrant Blue Glass — transparent so the interior shows through the windows.
    const blueGlassMat = new THREE.MeshStandardMaterial({
      color: 0x6fa8d8,
      emissive: 0x12304a,
      emissiveIntensity: 0.15,
      metalness: 0.1,
      roughness: 0.4,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });

    // Front-wall opening geometry (shared by walls, windows and the door).
    const wallThk = 0.2 * scale;
    const doorOpenHalf = 0.7 * scale;
    const doorOpenTop = 2.45 * scale;
    const winOpenHalf = 0.5 * scale;
    const winOpenCx = 1.8 * scale;
    const winOpenY0 = 1.35 * scale;
    const winOpenY1 = 2.45 * scale;

    // Furnished interior — only visible now that the walls are hollow and the
    // door + windows are real openings.
    const addInterior = (group: THREE.Group, w: number, h: number, d: number) => {
      const floorY = wallThk;

      // Warm interior glow (escapes through the open door + transparent windows).
      // Pooled so streaming houses don't change numPointLights (full recompile).
      addLightEmitter(group, new THREE.Vector3(0, h * 0.6, 0), {
        color: 0xffc98a, intensity: 1.4, distance: 14 * scale, decay: 2,
      });

      // Rug
      const rugMat = new THREE.MeshStandardMaterial({ color: 0x8a2d2d, roughness: 0.95 });
      const rug = new THREE.Mesh(new THREE.BoxGeometry(2.4 * scale, 0.02 * scale, 1.7 * scale), rugMat);
      rug.position.set(0, floorY + 0.01 * scale, 0.3 * scale);
      rug.receiveShadow = true;
      group.add(rug);

      // Table + two benches
      const table = createWoodenTable(scale, mats);
      table.position.set(0, floorY, 0.3 * scale);
      group.add(table);
      for (const sz of [-1, 1]) {
        const b = createWoodenBench(scale, mats);
        b.position.set(0, floorY, 0.3 * scale + sz * 0.65 * scale);
        if (sz < 0) b.rotation.y = Math.PI;
        group.add(b);
      }

      // Fireplace against the back wall (under the chimney)
      const fpW = 1.6 * scale, fpH = 1.8 * scale, fpD = 0.5 * scale;
      const fpX = -w * 0.28;
      const fpZ = -d / 2 + wallThk + fpD / 2;
      const surround = new THREE.Mesh(new THREE.BoxGeometry(fpW, fpH, fpD), mats.stone);
      surround.position.set(fpX, floorY + fpH / 2, fpZ);
      surround.castShadow = surround.receiveShadow = true;
      group.add(surround);
      const fireboxMat = new THREE.MeshStandardMaterial({ color: 0x140a06, roughness: 1 });
      const firebox = new THREE.Mesh(new THREE.BoxGeometry(fpW * 0.6, fpH * 0.5, 0.15 * scale), fireboxMat);
      firebox.position.set(fpX, floorY + fpH * 0.32, fpZ + fpD / 2);
      group.add(firebox);
      const emberMat = new THREE.MeshStandardMaterial({ color: 0xff5a1e, emissive: 0xff5a1e, emissiveIntensity: 2.2, roughness: 1 });
      const ember = new THREE.Mesh(new THREE.BoxGeometry(fpW * 0.45, 0.2 * scale, 0.12 * scale), emberMat);
      ember.position.set(fpX, floorY + 0.18 * scale, fpZ + fpD / 2);
      group.add(ember);
      addLightEmitter(group, new THREE.Vector3(fpX, floorY + fpH * 0.32, fpZ + fpD), {
        color: 0xff7a2e, intensity: 1.8, distance: 7 * scale, decay: 2,
      });

      // Bookshelf on the right wall
      const bookColors = [0x2e5d8a, 0x8a2e3a, 0x2e8a55, 0xb5882e];
      const shelfX = w / 2 - wallThk - 0.07 * scale;
      for (let i = 0; i < 2; i++) {
        const shelfY = floorY + (1.0 + i * 0.6) * scale;
        const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.14 * scale, 0.06 * scale, 1.8 * scale), mats.wood);
        shelf.position.set(shelfX, shelfY, -0.4 * scale);
        group.add(shelf);
        for (let j = 0; j < 4; j++) {
          const bookMat = new THREE.MeshStandardMaterial({ color: bookColors[j], roughness: 0.8 });
          const book = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, 0.3 * scale, 0.18 * scale), bookMat);
          book.position.set(shelfX, shelfY + 0.18 * scale, -0.9 * scale + j * 0.28 * scale);
          group.add(book);
        }
      }
    };

    // 2. Main Body — thin white stucco walls with real door + window openings.
    const createBody = (w: number, h: number, d: number) => {
      const group = new THREE.Group();

      // Whitewashed stucco rendered on both faces so interior walls show.
      const wallMat = mats.stucco.clone();
      wallMat.side = THREE.DoubleSide;

      const addWall = (gw: number, gh: number, gd: number, x: number, y: number, z: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), wallMat);
        m.position.set(x, y, z);
        m.castShadow = m.receiveShadow = true;
        group.add(m);
      };

      // Back + side walls (solid)
      addWall(w, h, wallThk, 0, h / 2, -d / 2 + wallThk / 2);
      addWall(wallThk, h, d, -w / 2 + wallThk / 2, h / 2, 0);
      addWall(wallThk, h, d, w / 2 - wallThk / 2, h / 2, 0);

      // Front wall built from panels around the door + two window openings
      const fz = d / 2 - wallThk / 2;
      const addFront = (x0: number, x1: number, y0: number, y1: number) =>
        addWall(x1 - x0, y1 - y0, wallThk, (x0 + x1) / 2, (y0 + y1) / 2, fz);
      const wl0 = -winOpenCx - winOpenHalf, wl1 = -winOpenCx + winOpenHalf;
      const wr0 = winOpenCx - winOpenHalf, wr1 = winOpenCx + winOpenHalf;
      addFront(-w / 2, wl0, 0, h);                  // far left
      addFront(wl0, wl1, 0, winOpenY0);             // left window sill
      addFront(wl0, wl1, winOpenY1, h);             // left window lintel
      addFront(wl1, -doorOpenHalf, 0, h);           // pier: left window → door
      addFront(-doorOpenHalf, doorOpenHalf, doorOpenTop, h); // door lintel
      addFront(doorOpenHalf, wr0, 0, h);            // pier: door → right window
      addFront(wr0, wr1, 0, winOpenY0);             // right window sill
      addFront(wr0, wr1, winOpenY1, h);             // right window lintel
      addFront(wr1, w / 2, 0, h);                   // far right

      // Floor (terracotta) + ceiling (stucco)
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w - 2 * wallThk, wallThk, d - 2 * wallThk), mats.terracotta);
      floor.position.y = wallThk / 2;
      floor.receiveShadow = true;
      group.add(floor);
      addWall(w, wallThk, d, 0, h - wallThk / 2, 0); // ceiling

      // Corner Wooden Beams (kept — wood look)
      const beamW = 0.4 * scale;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, h, beamW), mats.wood);
          beam.position.set(sx * (w / 2), h / 2, sz * (d / 2));
          group.add(beam);
        }
      }

      addInterior(group, w, h, d);
      return group;
    };

    const bodyHeight = houseHeight - foundationHeight;
    const bodyGroup = createBody(width, bodyHeight, depth);
    bodyGroup.position.y = foundationHeight;
    g.add(bodyGroup);

    // 3. Azulejos (Decorative Tile Baseboard / Zócalo) — perimeter band with a
    //    gap at the doorway so the threshold stays open into the interior.
    const tileHeight = 0.7 * scale;
    const azulejoMat = mats.azulejo;
    const zThk = 0.15 * scale;
    const frontSegW = width / 2 - doorOpenHalf;
    const band = (mat: THREE.Material, gh: number, y: number) => {
      const add = (gw: number, gd: number, x: number, z: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), mat);
        m.position.set(x, y, z);
        g.add(m);
      };
      add(width, zThk, 0, -depth / 2);              // back
      add(zThk, depth, -width / 2, 0);              // left
      add(zThk, depth, width / 2, 0);               // right
      for (const side of [-1, 1]) {                 // front (door gap)
        add(frontSegW, zThk, side * (doorOpenHalf + frontSegW / 2), depth / 2);
      }
    };
    band(azulejoMat, tileHeight, foundationHeight + tileHeight / 2);
    // Decorative blue strip atop the zócalo
    band(blueGlassMat, 0.05 * scale, foundationHeight + tileHeight + 0.025 * scale);

    // ═══════════════════════════════════════════════════════════════════════
    //  COLLIDERS — Main house body
    // ═══════════════════════════════════════════════════════════════════════

    // Back wall collider
    const backWallColl = boxCollider(width, houseHeight, wallThk * 2);
    backWallColl.position.set(0, houseHeight / 2, -depth / 2 + wallThk);
    g.add(backWallColl);

    // Left wall collider
    const leftWallColl = boxCollider(wallThk * 2, houseHeight, depth);
    leftWallColl.position.set(-width / 2 + wallThk, houseHeight / 2, 0);
    g.add(leftWallColl);

    // Right wall collider
    const rightWallColl = boxCollider(wallThk * 2, houseHeight, depth);
    rightWallColl.position.set(width / 2 - wallThk, houseHeight / 2, 0);
    g.add(rightWallColl);

    // Front wall colliders (two segments around the door opening)
    for (const side of [-1, 1]) {
      const fwColl = boxCollider(frontSegW, houseHeight, wallThk * 2);
      fwColl.position.set(
        side * (doorOpenHalf + frontSegW / 2),
        houseHeight / 2,
        depth / 2 - wallThk,
      );
      g.add(fwColl);
    }

    // Door lintel collider (blocks jumping over door)
    const lintelColl = boxCollider(doorOpenHalf * 2, houseHeight - doorOpenTop, wallThk * 2);
    lintelColl.position.set(0, doorOpenTop + (houseHeight - doorOpenTop) / 2, depth / 2 - wallThk);
    g.add(lintelColl);

    // 4. Gable Roof (Triangular form) — snug overhang so it sits on the walls
    const roofHeight = 1.8 * scale;
    const roofOverhang = 0.3 * scale;
    const roofW = width + roofOverhang * 2;
    const roofL = depth + roofOverhang * 2;
    const slopeLen = Math.sqrt(Math.pow(roofW / 2, 2) + Math.pow(roofHeight, 2));
    const slopeAngle = Math.atan2(roofHeight, roofW / 2);

    const roofGroup = new THREE.Group();
    roofGroup.position.y = houseHeight;
    for (const side of [-1, 1]) {
      const plane = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.1 * scale, roofL), mats.roof);
      plane.position.set(side * (roofW / 4), roofHeight / 2, 0);
      plane.rotation.z = -side * slopeAngle;
      plane.castShadow = true;
      plane.receiveShadow = true;
      plane.userData.noCollision = true;
      roofGroup.add(plane);
    }
    const gableMat = mats.stucco.clone();
    gableMat.side = THREE.DoubleSide; 
    for (const side of [-1, 1]) {
      const gableGeo = new THREE.BufferGeometry();
      const vertices = new Float32Array([-width / 2, 0, 0, width / 2, 0, 0, 0, roofHeight, 0]);
      gableGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      gableGeo.computeVertexNormals();
      const gable = new THREE.Mesh(gableGeo, gableMat);
      gable.position.z = side * depth / 2;
      gable.castShadow = true;
      gable.receiveShadow = true;
      gable.userData.noCollision = true;
      roofGroup.add(gable);
    }
    g.add(roofGroup);

    // Roof colliders — angled slope proxies for each side
    for (const side of [-1, 1]) {
      const rSlopeColl = boxCollider(slopeLen, 0.3 * scale, roofL);
      const slopeGroup = new THREE.Group();
      rSlopeColl.position.set(side * (roofW / 4), roofHeight / 2, 0);
      rSlopeColl.rotation.z = -side * slopeAngle;
      slopeGroup.add(rSlopeColl);
      slopeGroup.position.y = houseHeight;
      g.add(slopeGroup);
    }

    // 5. Chimney — offset to the left (over the fireplace) with rising smoke
    const chimneyX = -width * 0.28;
    const chimneyZ = -depth * 0.12;
    const chimneyBaseY = houseHeight + roofHeight * 0.5;
    const chimney = createChimney(scale, mats);
    chimney.position.set(chimneyX, chimneyBaseY, chimneyZ);
    g.add(chimney);

    // Chimney collider
    const chimColl = boxCollider(0.5 * scale, 0.9 * scale, 0.5 * scale);
    chimColl.position.set(chimneyX, chimneyBaseY + 0.45 * scale, chimneyZ);
    g.add(chimColl);

    // Stylized rising smoke (translucent puffs, fading + widening upward)
    const smokeMat = new THREE.MeshStandardMaterial({
      color: 0xc4c4c4, transparent: true, roughness: 1, depthWrite: false,
    });
    const smokeBaseY = chimneyBaseY + 0.95 * scale;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const puff = new THREE.Mesh(new THREE.SphereGeometry((0.18 + t * 0.34) * scale, 7, 7), smokeMat.clone());
      (puff.material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - t * 0.7);
      puff.position.set(
        chimneyX + Math.sin(i * 1.3) * 0.25 * scale,
        smokeBaseY + t * 2.2 * scale,
        chimneyZ + Math.cos(i * 1.1) * 0.2 * scale,
      );
      puff.userData.noCollision = true;
      g.add(puff);
    }

    // 6. Door — wooden leaf swung open on a left-side hinge, revealing the interior
    const doorLeafW = 2 * doorOpenHalf, doorLeafH = doorOpenTop - 0.05 * scale, doorLeafT = 0.12 * scale;
    const doorPivot = new THREE.Group();
    doorPivot.position.set(-doorOpenHalf, foundationHeight, depth / 2 - 0.02 * scale);
    const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(doorLeafW, doorLeafH, doorLeafT), mats.door);
    doorLeaf.position.set(doorLeafW / 2, doorLeafH / 2, 0);
    doorLeaf.castShadow = true;
    doorPivot.add(doorLeaf);
    // Iron studs
    const studMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.8 });
    const studGeo = new THREE.SphereGeometry(0.035 * scale, 8, 8);
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const stud = new THREE.Mesh(studGeo, studMat);
        stud.position.set(doorLeafW * (0.2 + c * 0.3), doorLeafH * (0.2 + r * 0.2), doorLeafT / 2);
        doorPivot.add(stud);
      }
    }
    // Handle
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xaa8833, metalness: 0.9, roughness: 0.2 });
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.08 * scale, 0.02 * scale, 8, 16), handleMat);
    handle.position.set(doorLeafW * 0.85, doorLeafH * 0.5, doorLeafT / 2 + 0.02 * scale);
    doorPivot.add(handle);
    doorPivot.rotation.y = Math.PI * 0.55; // swing inward, open
    g.add(doorPivot);

    // 7. Windows with Blue Frames
    const winW = 0.9 * scale;
    const winH = 1.1 * scale;
    const winY = foundationHeight + 1.9 * scale;
    const createWindowWithFrame = () => {
      const wg = new THREE.Group();
      const frameThickness = 0.15 * scale;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(winW + frameThickness, winH + frameThickness, 0.1 * scale), blueGlassMat);
      wg.add(frame);
      const win = createWindowWithGrille(winW, winH, scale, mats);
      // Set only glass to blue
      win.traverse(o => { if (o instanceof THREE.Mesh && o.material === mats.glass) o.material = blueGlassMat; });
      win.position.z = 0.02 * scale;
      wg.add(win);
      const shutters = createWoodenShutters(winW, winH, scale, mats);
      shutters.position.z = 0.05 * scale;
      wg.add(shutters);
      return wg;
    };

    for (const side of [-1, 1]) {
      const winGroup = createWindowWithFrame();
      winGroup.position.set(side * 1.8 * scale, winY, depth / 2 + 0.1 * scale);
      const pot = createFlowerPot(scale);
      pot.position.set(0, -winH / 2 - 0.2 * scale, 0.15 * scale);
      winGroup.add(pot);
      g.add(winGroup);
    }
    for (const side of [-1, 1]) {
      const winGroup = createWindowWithFrame();
      winGroup.position.set(side * (width / 2 + 0.1 * scale), winY, 0);
      winGroup.rotation.y = side * Math.PI / 2;
      g.add(winGroup);
    }

    // 8. Front Patio (Stone)
    const patio = new THREE.Mesh(new THREE.BoxGeometry(patioWidth, 0.1 * scale, patioDepth), mats.stone);
    patio.position.set(0, 0.05 * scale, depth / 2 + patioDepth / 2);
    patio.receiveShadow = true;
    g.add(patio);

    const wallH = 0.9 * scale;
    const wallT = 0.3 * scale;
    const createPatioWall = (w: number, d: number) => {
      const wg = new THREE.Group();
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), mats.stucco);
      wall.position.y = wallH / 2;
      wg.add(wall);
      const wallZocalo = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02 * scale, tileHeight * 0.7, d + 0.02 * scale), azulejoMat);
      wallZocalo.position.y = tileHeight * 0.35;
      wg.add(wallZocalo);
      return wg;
    };

    // ── Patio walls with individual colliders ────────────────────────────
    const leftPWall = createPatioWall(wallT, patioDepth);
    leftPWall.position.set(-patioWidth / 2 + wallT / 2, 0, depth / 2 + patioDepth / 2);
    g.add(leftPWall);
    const leftPWColl = boxCollider(wallT, wallH, patioDepth);
    leftPWColl.position.set(-patioWidth / 2 + wallT / 2, wallH / 2, depth / 2 + patioDepth / 2);
    g.add(leftPWColl);

    const rightPWall = createPatioWall(wallT, patioDepth);
    rightPWall.position.set(patioWidth / 2 - wallT / 2, 0, depth / 2 + patioDepth / 2);
    g.add(rightPWall);
    const rightPWColl = boxCollider(wallT, wallH, patioDepth);
    rightPWColl.position.set(patioWidth / 2 - wallT / 2, wallH / 2, depth / 2 + patioDepth / 2);
    g.add(rightPWColl);

    const frontWallW = (patioWidth - 2 * scale) / 2;
    for (const side of [-1, 1]) {
      const fWall = createPatioWall(frontWallW, wallT);
      fWall.position.set(side * (patioWidth / 2 - frontWallW / 2), 0, depth / 2 + patioDepth - wallT / 2);
      g.add(fWall);
      // Front patio wall collider
      const fwPColl = boxCollider(frontWallW, wallH, wallT);
      fwPColl.position.set(side * (patioWidth / 2 - frontWallW / 2), wallH / 2, depth / 2 + patioDepth - wallT / 2);
      g.add(fwPColl);

      const pot = createFlowerPot(scale);
      pot.position.set(side * (patioWidth / 2 - wallT / 2), wallH, depth / 2 + patioDepth - wallT / 2);
      g.add(pot);
    }

    // Tiling
    applyWorldTiling(g, mats.stone);
    applyWorldTiling(g, mats.stucco);
    applyWorldTiling(g, mats.wood);
    applyWorldTiling(g, mats.azulejo);
    applyWorldTiling(g, mats.glass); 
    applyWorldTiling(g, blueGlassMat); 
    applyWorldTiling(g, mats.door, 2.0); 
    applyWorldTiling(g, mats.roof, 2.0); 
    applyWorldTiling(g, mats.terracotta, 2.0);

    return withLOD(g);
  }
}

registerMesh(MalakaBrokenHouseReconstructed);
