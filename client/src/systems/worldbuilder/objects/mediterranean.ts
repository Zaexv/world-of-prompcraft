import * as THREE from 'three';

// ─── Procedural Canvas Texture Generators ──────────────────────────────────────

function createStuccoTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f9f6f0'; // Warm Mediterranean white
  ctx.fillRect(0, 0, 256, 256);

  // Add plaster noise
  for (let i = 0; i < 5000; i++) {
    const isDark = Math.random() > 0.5;
    ctx.fillStyle = isDark ? 'rgba(0, 0, 0, 0.03)' : 'rgba(255, 255, 255, 0.3)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
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

  // Base terracotta
  ctx.fillStyle = '#c05030';
  ctx.fillRect(0, 0, 256, 256);

  // Draw tile lines
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#803010'; // Dark crevices
  for (let x = 0; x < 256; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 256);
    ctx.stroke();

    // Horizontal overlaps
    for (let y = 0; y < 256; y += 32) {
      const offset = (x / 16) % 2 === 0 ? 0 : 16;
      ctx.beginPath();
      ctx.moveTo(x, y + offset);
      ctx.lineTo(x + 16, y + offset);
      ctx.stroke();
      
      // Highlight edge of tile
      ctx.fillStyle = '#d06040';
      ctx.fillRect(x, y + offset - 2, 16, 2);
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

  ctx.fillStyle = '#c8c0b0'; // Warm sandstone
  ctx.fillRect(0, 0, 256, 256);

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#8a8070';
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

  ctx.fillStyle = '#4a2f1d'; // Dark wood
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#3a2010';
  for (let i = 0; i < 200; i++) {
    const w = 1 + Math.random() * 3;
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
      stucco: new THREE.MeshStandardMaterial({
        map: createStuccoTexture(),
        roughness: 0.95,
      }),
      roof: new THREE.MeshStandardMaterial({
        map: createTerracottaRoofTexture(),
        roughness: 0.8,
      }),
      stone: new THREE.MeshStandardMaterial({
        map: createStoneWallTexture(),
        roughness: 0.9,
      }),
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

// ─── Builders ─────────────────────────────────────────────────────────────────

export function buildMalakaHouse(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  // Pseudo-randomizer based on position so layout is deterministic but varied
  const seed = Math.abs(Math.floor(pos.x * 100 + pos.z * 100));
  const isTwoStory = seed % 3 === 0; // 33% chance for two stories
  const hasBalcony = seed % 2 === 0;

  const width = 4 * scale;
  const depth = 4 * scale;
  const floors = isTwoStory ? 2 : 1;
  const floorHeight = 2.5 * scale;
  const totalHeight = floors * floorHeight;

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, totalHeight, depth), mats.stucco);
  body.position.y = totalHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isCollider = true;
  g.add(body);

  // Overhanging Roof (Pyramid / Cone with 4 segments)
  const roofOverhang = 0.5 * scale;
  const roofRadius = Math.sqrt(Math.pow((width + roofOverhang)/2, 2) * 2);
  const roofHeight = 1.8 * scale;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(roofRadius, roofHeight, 4), mats.roof);
  roof.position.y = totalHeight + (roofHeight / 2);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData.isCollider = true;
  g.add(roof);

  // Door
  const doorW = 0.8 * scale;
  const doorH = 1.8 * scale;
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.2 * scale), mats.wood);
  door.position.set(0, doorH / 2, depth / 2);
  door.userData.noCollision = true;
  g.add(door);

  // Windows
  const winW = 0.6 * scale;
  const winH = 0.8 * scale;
  const winGeo = new THREE.BoxGeometry(winW, winH, 0.2 * scale);
  
  for (let f = 1; f <= floors; f++) {
    // Front window (offset from door if 1st floor)
    if (f > 1 || width > 3) {
      const wx = (f === 1) ? 1.0 * scale : 0;
      const win = new THREE.Mesh(winGeo, mats.glass);
      win.position.set(wx, (f - 1) * floorHeight + 1.2 * scale, depth / 2);
      win.userData.noCollision = true;
      g.add(win);

      // Balcony for 2nd floor
      if (f === 2 && hasBalcony) {
        const balc = new THREE.Mesh(new THREE.BoxGeometry(1.6 * scale, 0.1 * scale, 0.8 * scale), mats.stone);
        balc.position.set(wx, (f - 1) * floorHeight + 0.5 * scale, depth / 2 + 0.4 * scale);
        balc.castShadow = true;
        balc.userData.noCollision = true;
        g.add(balc);
      }
    }
    
    // Side window
    const sideWin = new THREE.Mesh(winGeo, mats.glass);
    sideWin.rotation.y = Math.PI / 2;
    sideWin.position.set(width / 2, (f - 1) * floorHeight + 1.2 * scale, 0);
    sideWin.userData.noCollision = true;
    g.add(sideWin);
  }

  return g;
}

export function buildMalakaChurch(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  // Base / Steps
  const base = new THREE.Mesh(new THREE.BoxGeometry(12 * scale, 0.4 * scale, 16 * scale), mats.stone);
  base.position.y = 0.2 * scale;
  base.castShadow = true;
  base.receiveShadow = true;
  base.userData.isCollider = true;
  g.add(base);

  // Main Nave
  const naveW = 6 * scale;
  const naveH = 7 * scale;
  const naveD = 14 * scale;
  const nave = new THREE.Mesh(new THREE.BoxGeometry(naveW, naveH, naveD), mats.stucco);
  nave.position.y = 0.4 * scale + naveH / 2;
  nave.castShadow = true;
  nave.receiveShadow = true;
  nave.userData.isCollider = true;
  g.add(nave);

  // Transept (Cross shape)
  const transW = 10 * scale;
  const transH = 6 * scale;
  const transD = 4 * scale;
  const transept = new THREE.Mesh(new THREE.BoxGeometry(transW, transH, transD), mats.stucco);
  transept.position.set(0, 0.4 * scale + transH / 2, -3 * scale);
  transept.castShadow = true;
  transept.userData.isCollider = true;
  g.add(transept);

  // Nave Roof (Cylinder rotated to form a triangular prism)
  const roofRadius = Math.sqrt(Math.pow(naveW / 2, 2) * 2) * 1.1; // Overhang
  const roofGeo = new THREE.CylinderGeometry(roofRadius, roofRadius, naveD + 1 * scale, 4);
  const naveRoof = new THREE.Mesh(roofGeo, mats.roof);
  naveRoof.rotation.z = Math.PI / 4;
  naveRoof.rotation.x = Math.PI / 2;
  naveRoof.position.y = 0.4 * scale + naveH + (roofRadius * Math.sin(Math.PI/4) / 2);
  naveRoof.castShadow = true;
  naveRoof.receiveShadow = true;
  naveRoof.userData.isCollider = true;
  g.add(naveRoof);

  // Grand Entrance Doors
  const doorGeo = new THREE.CylinderGeometry(1.5 * scale, 1.5 * scale, 0.4 * scale, 16, 1, false, 0, Math.PI);
  const arch = new THREE.Mesh(doorGeo, mats.wood);
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, 0.4 * scale + 1.5 * scale, naveD / 2 + 0.1 * scale);
  arch.userData.noCollision = true;
  g.add(arch);

  const doors = new THREE.Mesh(new THREE.BoxGeometry(3 * scale, 1.5 * scale, 0.4 * scale), mats.wood);
  doors.position.set(0, 0.4 * scale + 0.75 * scale, naveD / 2 + 0.1 * scale);
  doors.userData.noCollision = true;
  g.add(doors);

  // Rose Window (Emissive)
  const roseMat = new THREE.MeshStandardMaterial({
    color: 0xffdd88,
    emissive: 0xffaa33,
    emissiveIntensity: 1.5,
  });
  const rose = new THREE.Mesh(new THREE.CylinderGeometry(1.2 * scale, 1.2 * scale, 0.5 * scale, 16), roseMat);
  rose.rotation.x = Math.PI / 2;
  rose.position.set(0, 0.4 * scale + 4.5 * scale, naveD / 2 + 0.1 * scale);
  rose.userData.noCollision = true;
  g.add(rose);

  // Bell Tower
  const towerW = 3.5 * scale;
  const towerH = 15 * scale;
  const tower = new THREE.Mesh(new THREE.BoxGeometry(towerW, towerH, towerW), mats.stucco);
  tower.position.set(-3.5 * scale, 0.4 * scale + towerH / 2, naveD / 2 - 1.5 * scale);
  tower.castShadow = true;
  tower.receiveShadow = true;
  tower.userData.isCollider = true;
  g.add(tower);

  // Open arches at top of tower
  const bellRoom = new THREE.Mesh(new THREE.BoxGeometry(2.5 * scale, 2.5 * scale, 2.5 * scale), mats.stone);
  bellRoom.position.set(-3.5 * scale, 0.4 * scale + towerH + 1.25 * scale, naveD / 2 - 1.5 * scale);
  bellRoom.castShadow = true;
  bellRoom.userData.isCollider = true;
  g.add(bellRoom);

  // Tower Roof
  const towerRoofRad = Math.sqrt(Math.pow(towerW / 2 + 0.5 * scale, 2) * 2);
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(towerRoofRad, 3 * scale, 4), mats.roof);
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.position.set(-3.5 * scale, 0.4 * scale + towerH + 2.5 * scale + 1.5 * scale, naveD / 2 - 1.5 * scale);
  towerRoof.castShadow = true;
  towerRoof.userData.isCollider = true;
  g.add(towerRoof);

  return g;
}

export function buildMalakaCastle(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  // Central Keep (Massive slanted walls)
  const keepRadiusB = 8 * scale;
  const keepRadiusT = 7 * scale;
  const keepH = 10 * scale;
  
  // Use cylinder with 4 segments for a pyramid frustum
  const keepGeo = new THREE.CylinderGeometry(keepRadiusT, keepRadiusB, keepH, 4);
  const keep = new THREE.Mesh(keepGeo, mats.stone);
  keep.rotation.y = Math.PI / 4; // Align flat with X/Z
  keep.position.y = keepH / 2;
  keep.castShadow = true;
  keep.receiveShadow = true;
  keep.userData.isCollider = true;
  g.add(keep);

  // Corner towers (Cylindrical)
  const towerRadius = 2.5 * scale;
  const towerH = 14 * scale;
  const towerGeo = new THREE.CylinderGeometry(towerRadius, towerRadius + 0.5*scale, towerH, 12);
  
  // Actually, diagonal distance for a square of width 2*R is R * sqrt(2)
  const cornerDist = (keepRadiusB * Math.sqrt(2)) / 2;
  
  for (const [x, z] of [[-cornerDist, -cornerDist], [cornerDist, -cornerDist], [-cornerDist, cornerDist], [cornerDist, cornerDist]]) {
    const tower = new THREE.Mesh(towerGeo, mats.stone);
    tower.position.set(x, towerH / 2, z);
    tower.castShadow = true;
    tower.receiveShadow = true;
    tower.userData.isCollider = true;
    g.add(tower);

    // Crenellations for towers
    const crenelRadius = towerRadius + 0.2*scale;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
      const cren = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, 1 * scale, 0.8 * scale), mats.stone);
      cren.position.set(x + Math.cos(a) * crenelRadius, towerH + 0.5 * scale, z + Math.sin(a) * crenelRadius);
      cren.userData.noCollision = true; // Optimization
      g.add(cren);
    }
  }

  // Gatehouse
  const gateW = 5 * scale;
  const gateH = 6 * scale;
  const gatehouse = new THREE.Mesh(new THREE.BoxGeometry(gateW, gateH, 3 * scale), mats.stone);
  gatehouse.position.set(0, gateH / 2, cornerDist + 1 * scale);
  gatehouse.castShadow = true;
  gatehouse.userData.isCollider = true;
  g.add(gatehouse);

  // Portcullis (Wood grate)
  const archGeo = new THREE.CylinderGeometry(1.5 * scale, 1.5 * scale, 0.5 * scale, 12, 1, false, 0, Math.PI);
  const arch = new THREE.Mesh(archGeo, mats.wood);
  arch.rotation.x = Math.PI / 2;
  arch.position.set(0, 2 * scale, cornerDist + 2.5 * scale);
  arch.userData.noCollision = true;
  g.add(arch);

  return g;
}

export function buildRomanAmphitheatre(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  // Create tiered semi-circular steps
  const tiers = 8;
  const tierWidth = 1.5 * scale;
  const tierHeight = 0.8 * scale;
  
  for (let i = 1; i <= tiers; i++) {
    const radiusOut = (2 + i) * tierWidth;
    const radiusIn = (1 + i) * tierWidth;
    const h = i * tierHeight;
    
    // Extrude a ring sector manually or use CylinderGeometry with thetaLength
    const geo = new THREE.CylinderGeometry(radiusOut, radiusOut, h, 32, 1, false, Math.PI, Math.PI);
    const mesh = new THREE.Mesh(geo, mats.stone);
    mesh.position.y = h / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isCollider = true;
    g.add(mesh);
    
    // The "seat" part (top of the cylinder is flat, but we need inner thickness). 
    // CylinderGeometry only gives the outer wall. We use an inner cylinder subtracted, 
    // but in Three.js it's easier to use a RingGeometry on top for the seat surface.
    const seatGeo = new THREE.RingGeometry(radiusIn, radiusOut, 32, 1, Math.PI, Math.PI);
    const seat = new THREE.Mesh(seatGeo, mats.stone);
    seat.rotation.x = -Math.PI / 2;
    seat.position.y = h;
    seat.receiveShadow = true;
    seat.userData.noCollision = true; // The cylinder wall handles collision enough for stairs
    g.add(seat);
  }

  // Stage area (Orchestra)
  const stageRad = 3 * tierWidth;
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(stageRad, stageRad, 0.4 * scale, 32, 1, false, Math.PI, Math.PI), mats.stone);
  stage.position.y = 0.2 * scale;
  stage.receiveShadow = true;
  stage.userData.isCollider = true;
  g.add(stage);

  // Scenae frons (Backdrop wall)
  const backWallW = stageRad * 2.2;
  const backWallH = tiers * tierHeight + 2 * scale;
  const backWall = new THREE.Mesh(new THREE.BoxGeometry(backWallW, backWallH, 2 * scale), mats.stucco);
  backWall.position.set(0, backWallH / 2, 1 * scale); // Positioned at Z=0 (the flat side of the semi-circle)
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  backWall.userData.isCollider = true;
  g.add(backWall);

  // Columns on the backdrop
  const colRad = 0.3 * scale;
  for (let x = -backWallW / 2 + 1*scale; x <= backWallW / 2 - 1*scale; x += 3 * scale) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(colRad, colRad, backWallH, 8), mats.stone);
    col.position.set(x, backWallH / 2, -0.2 * scale);
    col.castShadow = true;
    col.userData.noCollision = true;
    g.add(col);
  }

  return g;
}
