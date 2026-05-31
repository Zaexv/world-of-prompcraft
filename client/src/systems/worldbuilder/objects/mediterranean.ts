import * as THREE from 'three';
import { applyMalakaPBR } from '../../../utils/PBRMaps';
import { boxCollider, cylinderCollider } from '../colliderProxy';

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
        const m = new THREE.MeshStandardMaterial({ roughness: 0.95 });
        applyMalakaPBR(m, 'stucco');
        // Whitewashed Andalusian plaster: drop the cream albedo (a colour tint
        // can only darken it) and use a bright near-white base so the walls read
        // white. The procedural normal map kept by applyMalakaPBR still gives the
        // plaster its surface relief.
        m.map = null;
        m.color.set(0xf4f1eb);
        m.needsUpdate = true;
        return m;
      })(),
      roof: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.8 });
        applyMalakaPBR(m, 'roof');
        return m;
      })(),
      stone: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.9 });
        applyMalakaPBR(m, 'stone');
        return m;
      })(),
      wood: (() => {
        const m = new THREE.MeshStandardMaterial({ roughness: 0.8 });
        applyMalakaPBR(m, 'wood');
        return m;
      })(),
      glass: new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.1,
        metalness: 0.8,
      }),
    };
  }
  return _materials;
}

// ─── World-scaled stone (fixes stretched masonry on large meshes) ─────────────
// The shared `mats.stone` tiles its texture a fixed 4×4 per UV face, so a tiny
// foundation and a 16 m cathedral base get the same number of stone courses —
// huge meshes look stretched. `stoneBox` instead writes UVs in *world units*, so
// the blocks stay a constant size whatever the mesh dimensions.

let _worldStone: THREE.MeshStandardMaterial | null = null;
function getWorldStone(): THREE.MeshStandardMaterial {
  if (!_worldStone) {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    applyMalakaPBR(m, 'stone');
    // Clone the maps so tiling lives in the geometry UVs (repeat 1×1 here),
    // independent of the shared stone material used elsewhere.
    if (m.map) { m.map = m.map.clone(); m.map.repeat.set(1, 1); m.map.needsUpdate = true; }
    if (m.normalMap) { m.normalMap = m.normalMap.clone(); m.normalMap.repeat.set(1, 1); m.normalMap.needsUpdate = true; }
    m.needsUpdate = true;
    _worldStone = m;
  }
  return _worldStone;
}

const STONE_UNITS_PER_TILE = 2.2; // ~one stone course every 2.2 world units

/**
 * Rewrite a BoxGeometry's UVs so the stone texture tiles by world size. Each
 * face is scaled by its own world dimensions (rounded to whole tiles so edges
 * stay seam-free), which also fixes per-face anisotropy on slabs and towers.
 */
function tileBoxUVsWorld(geo: THREE.BoxGeometry, w: number, h: number, d: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z (4 verts each). Each face's
  // U/V axes span these world dimensions:
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

/** A stone box whose masonry tiles at a constant world scale (no stretching). */
function stoneBox(w: number, h: number, d: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  tileBoxUVsWorld(geo, w, h, d);
  return new THREE.Mesh(geo, getWorldStone());
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
    g.add(mesh);

    const proxy = boxCollider(w.w, w.h, w.d);
    proxy.position.set(w.x, 0.5 * scale + w.h / 2, w.z);
    g.add(proxy);
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
      tile.userData.noCollision = true;
      tile.userData.noCollision = true; // Optimization: decorative tile
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
  g.add(nave);

  const naveProxy = boxCollider(naveW, naveH, naveD);
  naveProxy.position.y = naveH / 2 + 0.1 * scale;
  g.add(naveProxy);

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

  // Front facade wall was previously non-colliding (player clipped through it).
  const facadeProxy = boxCollider(facadeW, facadeH, facadeT);
  facadeProxy.position.set(0, facadeH / 2 + 0.1 * scale, naveD / 2 + facadeT / 2);
  g.add(facadeProxy);

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

  // 1. Massive Stone Base
  const baseW = 16 * scale;
  const baseD = 24 * scale;
  const base = stoneBox(baseW, 0.8 * scale, baseD);
  base.position.y = 0.4 * scale;
  base.castShadow = base.receiveShadow = true;
  g.add(base);

  // 2. Main Nave (High Cathedral)
  const naveW = 10 * scale;
  const naveH = 14 * scale;
  const naveD = 20 * scale;
  // Overlap the base so the nave's bottom face is buried inside it (no coplanar
  // seam → no z-fighting). Keeps the top edge exactly at 0.8*scale + naveH.
  const naveSink = 0.3 * scale;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH + naveSink, naveD), mats.stucco);
  nave.position.y = 0.8 * scale + naveH / 2 - naveSink / 2;
  nave.castShadow = nave.receiveShadow = true;
  g.add(nave);

  // 3. Main Roof (Vaulted/Curved)
  const roofH = 4 * scale;
  const naveRoof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, naveW / 2 + 0.5 * scale, roofH, 8), mats.roof);
  naveRoof.rotation.z = Math.PI / 4;
  naveRoof.rotation.x = Math.PI / 2;
  naveRoof.scale.set(1, naveD / roofH, 1);
  naveRoof.position.y = 0.8 * scale + naveH + (naveW / 4);
  naveRoof.userData.noCollision = true;
  g.add(naveRoof);

  // 4. Central Dome (Transept)
  const domeR = 5 * scale;
  // Drum extends 0.6 below the nave top so its base ring sits inside the nave
  // instead of coplanar with the nave's top face. Top stays at +naveH + 4.
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(domeR, domeR, 4.6 * scale, 16), mats.stone);
  domeBase.position.set(0, 0.8 * scale + naveH + 1.7 * scale, -2 * scale);
  domeBase.userData.noCollision = true;
  g.add(domeBase);

  const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR + 0.2 * scale, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2), mats.roof);
  dome.position.set(0, 0.8 * scale + naveH + 4 * scale, -2 * scale);
  dome.userData.noCollision = true;
  g.add(dome);

  // 5. The Single Tower ("La Manquita")
  const towerW = 4.5 * scale;
  const towerH = 22 * scale;
  // Nudge the tower outward so its outer faces clear the nave walls instead of
  // being coplanar with them; the inner half still overlaps the nave (no seam).
  const towerX = -naveW / 2 + towerW / 2 - 0.3 * scale;
  const towerZ = naveD / 2 - towerW / 2 + 0.3 * scale;
  const tower = stoneBox(towerW, towerH, towerW);
  tower.position.set(towerX, 0.8 * scale + towerH / 2, towerZ);
  g.add(tower);

  // Tower Belfry (Open Arches)
  const belfryH = 5 * scale;
  const belfry = new THREE.Mesh(new THREE.CylinderGeometry(towerW * 0.6, towerW * 0.6, belfryH, 8), mats.stone);
  belfry.position.set(towerX, 0.8 * scale + towerH + belfryH / 2, towerZ);
  belfry.userData.noCollision = true;
  g.add(belfry);

  const belfryDome = new THREE.Mesh(new THREE.SphereGeometry(towerW * 0.6, 8, 8, 0, Math.PI*2, 0, Math.PI/2), mats.roof);
  belfryDome.position.set(towerX, 0.8 * scale + towerH + belfryH, towerZ);
  belfryDome.userData.noCollision = true;
  g.add(belfryDome);

  // Missing Right Tower Base — mirror the outward nudge of the main tower.
  const missingTower = stoneBox(towerW, 8 * scale, towerW);
  missingTower.position.set(naveW / 2 - towerW / 2 + 0.3 * scale, 0.8 * scale + 4 * scale, naveD / 2 - towerW / 2 + 0.3 * scale);
  g.add(missingTower);

  // 6. Flying Buttresses (Contrafuertes)
  for (let z = -naveD / 2 + 4 * scale; z <= naveD / 2 - 6 * scale; z += 4 * scale) {
    for (const side of [-1, 1]) {
      const buttress = stoneBox(3 * scale, 10 * scale, 1.5 * scale);
      // Inner face embeds 0.4 into the nave wall rather than sitting flush on it.
      buttress.position.set(side * (naveW / 2 + 1.1 * scale), 0.8 * scale + 5 * scale, z);
      buttress.userData.noCollision = true;
      g.add(buttress);
    }
  }

  // 7. Grand Entrance
  const entrance = createArchedDoor(4.0 * scale, 6.0 * scale, 1.0 * scale, mats);
  entrance.userData.noCollision = true;
  entrance.traverse(c => { c.userData.noCollision = true; });
  entrance.position.set(0, 0.8 * scale, naveD / 2 + 0.4 * scale);
  g.add(entrance);

  // ── Collision proxies (option 2: explicit invisible hitboxes) ──────────
  // The capsule collides against these clean convex boxes instead of the
  // decorated stone/stucco render meshes above. They mirror the visible solid
  // masonry — including the buttresses, which previously had no collision so the
  // player clipped straight through them.
  const naveProxy = boxCollider(naveW, naveH, naveD);
  naveProxy.position.y = 0.8 * scale + naveH / 2;
  g.add(naveProxy);

  const baseProxy = boxCollider(baseW, 0.8 * scale, baseD);
  baseProxy.position.y = 0.4 * scale;
  g.add(baseProxy);

  const towerProxy = boxCollider(towerW, towerH, towerW);
  towerProxy.position.set(towerX, 0.8 * scale + towerH / 2, towerZ);
  g.add(towerProxy);

  const missingTowerProxy = boxCollider(towerW, 8 * scale, towerW);
  missingTowerProxy.position.set(naveW / 2 - towerW / 2 + 0.3 * scale, 0.8 * scale + 4 * scale, naveD / 2 - towerW / 2 + 0.3 * scale);
  g.add(missingTowerProxy);

  for (let z = -naveD / 2 + 4 * scale; z <= naveD / 2 - 6 * scale; z += 4 * scale) {
    for (const side of [-1, 1]) {
      const buttressProxy = boxCollider(3 * scale, 10 * scale, 1.5 * scale);
      buttressProxy.position.set(side * (naveW / 2 + 1.1 * scale), 0.8 * scale + 5 * scale, z);
      g.add(buttressProxy);
    }
  }

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

  // 1. Lower Defensive Tier (The Barbican)
  const tier1W = 16 * scale;
  const tier1H = 6 * scale;
  const base1 = new THREE.Mesh(new THREE.BoxGeometry(tier1W, tier1H, tier1W), mats.stone);
  base1.position.y = tier1H / 2;
  g.add(base1);

  const base1Proxy = boxCollider(tier1W, tier1H, tier1W);
  base1Proxy.position.y = tier1H / 2;
  g.add(base1Proxy);

  // 2. Middle Palace Tier (with Horseshoe Arches)
  const tier2W = 10 * scale;
  const tier2H = 5 * scale;
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(tier2W, tier2H, tier2W), mats.stone);
  base2.position.set(0, tier1H + tier2H / 2, -2 * scale);
  g.add(base2);

  const base2Proxy = boxCollider(tier2W, tier2H, tier2W);
  base2Proxy.position.set(0, tier1H + tier2H / 2, -2 * scale);
  g.add(base2Proxy);

  // 3. Upper Keep (Torre del Homenaje)
  const keepW = 6 * scale;
  const keepH = 8 * scale;
  const keep = new THREE.Mesh(new THREE.BoxGeometry(keepW, keepH, keepW), mats.stone);
  keep.position.set(0, tier1H + tier2H + keepH / 2, -4 * scale);
  g.add(keep);

  const keepProxy = boxCollider(keepW, keepH, keepW);
  keepProxy.position.set(0, tier1H + tier2H + keepH / 2, -4 * scale);
  g.add(keepProxy);

  // 4. Courtyard Gardens (Green zones on tiers)
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 1.0 });
  const garden = new THREE.Mesh(new THREE.BoxGeometry(tier1W - 2 * scale, 0.2 * scale, 4 * scale), grassMat);
  garden.position.set(0, tier1H + 0.1 * scale, 4 * scale);
  garden.userData.noCollision = true;
  g.add(garden);

  // 5. Corner Turrets (Bartizans)
  for (const tx of [-1, 1]) {
    const turretH = 4 * scale;
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(1.5 * scale, 1.5 * scale, turretH, 8), mats.stone);
    turret.position.set(tx * (tier1W / 2), tier1H + turretH / 2, tier1W / 2);
    g.add(turret);
  }

  // 6. Horseshoe Arch Entrance
  const gate = createHorseshoeArch(3 * scale, 4 * scale, 1.0 * scale, mats);
  gate.userData.noCollision = true;
  gate.traverse(c => { c.userData.noCollision = true; });
  gate.position.set(0, 0, tier1W / 2 + 0.1 * scale);
  g.add(gate);

  // 7. Arrow Slits and Machicolations
  g.add(createMachicolations(tier1W, tier1W, tier1H, mats, scale));
  
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
  g.add(body);

  const bodyProxy = boxCollider(width, height, width);
  bodyProxy.position.y = height / 2;
  g.add(bodyProxy);
  
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
  g.add(wall);

  const wallProxy = boxCollider(wallW, wallH, wallT);
  wallProxy.position.y = wallH / 2;
  g.add(wallProxy);

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
  g.add(orch);

  // The orchestra floor renders as a half-disc; the collider is a clean full
  // low cylinder so the capsule never snags on the open arc edges.
  const orchProxy = cylinderCollider(innerR, 0.3 * scale);
  orchProxy.position.y = 0.15 * scale;
  g.add(orchProxy);
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
  g.add(body);

  const bodyProxy = boxCollider(width, totalHeight, depth);
  bodyProxy.position.y = totalHeight / 2;
  g.add(bodyProxy);
  return g;
}

export function buildMalakaCortijo(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  const mainW = 12 * scale;
  const mainH = 4 * scale;

  // 1. L-Shaped Main Body (two wings)
  const wing1 = new THREE.Mesh(new THREE.BoxGeometry(mainW, mainH, 4 * scale), mats.stucco);
  wing1.position.set(0, mainH / 2, 0);
  wing1.castShadow = true;
  g.add(wing1);

  const wing1Proxy = boxCollider(mainW, mainH, 4 * scale);
  wing1Proxy.position.set(0, mainH / 2, 0);
  g.add(wing1Proxy);

  const wing2 = new THREE.Mesh(new THREE.BoxGeometry(4 * scale, mainH, 6 * scale), mats.stucco);
  wing2.position.set(-mainW / 2 + 2 * scale, mainH / 2, 5 * scale);
  wing2.castShadow = true;
  g.add(wing2);

  const wing2Proxy = boxCollider(4 * scale, mainH, 6 * scale);
  wing2Proxy.position.set(-mainW / 2 + 2 * scale, mainH / 2, 5 * scale);
  g.add(wing2Proxy);

  // 2. Flat Terrace (Terraza Plana)
  const terrace = new THREE.Mesh(new THREE.BoxGeometry(mainW - 0.2 * scale, 0.4 * scale, 4 * scale - 0.2 * scale), mats.stone);
  terrace.position.set(0, mainH + 0.2 * scale, 0);
  g.add(terrace);

  // 3. Small Tower with Pitched Roof
  const towerW = 3.5 * scale;
  const towerH = 3 * scale;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), mats.stucco);
  tower.position.set(0, mainH + towerH / 2, 0);
  tower.userData.noCollision = true; // Optimization: high-up detail
  g.add(tower);

  const tRoof = new THREE.Mesh(new THREE.ConeGeometry(towerW * 0.8, 1.8 * scale, 4), mats.roof);
  tRoof.position.set(0, mainH + towerH + 0.9 * scale, 0);
  tRoof.rotation.y = Math.PI / 4;
  tRoof.userData.noCollision = true;
  g.add(tRoof);

  // 4. Large Arched Gate (Portón de Carros)
  const gate = createArchedDoor(3.5 * scale, 3.2 * scale, 0.6 * scale, mats);
  gate.userData.noCollision = true;
  gate.traverse(c => { c.userData.noCollision = true; });
  gate.position.set(2 * scale, 0, 2.05 * scale);
  g.add(gate);

  // 5. Exterior Windows & Details
  for (let x = -4 * scale; x <= 4 * scale; x += 4 * scale) {
    if (Math.abs(x - 2 * scale) < 1) continue; // Skip if gate is here
    const win = createWindowWithGrille(0.8 * scale, 1.2 * scale, scale, mats);
    win.position.set(x, 2.2 * scale, 2.05 * scale);
    win.userData.noCollision = true;
    g.add(win);
  }

  return g;
}

export function buildMalakaBodega(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  const length = 15 * scale;
  const width = 8 * scale;
  const height = 6 * scale;

  // 1. Massive Industrial Nave
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), mats.stucco);
  body.position.y = height / 2;
  body.castShadow = true;
  g.add(body);

  const bodyProxy = boxCollider(width, height, length);
  bodyProxy.position.y = height / 2;
  g.add(bodyProxy);

  // 2. High Ventilation Windows (Ventanas Altas)
  const winW = 0.6 * scale;
  const winH = 0.6 * scale;
  for (let z = -length / 2 + 2 * scale; z <= length / 2 - 2 * scale; z += 3 * scale) {
    const winL = new THREE.Mesh(new THREE.BoxGeometry(0.1 * scale, winH, winW), mats.glass);
    winL.position.set(-width / 2 - 0.05 * scale, height - 1 * scale, z);
    g.add(winL);

    const winR = winL.clone();
    winR.position.x = width / 2 + 0.05 * scale;
    g.add(winR);
  }

  // 3. Tasting Porch (Porche de Degustación)
  const porch = createPergola(4 * scale, 6 * scale, scale, mats);
  porch.userData.noCollision = true;
  porch.traverse(c => { c.userData.noCollision = true; });
  porch.position.set(width / 2 + 2 * scale, 0, 2 * scale);
  g.add(porch);

  // 4. Large Main Doors (End)
  const door = createArchedDoor(3.5 * scale, 4.5 * scale, 0.6 * scale, mats);
  door.userData.noCollision = true;
  door.traverse(c => { c.userData.noCollision = true; });
  door.position.set(0, 0, length / 2 + 0.1 * scale);
  g.add(door);

  // 5. Front Oculus
  const oculus = new THREE.Mesh(new THREE.CircleGeometry(0.6 * scale, 16), new THREE.MeshStandardMaterial({ color: 0x000000 }));
  oculus.position.set(0, height - 1.5 * scale, length / 2 + 0.31 * scale);
  oculus.userData.noCollision = true;
  g.add(oculus);

  // 6. Gabled Roof
  const roofH = 3 * scale;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, Math.sqrt(Math.pow(width/2 + 0.5 * scale, 2) * 2), roofH, 4), mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = height + roofH / 2;
  roof.userData.noCollision = true;
  g.add(roof);

  return g;
}
