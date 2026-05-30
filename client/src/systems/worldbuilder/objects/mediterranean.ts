import * as THREE from 'three';
import { applyMalakaPBR } from '../../../utils/PBRMaps';

// ─── Procedural Canvas Texture Generators ──────────────────────────────────────

function createStuccoTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff'; // Pure Andalusian White
  ctx.fillRect(0, 0, 256, 256);

  // Add subtle plaster grain
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.02)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createTerracottaRoofTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Deep Saturated Terracotta Red
  ctx.fillStyle = '#a63d2d'; 
  ctx.fillRect(0, 0, 256, 256);

  // Draw tile lines
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#4a1810'; // Deep dark crevices
  for (let x = 0; x < 256; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();

    for (let y = 0; y < 256; y += 32) {
      const offset = (x / 16) % 2 === 0 ? 0 : 16;
      ctx.beginPath();
      ctx.moveTo(x, y + offset);
      ctx.lineTo(x + 16, y + offset);
      ctx.stroke();
      
      // Real clay highlight
      ctx.fillStyle = '#c15541';
      ctx.fillRect(x, y + offset - 3, 16, 3);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createStoneWallTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#e2dfd2'; // Light limestone / oyster white
  ctx.fillRect(0, 0, 256, 256);

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#bab7a9';
  for (let y = 0; y <= 256; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();

    const offsetX = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = offsetX; x <= 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 32);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createWoodTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1a1a1a'; // Deep Black/Dark Brown Wood
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#111111';
  for (let i = 0; i < 200; i++) {
    const w = 1 + Math.random() * 2;
    const h = 20 + Math.random() * 100;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, w, h);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Material Cache (Singleton) ───────────────────────────────────────────────

interface MedMaterials {
  stucco: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
}

let _materials: MedMaterials | null = null;

function getMaterials(): MedMaterials {
  if (!_materials) {
    _materials = {
      stucco: (() => {
        const m = new THREE.MeshStandardMaterial({
          map: createStuccoTexture(),
          roughness: 0.95,
        });
        applyMalakaPBR(m, 'stucco');
        return m;
      })(),
      roof: (() => {
        const m = new THREE.MeshStandardMaterial({
          map: createTerracottaRoofTexture(),
          roughness: 0.8,
        });
        applyMalakaPBR(m, 'roof');
        return m;
      })(),
      stone: (() => {
        const m = new THREE.MeshStandardMaterial({ map: createStoneWallTexture(), roughness: 0.9 });
        applyMalakaPBR(m, 'stone');
        return m;
      })(),
      wood: new THREE.MeshStandardMaterial({
        map: createWoodTexture(),
        roughness: 0.8,
      }),
      glass: new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.1,
        metalness: 0.8,
      }),
    };
  }
  return _materials;
}

// ─── Architectural Helpers ───────────────────────────────────────────────────

function createArchedDoor(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();
  
  // Wooden door (bottom rectangular part)
  const doorH = height - (width / 2);
  const door = new THREE.Mesh(new THREE.BoxGeometry(width, doorH, depth), mats.wood);
  door.position.y = doorH / 2;
  group.add(door);

  // Arched top
  const arch = new THREE.Mesh(
    new THREE.CylinderGeometry(width / 2, width / 2, depth, 16, 1, false, 0, Math.PI),
    mats.wood
  );
  arch.rotation.x = Math.PI / 2;
  arch.position.y = doorH;
  group.add(arch);

  // Stone border (architrave)
  const borderSize = 0.15;
  const stoneArch = new THREE.Mesh(
    new THREE.CylinderGeometry(width / 2 + borderSize, width / 2, depth + 0.05, 16, 1, true, 0, Math.PI),
    mats.stone
  );
  stoneArch.rotation.x = Math.PI / 2;
  stoneArch.position.y = doorH;
  group.add(stoneArch);

  // Door Handle / Knocker (Brass)
  const handleMat = new THREE.MeshStandardMaterial({ color: 0xaa8833, metalness: 0.9, roughness: 0.2 });
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 16), handleMat);
  handle.position.set(width * 0.25, height * 0.45, depth / 2 + 0.05);
  group.add(handle);

  return group;
}

function createChimney(scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const baseW = 0.4 * scale;
  const baseH = 0.8 * scale;
  
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseW), mats.stucco);
  base.position.y = baseH / 2;
  g.add(base);

  const top = new THREE.Mesh(new THREE.BoxGeometry(baseW * 1.3, 0.1 * scale, baseW * 1.3), mats.roof);
  top.position.y = baseH + 0.05 * scale;
  g.add(top);

  return g;
}

function createPergola(width: number, depth: number, scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const postH = 2.2 * scale;
  const postGeo = new THREE.BoxGeometry(0.15 * scale, postH, 0.15 * scale);
  
  // 4 Posts
  for (const [x, z] of [[-width/2, -depth/2], [width/2, -depth/2], [-width/2, depth/2], [width/2, depth/2]]) {
    const post = new THREE.Mesh(postGeo, mats.wood);
    post.position.set(x, postH/2, z);
    g.add(post);
  }

  // Cross beams
  const beamMat = mats.wood;
  const topH = postH + 0.1 * scale;
  for (let i = -2; i <= 2; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.4 * scale, 0.1 * scale, 0.1 * scale), beamMat);
    beam.position.set(0, topH, i * (depth / 4));
    g.add(beam);
  }
  
  // Vines (green spheres)
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x1a5d1a });
  for (let i = 0; i < 15; i++) {
    const vine = new THREE.Mesh(new THREE.SphereGeometry(0.2 * scale, 4, 4), vineMat);
    vine.position.set((Math.random()-0.5) * width, topH + 0.1 * scale, (Math.random()-0.5) * depth);
    g.add(vine);
  }

  return g;
}

function createRoofTile(scale: number, mats: MedMaterials): THREE.Mesh {
  // A single curved tile (Teja)
  const geo = new THREE.CylinderGeometry(0.12 * scale, 0.12 * scale, 0.4 * scale, 8, 1, true, 0, Math.PI);
  const tile = new THREE.Mesh(geo, mats.roof);
  tile.rotation.x = Math.PI / 2;
  return tile;
}

function createWindowWithGrille(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  
  // Glass
  const glass = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.1 * scale), mats.glass);
  g.add(glass);

  // Iron Grille (simplified with lines/wireframe)
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.5 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(width + 0.05, height + 0.05, 0.05 * scale), ironMat);
  frame.position.z = 0.1 * scale;
  g.add(frame);

  for (let i = -1; i <= 1; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02 * scale, height, 0.02 * scale), ironMat);
    bar.position.set(i * (width / 3), 0, 0.12 * scale);
    g.add(bar);
  }

  return g;
}

function createFlowerPot(scale: number): THREE.Group {
  const g = new THREE.Group();
  
  // Pot
  const potMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.9 });
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.1 * scale, 0.2 * scale, 8), potMat);
  g.add(pot);

  // Plant (green)
  const plantMat = new THREE.MeshStandardMaterial({ color: 0x228b22, roughness: 1.0 });
  const plant = new THREE.Mesh(new THREE.SphereGeometry(0.18 * scale, 6, 6), plantMat);
  plant.position.y = 0.15 * scale;
  g.add(plant);

  // Flowers (red)
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x330000 });
  for (let i = 0; i < 3; i++) {
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.05 * scale, 4, 4), flowerMat);
    fl.position.set(Math.cos(i * 2) * 0.1 * scale, 0.25 * scale, Math.sin(i * 2) * 0.1 * scale);
    g.add(fl);
  }

  return g;
}

function createWoodenShutters(width: number, height: number, scale: number, mats: MedMaterials): THREE.Group {
  const g = new THREE.Group();
  const shutterW = width / 2;
  const sGeo = new THREE.BoxGeometry(shutterW, height, 0.05 * scale);
  
  const left = new THREE.Mesh(sGeo, mats.wood);
  left.position.set(-(width / 2 + shutterW / 2), 0, 0);
  g.add(left);

  const right = new THREE.Mesh(sGeo, mats.wood);
  right.position.set(width / 2 + shutterW / 2, 0, 0);
  g.add(right);

  return g;
}

// ─── Builders ─────────────────────────────────────────────────────────────────

export function buildMalakaHouse(pos: THREE.Vector3, scale: number): THREE.Group {
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
  body.userData.isCollider = true;
  g.add(body);

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
  const door = createArchedDoor(1.0 * scale, 2.2 * scale, 0.2 * scale, mats);
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

  return g;
}

export function buildMalakaPatioHouse(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  const outerW = 10 * scale;
  const outerD = 10 * scale;
  const outerH = 6 * scale;
  const patioW = 4.5 * scale;
  const patioD = 4.5 * scale;
  const wallT = 1.2 * scale;

  // 1. Foundation
  const foundation = new THREE.Mesh(new THREE.BoxGeometry(outerW + 0.4, 0.5 * scale, outerD + 0.4), mats.stone);
  foundation.position.y = 0.25 * scale;
  g.add(foundation);

  // 2. Main Building Volumes (4 wings around the patio)
  const wingH = outerH - 0.5 * scale;
  const wings = [
    { w: outerW, h: wingH, d: wallT, x: 0, z: (outerD - wallT) / 2 }, // Front
    { w: outerW, h: wingH, d: wallT, x: 0, z: -(outerD - wallT) / 2 }, // Back
    { w: wallT, h: wingH, d: outerD - wallT * 2, x: (outerW - wallT) / 2, z: 0 }, // Right
    { w: wallT, h: wingH, d: outerD - wallT * 2, x: -(outerW - wallT) / 2, z: 0 }, // Left
  ];

  for (const w of wings) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), mats.stucco);
    mesh.position.set(w.x, 0.5 * scale + w.h / 2, w.z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.isCollider = true;
    g.add(mesh);
  }

  // 3. Central Patio Floor & Fountain
  const patioFloor = new THREE.Mesh(new THREE.PlaneGeometry(patioW + 1 * scale, patioD + 1 * scale), mats.stone);
  patioFloor.rotation.x = -Math.PI / 2;
  patioFloor.position.y = 0.51 * scale;
  g.add(patioFloor);

  // Fountain
  const fountainBase = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * scale, 1.0 * scale, 0.4 * scale, 8), mats.stone);
  fountainBase.position.y = 0.7 * scale;
  g.add(fountainBase);

  const waterMat = new THREE.MeshStandardMaterial({ color: 0x44aa88, metalness: 0.9, roughness: 0.1, transparent: true, opacity: 0.8 });
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.7 * scale, 0.7 * scale, 0.1 * scale, 16), waterMat);
  water.position.y = 0.9 * scale;
  g.add(water);

  const fountainStem = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 0.8 * scale, 8), mats.stone);
  fountainStem.position.y = 1.1 * scale;
  g.add(fountainStem);

  // 4. Interior Arched Portico (The hallmark of the Patio house)
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i;
    const arcadeGroup = new THREE.Group();
    const dist = (patioW / 2) + 0.5 * scale;
    arcadeGroup.position.set(Math.cos(angle) * dist, 0.5 * scale, Math.sin(angle) * dist);
    arcadeGroup.rotation.y = -angle;

    const archW = 1.2 * scale;
    const archH = 2.4 * scale;
    for (let x = -1; x <= 1; x++) {
      const arch = createArchedDoor(archW, archH, 0.2 * scale, mats);
      // Make them white stucco arches instead of wood
      arch.traverse(c => { if(c instanceof THREE.Mesh && c.material === mats.wood) c.material = mats.stucco; });
      arch.position.x = x * 1.5 * scale;
      arcadeGroup.add(arch);
    }
    g.add(arcadeGroup);
  }

  // 5. Hip Roof (4-sided pitched roof)
  const roofH = 2.5 * scale;
  const roofOverhang = 0.6 * scale;
  const roofGeo = new THREE.ConeGeometry(Math.sqrt(Math.pow((outerW + roofOverhang)/2, 2) * 2), roofH, 4);
  const roof = new THREE.Mesh(roofGeo, mats.roof);
  roof.position.y = outerH + roofH / 2;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);

  // 3D Tiles along eaves
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i + Math.PI / 4;
    const tileCount = 15;
    const edgeLen = outerW + roofOverhang;
    for (let j = 0; j < tileCount; j++) {
      const tile = createRoofTile(scale, mats);
      const offset = (j / (tileCount - 1) - 0.5) * edgeLen;
      const tx = Math.cos(angle) * (edgeLen / 2) - Math.sin(angle) * offset;
      const tz = Math.sin(angle) * (edgeLen / 2) + Math.cos(angle) * offset;
      tile.position.set(tx, outerH + 0.1 * scale, tz);
      tile.rotation.y = angle;
      g.add(tile);
    }
  }

  // 6. Exterior Details
  // Main Entrance (Arched, large)
  const mainDoor = createArchedDoor(2.0 * scale, 3.2 * scale, 0.4 * scale, mats);
  mainDoor.position.set(0, 0.5 * scale, outerD / 2 + 0.1 * scale);
  g.add(mainDoor);

  // Exterior Windows with grilles
  const winW = 0.7 * scale;
  const winH = 1.0 * scale;
  const winY = 3.0 * scale;
  for (let x = -3.5 * scale; x <= 3.5 * scale; x += 7.0 * scale) {
    const win = createWindowWithGrille(winW, winH, scale, mats);
    win.position.set(x, winY, outerD / 2 + 0.05 * scale);
    g.add(win);
  }

  // 7. Patio Flower Pots
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const pot = createFlowerPot(scale * 1.2);
    pot.position.set(Math.cos(a) * (patioW / 2 + 0.3 * scale), 0.5 * scale, Math.sin(a) * (patioD / 2 + 0.3 * scale));
    g.add(pot);
  }

  return g;
}

export function buildMalakaErmita(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

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
  nave.userData.isCollider = true;
  g.add(nave);

  // 3. Gabled Roof (Vibrant Red)
  const roofH = 2.8 * scale;
  const roofOverhang = 0.8 * scale;
  const roofGeo = new THREE.CylinderGeometry(0.01, Math.sqrt(Math.pow((naveW + roofOverhang)/2, 2) * 2), roofH, 4);
  const roof = new THREE.Mesh(roofGeo, mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = naveH + roofH / 2 + 0.1 * scale;
  g.add(roof);

  // 3b. High-detail 3D Roof Tiles
  const tileCount = 14;
  for (let side = 0; side < 2; side++) {
    const sz = side === 0 ? (naveD / 2) + 0.2 * scale : -(naveD / 2) - 0.2 * scale;
    for (let j = 0; j < tileCount; j++) {
      const tile = createRoofTile(scale, mats);
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

  const crownH = 2.5 * scale;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(facadeW / 2, crownH, 4), mats.stucco);
  crown.rotation.y = Math.PI / 4;
  crown.position.set(0, facadeH + crownH / 2 + 0.1 * scale, naveD / 2 + facadeT / 2);
  g.add(crown);

  // Bell Opening
  const bellOpening = createArchedDoor(1.8 * scale, 3.0 * scale, facadeT + 0.2, mats);
  const voidMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 1.0 });
  bellOpening.traverse(c => { if(c instanceof THREE.Mesh) c.material = voidMat; });
  bellOpening.position.set(0, facadeH - 1.2 * scale, naveD / 2 + facadeT / 2);
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
  oculusGlass.position.set(0, facadeH - 4.5 * scale, naveD / 2 + facadeT + 0.05 * scale);
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

  return g;
}

export function buildMalakaChurch(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  const base = new THREE.Mesh(new THREE.BoxGeometry(13 * scale, 0.6 * scale, 17 * scale), mats.stone);
  base.position.y = 0.3 * scale;
  base.castShadow = base.receiveShadow = true;
  base.userData.isCollider = true;
  g.add(base);

  const naveW = 7 * scale;
  const naveH = 8 * scale;
  const naveD = 15 * scale;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), mats.stucco);
  nave.position.y = 0.6 * scale + naveH / 2;
  nave.castShadow = nave.receiveShadow = true;
  nave.userData.isCollider = true;
  g.add(nave);

  const roofRadius = (naveW / 2) * 1.2;
  const naveRoof = new THREE.Mesh(new THREE.CylinderGeometry(roofRadius, roofRadius, naveD + 1 * scale, 4), mats.roof);
  naveRoof.rotation.z = Math.PI / 4;
  naveRoof.rotation.x = Math.PI / 2;
  naveRoof.position.y = 0.6 * scale + naveH + (roofRadius * Math.cos(Math.PI/4));
  g.add(naveRoof);

  const entrance = createArchedDoor(3.5 * scale, 4.5 * scale, 0.5 * scale, mats);
  entrance.position.set(0, 0.6 * scale, naveD / 2 + 0.2 * scale);
  g.add(entrance);

  return g;
}

function createHorseshoeArch(width: number, height: number, depth: number, mats: MedMaterials): THREE.Group {
  const group = new THREE.Group();
  const archLegH = height - width / 2;
  const legGeo = new THREE.BoxGeometry(0.5 * width * 0.4, archLegH, depth);
  
  const leftLeg = new THREE.Mesh(legGeo, mats.stone);
  leftLeg.position.set(-width / 2, archLegH / 2, 0);
  group.add(leftLeg);
  
  const rightLeg = new THREE.Mesh(legGeo, mats.stone);
  rightLeg.position.set(width / 2, archLegH / 2, 0);
  group.add(rightLeg);

  const horseshoe = new THREE.Mesh(
    new THREE.TorusGeometry(width / 2, 0.15 * width, 8, 16, Math.PI * 1.2),
    mats.stone
  );
  horseshoe.position.y = archLegH;
  horseshoe.rotation.z = -Math.PI * 0.1;
  group.add(horseshoe);
  
  return group;
}

function createArrowSlit(height: number, scale: number): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 1.0 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.15 * scale, height, 0.05 * scale), mat);
  return mesh;
}

function createMachicolations(width: number, depth: number, y: number, mats: MedMaterials, scale: number): THREE.Group {
  const g = new THREE.Group();
  const count = Math.floor(width / (0.8 * scale));
  const spacing = width / count;
  
  for (let i = 0; i <= count; i++) {
    const x = -width / 2 + i * spacing;
    const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.3 * scale, 0.6 * scale, 0.4 * scale), mats.stone);
    corbel.position.set(x, y - 0.3 * scale, depth / 2 + 0.1 * scale);
    g.add(corbel);
  }
  return g;
}

export function buildMalakaCastle(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  // 1. Level 1 Base (The Stronghold)
  const baseW = 10 * scale;
  const baseH = 8 * scale;
  const base = new THREE.Mesh(new THREE.BoxGeometry(baseW, baseH, baseW), mats.stone);
  base.position.y = baseH / 2;
  base.castShadow = base.receiveShadow = true;
  base.userData.isCollider = true;
  g.add(base);

  // 2. Level 2 (Upper Keep)
  const upperW = 6 * scale;
  const upperH = 6 * scale;
  const upper = new THREE.Mesh(new THREE.BoxGeometry(upperW, upperH, upperW), mats.stone);
  upper.position.y = baseH + upperH / 2;
  upper.castShadow = true;
  g.add(upper);

  // 3. Corner Turrets (Bartizans)
  const turretR = 1.2 * scale;
  const turretH = 4 * scale;
  const turretGeo = new THREE.CylinderGeometry(turretR, turretR, turretH, 8);
  for (const [tx, tz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const turret = new THREE.Mesh(turretGeo, mats.stone);
    turret.position.set(tx * (baseW / 2), baseH + turretH / 2 - 1 * scale, tz * (baseW / 2));
    g.add(turret);
    
    // Turret Crenellations
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const cren = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scale, 0.6 * scale, 0.4 * scale), mats.stone);
      cren.position.set(
        tx * (baseW / 2) + Math.cos(a) * turretR,
        baseH + turretH - 1 * scale + 0.3 * scale,
        tz * (baseW / 2) + Math.sin(a) * turretR
      );
      g.add(cren);
    }
  }

  // 4. Detail: Arrow Slits (Saeteras)
  for (let i = -1; i <= 1; i += 2) {
    const slitF = createArrowSlit(1.5 * scale, scale);
    slitF.position.set(i * 2 * scale, baseH * 0.6, baseW / 2 + 0.05 * scale);
    g.add(slitF);
    
    const slitS = createArrowSlit(1.5 * scale, scale);
    slitS.rotation.y = Math.PI / 2;
    slitS.position.set(baseW / 2 + 0.05 * scale, baseH * 0.6, i * 2 * scale);
    g.add(slitS);
  }

  // 5. Machicolations (Corbels)
  g.add(createMachicolations(baseW, baseW, baseH, mats, scale));
  const rearM = createMachicolations(baseW, baseW, baseH, mats, scale);
  rearM.rotation.y = Math.PI;
  g.add(rearM);

  // 6. Horseshoe Arch Entrance
  const arch = createHorseshoeArch(3 * scale, 4 * scale, 0.8 * scale, mats);
  arch.position.set(0, 0, baseW / 2 + 0.2 * scale);
  g.add(arch);

  return g;
}

export function buildMalakaTower(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();
  
  const width = 5 * scale;
  const height = 15 * scale;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, width), mats.stone);
  body.position.y = height / 2;
  body.castShadow = true;
  body.userData.isCollider = true;
  g.add(body);
  
  // High Arrow Slits
  for (let y = 0.3; y < 0.9; y += 0.2) {
    const slit = createArrowSlit(2 * scale, scale);
    slit.position.set(0, height * y, width / 2 + 0.05 * scale);
    g.add(slit);
  }
  
  // Top Machicolations
  g.add(createMachicolations(width, width, height, mats, scale));
  
  // Top Crenellations
  const crenSize = 0.5 * scale;
  for (let i = -width/2 + crenSize/2; i <= width/2; i += crenSize * 2) {
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(crenSize, 0.8 * scale, crenSize), mats.stone);
    c1.position.set(i, height + 0.4 * scale, width / 2 - 0.2 * scale);
    g.add(c1);
  }

  return g;
}

export function buildMalakaWall(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();
  const wallW = 10 * scale;
  const wallH = 6 * scale;
  const wallT = 2.5 * scale;

  const wall = new THREE.Mesh(new THREE.BoxGeometry(wallW, wallH, wallT), mats.stone);
  wall.position.y = wallH / 2;
  wall.castShadow = wall.receiveShadow = true;
  wall.userData.isCollider = true;
  g.add(wall);

  // Arrow Slits in the wall
  for (let x = -3 * scale; x <= 3 * scale; x += 3 * scale) {
    const slit = createArrowSlit(1.2 * scale, scale);
    slit.position.set(x, wallH * 0.5, wallT / 2 + 0.05 * scale);
    g.add(slit);
  }

  // Walkway
  const walkW = wallW;
  const walkT = wallT - 0.8 * scale;
  const walk = new THREE.Mesh(new THREE.BoxGeometry(walkW, 0.2 * scale, walkT), mats.stone);
  walk.position.y = wallH - 0.1 * scale;
  g.add(walk);

  // Crenellations
  const crenSize = 0.6 * scale;
  const crenH = 1.0 * scale;
  for (let x = -wallW / 2 + crenSize / 2; x <= wallW / 2; x += crenSize * 2) {
    const cren = new THREE.Mesh(new THREE.BoxGeometry(crenSize, crenH, 0.6 * scale), mats.stone);
    cren.position.set(x, wallH + crenH / 2, wallT / 2 - 0.3 * scale);
    g.add(cren);
  }

  return g;
}

export function buildRomanAmphitheatre(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();
  const innerR = 4.0 * scale;
  const orch = new THREE.Mesh(new THREE.CylinderGeometry(innerR, innerR, 0.3 * scale, 48, 1, false, Math.PI, Math.PI), mats.stone);
  orch.position.y = 0.15 * scale;
  orch.userData.isCollider = true;
  g.add(orch);
  return g;
}

export function buildMalakaHouseReconstructed(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();
  const width = 5 * scale;
  const depth = 5 * scale;
  const totalHeight = 5 * scale;
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, totalHeight, depth), mats.stucco);
  body.position.y = totalHeight / 2;
  body.userData.isCollider = true;
  g.add(body);
  return g;
}
