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

  const tiers   = 7;
  const tierW   = 1.5 * scale;  // horizontal depth of each seat row
  const tierH   = 0.78 * scale; // rise of each step
  const innerR  = 4.0 * scale;  // orchestra edge radius
  const outerR  = innerR + tiers * tierW;
  const totalH  = tiers * tierH;

  // ── Cavea: proper staircase seating via LatheGeometry ──────────────────────
  // Profile in (radius, height) space — creates a stepped bowl when revolved.
  // Seating wraps the +Z hemisphere (phiStart=0, phiLength=π).
  // The open side (-Z) is where the stage lives.
  const pts: THREE.Vector2[] = [];
  pts.push(new THREE.Vector2(innerR, 0));
  for (let i = 0; i < tiers; i++) {
    // Seat ledge (horizontal run at this tier's height)
    pts.push(new THREE.Vector2(innerR + (i + 1) * tierW, i * tierH));
    // Riser (vertical rise to next tier)
    pts.push(new THREE.Vector2(innerR + (i + 1) * tierW, (i + 1) * tierH));
  }
  // Outer retaining wall capping the top
  pts.push(new THREE.Vector2(outerR + 0.5 * scale, totalH));
  pts.push(new THREE.Vector2(outerR + 0.5 * scale, 0));

  const cavea = new THREE.Mesh(
    new THREE.LatheGeometry(pts, 64, 0, Math.PI),
    mats.stone,
  );
  cavea.castShadow = true;
  cavea.receiveShadow = true;
  cavea.userData.isCollider = true;
  g.add(cavea);

  // ── Orchestra floor (half-disc in the -Z hemisphere) ───────────────────────
  const orch = new THREE.Mesh(
    new THREE.CylinderGeometry(innerR, innerR, 0.3 * scale, 48, 1, false, Math.PI, Math.PI),
    mats.stone,
  );
  orch.position.y = 0.15 * scale;
  orch.receiveShadow = true;
  orch.userData.isCollider = true;
  g.add(orch);

  // ── Stage / Pulpitum ───────────────────────────────────────────────────────
  const stageW = innerR * 2.2;
  const stageD = 4.5 * scale;
  const stageH = 0.9 * scale;
  const stageZ = -(innerR + stageD * 0.5);

  const stageMesh = new THREE.Mesh(
    new THREE.BoxGeometry(stageW, stageH, stageD),
    mats.stone,
  );
  stageMesh.position.set(0, stageH / 2, stageZ);
  stageMesh.castShadow = true;
  stageMesh.receiveShadow = true;
  stageMesh.userData.isCollider = true;
  g.add(stageMesh);

  // Two shallow steps descending from stage front toward audience
  for (let step = 0; step < 2; step++) {
    const sh = stageH * ((2 - step) / 3);
    const sz = stageZ - stageD / 2 - (step + 0.5) * 0.55 * scale;
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(stageW - step * 1.4 * scale, sh, 0.55 * scale),
      mats.stone,
    );
    s.position.set(0, sh / 2, sz);
    s.receiveShadow = true;
    s.userData.isCollider = true;
    g.add(s);
  }

  // ── Scaena Frons (tall decorated backdrop wall) ────────────────────────────
  const scaenaW = stageW + 5 * scale;
  const scaenaH = totalH + 2.5 * scale;
  const scaenaThick = 1.5 * scale;
  const scaenaZ = -(innerR + stageD + scaenaThick * 0.5);

  const scaena = new THREE.Mesh(
    new THREE.BoxGeometry(scaenaW, scaenaH, scaenaThick),
    mats.stucco,
  );
  scaena.position.set(0, scaenaH / 2, scaenaZ);
  scaena.castShadow = true;
  scaena.receiveShadow = true;
  scaena.userData.isCollider = true;
  g.add(scaena);

  // Columns along the scaena face
  const colR = 0.3 * scale;
  const colFaceZ = scaenaZ - scaenaThick * 0.5 - colR;
  for (let cx = -(scaenaW * 0.5) + 1.8 * scale; cx <= scaenaW * 0.5 - 1.8 * scale; cx += 3.2 * scale) {
    const col = new THREE.Mesh(
      new THREE.CylinderGeometry(colR, colR * 1.1, scaenaH - 0.8 * scale, 10),
      mats.stone,
    );
    col.position.set(cx, (scaenaH - 0.8 * scale) / 2, colFaceZ);
    col.castShadow = true;
    col.userData.noCollision = true;
    g.add(col);

    // Capital block
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(colR * 3, 0.28 * scale, colR * 3),
      mats.stone,
    );
    cap.position.set(cx, scaenaH - 0.8 * scale + 0.14 * scale, colFaceZ);
    cap.userData.noCollision = true;
    g.add(cap);
  }

  // Arched doorway niches in the scaena
  const nicheMat = new THREE.MeshStandardMaterial({ color: 0x0a0a12, roughness: 1.0 });
  for (let nx = -(scaenaW * 0.5) + 4.5 * scale; nx <= scaenaW * 0.5 - 4.5 * scale; nx += 5.5 * scale) {
    // Rectangular lower part
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(1.8 * scale, 2.0 * scale, scaenaThick + 0.15),
      nicheMat,
    );
    door.position.set(nx, 1.0 * scale, scaenaZ);
    door.userData.noCollision = true;
    g.add(door);

    // Semicircular arch top
    const archTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9 * scale, 0.9 * scale, scaenaThick + 0.15, 10, 1, false, 0, Math.PI),
      nicheMat,
    );
    archTop.rotation.x = Math.PI / 2;
    archTop.position.set(nx, 2.0 * scale, scaenaZ);
    archTop.userData.noCollision = true;
    g.add(archTop);
  }

  // ── Paraskenia: side enclosure walls flanking the stage ────────────────────
  for (const sx of [-(outerR + 0.5 * scale), (outerR + 0.5 * scale)] as const) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(2.0 * scale, totalH * 0.75, stageD + scaenaThick + 1.5 * scale),
      mats.stone,
    );
    wall.position.set(sx, totalH * 0.375, -(innerR + (stageD + scaenaThick) * 0.5));
    wall.castShadow = true;
    wall.userData.isCollider = true;
    g.add(wall);
  }

  // ── Emissive torches on scaena wall ───────────────────────────────────────
  const torchMat = new THREE.MeshStandardMaterial({
    color: 0xffcc44,
    emissive: new THREE.Color(0xff8800),
    emissiveIntensity: 1.8,
  });
  for (let tx = -(scaenaW * 0.4); tx <= scaenaW * 0.4; tx += scaenaW * 0.4) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.22 * scale, 6, 5), torchMat);
    flame.position.set(tx, scaenaH * 0.6, scaenaZ - scaenaThick * 0.5 - 0.3 * scale);
    flame.userData.noCollision = true;
    g.add(flame);
  }

  return g;
}

export function buildMalakaHouseReconstructed(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const mats = getMaterials();

  const width = 5 * scale;
  const depth = 5 * scale;
  const totalHeight = 5 * scale; // 2 floors

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(width, totalHeight, depth), mats.stucco);
  body.position.y = totalHeight / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isCollider = true;
  g.add(body);

  // Roof (Truncated Pyramid)
  const roofOverhang = 0.5 * scale;
  const roofBottomRadius = Math.sqrt(Math.pow((width + roofOverhang)/2, 2) * 2);
  const roofTopRadius = Math.sqrt(Math.pow(1.2 * scale, 2) * 2); // 2.4x2.4 flat top
  const roofHeight = 1.8 * scale;
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(roofTopRadius, roofBottomRadius, roofHeight, 4), mats.roof);
  roof.position.y = totalHeight + (roofHeight / 2);
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.receiveShadow = true;
  roof.userData.isCollider = true;
  g.add(roof);

  // Skylight (Lucernario Romboidal)
  const skylightHeight = 1.2 * scale;
  const skylight = new THREE.Mesh(new THREE.ConeGeometry(roofTopRadius, skylightHeight, 4), mats.glass);
  skylight.position.y = totalHeight + roofHeight + (skylightHeight / 2);
  skylight.rotation.y = Math.PI / 4;
  skylight.castShadow = true;
  skylight.userData.isCollider = true;
  g.add(skylight);

  // Add Skylight Frame (edges)
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.ConeGeometry(roofTopRadius, skylightHeight, 4)),
    new THREE.LineBasicMaterial({ color: 0x888888, linewidth: 2 })
  );
  edges.position.copy(skylight.position);
  edges.rotation.y = Math.PI / 4;
  g.add(edges);

  // Door
  const doorW = 1.2 * scale;
  const doorH = 2.0 * scale;
  const door = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.2 * scale), mats.wood);
  // Position door on the right side of the front face (Z = depth/2)
  door.position.set(1.0 * scale, doorH / 2, depth / 2);
  door.userData.noCollision = true;
  g.add(door);

  // Windows
  const winW = 0.6 * scale;
  const winH = 0.8 * scale;
  const winGeo = new THREE.BoxGeometry(winW, winH, 0.2 * scale);
  
  // Front face windows (Z = depth/2)
  const winFrontGnd = new THREE.Mesh(winGeo, mats.glass);
  winFrontGnd.position.set(-1.0 * scale, 1.2 * scale, depth / 2);
  winFrontGnd.userData.noCollision = true;
  g.add(winFrontGnd);

  const winFrontUp1 = new THREE.Mesh(winGeo, mats.glass);
  winFrontUp1.position.set(-1.0 * scale, 2.5 * scale + 1.2 * scale, depth / 2);
  winFrontUp1.userData.noCollision = true;
  g.add(winFrontUp1);

  const winFrontUp2 = new THREE.Mesh(winGeo, mats.glass);
  winFrontUp2.position.set(1.0 * scale, 2.5 * scale + 1.2 * scale, depth / 2);
  winFrontUp2.userData.noCollision = true;
  g.add(winFrontUp2);

  // Side face windows (X = width/2 & -width/2)
  for (let f = 0; f < 2; f++) {
    const y = f * 2.5 * scale + 1.2 * scale;
    
    const winSideR1 = new THREE.Mesh(winGeo, mats.glass);
    winSideR1.rotation.y = Math.PI / 2;
    winSideR1.position.set(width / 2, y, -1.0 * scale);
    winSideR1.userData.noCollision = true;
    g.add(winSideR1);

    const winSideR2 = new THREE.Mesh(winGeo, mats.glass);
    winSideR2.rotation.y = Math.PI / 2;
    winSideR2.position.set(width / 2, y, 1.0 * scale);
    winSideR2.userData.noCollision = true;
    g.add(winSideR2);

    const winSideL1 = new THREE.Mesh(winGeo, mats.glass);
    winSideL1.rotation.y = Math.PI / 2;
    winSideL1.position.set(-width / 2, y, -1.0 * scale);
    winSideL1.userData.noCollision = true;
    g.add(winSideL1);

    const winSideL2 = new THREE.Mesh(winGeo, mats.glass);
    winSideL2.rotation.y = Math.PI / 2;
    winSideL2.position.set(-width / 2, y, 1.0 * scale);
    winSideL2.userData.noCollision = true;
    g.add(winSideL2);
  }

  return g;
}
