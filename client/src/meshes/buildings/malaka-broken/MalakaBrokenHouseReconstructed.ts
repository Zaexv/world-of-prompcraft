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
  createWoodenBench,
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

    // Vibrant Blue Glass / Painted Wood for this building
    const blueGlassMat = new THREE.MeshStandardMaterial({
      color: 0x3a6ba5,
      emissive: 0x1a3a5a,
      emissiveIntensity: 0.5,
      metalness: 0.1,
      roughness: 0.6,
      transparent: true,
      opacity: 0.9
    });

    // 2. Main Body (Wood sides + White Stucco Front)
    const createBody = (w: number, h: number, d: number) => {
      const group = new THREE.Group();
      
      // Multi-material body: [+X, -X, +Y, -Y, +Z (Front), -Z]
      // +Z is the front face where the door and windows are
      const bodyMaterials = [
        mats.door,   // +X (Right)
        mats.door,   // -X (Left)
        mats.door,   // +Y (Top)
        mats.door,   // -Y (Bottom)
        mats.stucco, // +Z (Front - White)
        mats.door    // -Z (Back)
      ];
      
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), bodyMaterials);
      body.position.y = h / 2;
      body.castShadow = body.receiveShadow = true;
      group.add(body);

      // Corner Wooden Beams (Structural look)
      const beamW = 0.4 * scale;
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, h, beamW), mats.wood);
          beam.position.set(sx * (w / 2), h / 2, sz * (d / 2));
          group.add(beam);
        }
      }
      return group;
    };

    const bodyHeight = houseHeight - foundationHeight;
    const bodyGroup = createBody(width, bodyHeight, depth);
    bodyGroup.position.y = foundationHeight;
    g.add(bodyGroup);

    // 3. Azulejos (Decorative Tile Baseboard / Zócalo)
    const tileHeight = 0.7 * scale;
    const azulejoMat = mats.azulejo;
    const zocalo = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.05 * scale, tileHeight, depth + 0.05 * scale),
      azulejoMat
    );
    zocalo.position.y = foundationHeight + tileHeight / 2;
    g.add(zocalo);

    // Decorative blue strip (Matching windows)
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.07 * scale, 0.05 * scale, depth + 0.07 * scale),
      blueGlassMat
    );
    strip.position.y = foundationHeight + tileHeight;
    g.add(strip);

    // Main Collider
    const bodyProxy = boxCollider(width, houseHeight, depth);
    bodyProxy.position.y = houseHeight / 2;
    g.add(bodyProxy);

    // 4. Gable Roof (Triangular form)
    const roofHeight = 2.0 * scale;
    const roofOverhang = 0.6 * scale;
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
      gable.userData.noCollision = true;
      roofGroup.add(gable);
    }
    g.add(roofGroup);

    const rColl = boxCollider(roofW, roofHeight, roofL);
    rColl.position.y = houseHeight + roofHeight / 2;
    g.add(rColl);

    // 5. Chimney
    const chimney = createChimney(scale, mats);
    chimney.position.set(0, houseHeight + roofHeight, depth * 0.2);
    g.add(chimney);

    // 6. Door (Wood Frame + Warm Brown Wood)
    const door = createDoor(1.3 * scale, 2.4 * scale, 0.2 * scale, mats);
    door.position.set(0, foundationHeight, depth / 2 + 0.05 * scale);
    // Explicitly ensure the door and its frame use the wood texture (mats.door)
    door.traverse(o => {
      if (o instanceof THREE.Mesh && (o.material === mats.stone || o.material === mats.stucco)) {
        o.material = mats.door;
      }
    });
    g.add(door);

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

    // 8. Front Patio (Stone)
    const patioDepth = 4 * scale;
    const patioWidth = width + 2 * scale;
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

    // Andalusian Bench
    const bench = createWoodenBench(scale, mats);
    bench.position.set(2.5 * scale, foundationHeight, depth / 2 + 1.2 * scale);
    g.add(bench);
    const bColl = boxCollider(1.2 * scale, 0.8 * scale, 0.4 * scale);
    bColl.position.set(2.5 * scale, foundationHeight + 0.4 * scale, depth / 2 + 1.2 * scale);
    g.add(bColl);

    // Improved Vegetation: Green Tree on the left
    const treeG = new THREE.Group();
    const trunkH = 2.5 * scale;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, trunkH, 8), mats.wood);
    trunk.position.y = trunkH / 2;
    treeG.add(trunk);
    const foliageMat = mats.foliage;
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.9 * scale, 6, 6), foliageMat);
      leaf.position.set((Math.random() - 0.5) * 0.8 * scale, trunkH + (Math.random() * 0.8 * scale), (Math.random() - 0.5) * 0.8 * scale);
      treeG.add(leaf);
    }
    treeG.position.set(-width / 2 - 1.8 * scale, 0, depth / 2 + 1.0 * scale);
    g.add(treeG);

    const patioProxy = boxCollider(patioWidth, wallH, patioDepth);
    patioProxy.position.set(0, wallH / 2, depth / 2 + patioDepth / 2);
    g.add(patioProxy);

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
