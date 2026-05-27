import * as THREE from 'three';

export function buildMoonwell(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.7 });
  const basinGeo = new THREE.CylinderGeometry(2 * scale, 2.2 * scale, 0.5 * scale, 12);
  const basin = new THREE.Mesh(basinGeo, stoneMat);
  basin.position.y = 0.25 * scale;
  basin.castShadow = true;
  basin.receiveShadow = true;
  basin.userData.isCollider = true;
  g.add(basin);

  const waterGeo = new THREE.CylinderGeometry(1.7 * scale, 1.7 * scale, 0.1 * scale, 12);
  const waterMat = new THREE.MeshStandardMaterial({
    color: 0x2244aa,
    emissive: new THREE.Color(0x0033cc),
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.75,
    roughness: 0.2,
  });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.position.y = 0.5 * scale;
  water.userData.noCollision = true;
  g.add(water);

  const pillarGeo = new THREE.CylinderGeometry(0.15 * scale, 0.15 * scale, 3 * scale, 6);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const pillar = new THREE.Mesh(pillarGeo, stoneMat);
    pillar.position.set(Math.cos(angle) * 2.5 * scale, 1.5 * scale, Math.sin(angle) * 2.5 * scale);
    pillar.castShadow = true;
    pillar.userData.isCollider = true;
    g.add(pillar);
  }

  const orbGeo = new THREE.SphereGeometry(0.3 * scale, 8, 8);
  const orbMat = new THREE.MeshStandardMaterial({
    color: 0x88bbff,
    emissive: new THREE.Color(0x3366ff),
    emissiveIntensity: 1.2,
  });
  const orb = new THREE.Mesh(orbGeo, orbMat);
  orb.position.y = 3.5 * scale;
  orb.userData.noCollision = true;
  g.add(orb);

  return g;
}

export function buildTower(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.85 });
  const bodyGeo = new THREE.CylinderGeometry(1.2 * scale, 1.5 * scale, 8 * scale, 8);
  const body = new THREE.Mesh(bodyGeo, stoneMat);
  body.position.y = 4 * scale;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isCollider = true;
  g.add(body);

  const capGeo = new THREE.ConeGeometry(1.5 * scale, 2.5 * scale, 8);
  const capMat = new THREE.MeshStandardMaterial({ color: 0x2a0845, roughness: 0.7 });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.y = 9.25 * scale;
  cap.castShadow = true;
  cap.userData.noCollision = true;
  g.add(cap);

  const winGeo = new THREE.BoxGeometry(0.4 * scale, 0.6 * scale, 0.1 * scale);
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xffee88,
    emissive: new THREE.Color(0xffcc44),
    emissiveIntensity: 0.8,
  });
  const win = new THREE.Mesh(winGeo, winMat);
  win.position.set(0, 5 * scale, 1.21 * scale);
  win.userData.noCollision = true;
  g.add(win);

  return g;
}

export function buildRuins(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a7a88, roughness: 0.9 });

  const wallDefs = [
    { x: 0, z: 0, h: 1.8, rx: 0 },
    { x: 3, z: 1, h: 1.2, rx: 0.1 },
    { x: -2, z: 2, h: 2.2, rx: -0.05 },
    { x: 1, z: -3, h: 0.8, rx: 0.08 },
  ];
  for (const p of wallDefs) {
    const geo = new THREE.BoxGeometry(1.2 * scale, p.h * scale, 0.4 * scale);
    const mesh = new THREE.Mesh(geo, stoneMat);
    mesh.position.set(p.x * scale, (p.h / 2) * scale, p.z * scale);
    mesh.rotation.x = p.rx;
    mesh.rotation.y = Math.random() * 0.3;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isCollider = true;
    g.add(mesh);
  }

  for (let i = 0; i < 6; i++) {
    const size = (0.3 + Math.random() * 0.4) * scale;
    const geo = new THREE.BoxGeometry(size, size * 0.5, size);
    const mesh = new THREE.Mesh(geo, stoneMat);
    mesh.position.set(
      (Math.random() - 0.5) * 6 * scale,
      size * 0.25,
      (Math.random() - 0.5) * 6 * scale,
    );
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.castShadow = true;
    mesh.userData.noCollision = true;
    g.add(mesh);
  }

  return g;
}

export function buildAltar(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.8 });
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x8844ff,
    emissive: new THREE.Color(0x6633ff),
    emissiveIntensity: 0.9,
  });

  const baseGeo = new THREE.BoxGeometry(2.5 * scale, 0.4 * scale, 1.5 * scale);
  const base = new THREE.Mesh(baseGeo, stoneMat);
  base.position.y = 1.0 * scale;
  base.castShadow = true;
  base.receiveShadow = true;
  base.userData.isCollider = true;
  g.add(base);

  const legGeo = new THREE.BoxGeometry(0.3 * scale, 1.0 * scale, 0.3 * scale);
  for (const [lx, lz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]] as [number, number][]) {
    const leg = new THREE.Mesh(legGeo, stoneMat);
    leg.position.set(lx * scale, 0.5 * scale, lz * scale);
    leg.castShadow = true;
    leg.userData.isCollider = true;
    g.add(leg);
  }

  const runeGeo = new THREE.SphereGeometry(0.25 * scale, 8, 8);
  const rune = new THREE.Mesh(runeGeo, runeMat);
  rune.position.y = 1.5 * scale;
  rune.userData.noCollision = true;
  g.add(rune);

  return g;
}

export function buildRunicStone(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.88 });
  const runeMat = new THREE.MeshStandardMaterial({
    color: 0x88ffcc,
    emissive: new THREE.Color(0x00ffaa),
    emissiveIntensity: 0.7,
  });

  const geo = new THREE.BoxGeometry(0.8 * scale, 2.5 * scale, 0.35 * scale);
  const stone = new THREE.Mesh(geo, stoneMat);
  stone.position.y = 1.25 * scale;
  stone.rotation.y = (Math.random() - 0.5) * 0.3;
  stone.castShadow = true;
  stone.receiveShadow = true;
  stone.userData.isCollider = true;
  g.add(stone);

  const runeGeo = new THREE.BoxGeometry(0.5 * scale, 1.5 * scale, 0.05 * scale);
  const runeFace = new THREE.Mesh(runeGeo, runeMat);
  runeFace.position.set(0, 1.25 * scale, 0.18 * scale);
  runeFace.rotation.y = stone.rotation.y;
  runeFace.userData.noCollision = true;
  g.add(runeFace);

  return g;
}

export function buildWoodenFence(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });

  for (let i = 0; i < 3; i++) {
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 1.5 * scale, 5),
      woodMat,
    );
    post.position.set((i * 1.2 - 1.2) * scale, 0.75 * scale, 0);
    post.castShadow = true;
    post.userData.isCollider = true;
    g.add(post);
  }

  const rail1 = new THREE.Mesh(
    new THREE.BoxGeometry(3.6 * scale, 0.12 * scale, 0.1 * scale),
    woodMat,
  );
  rail1.position.y = 1.2 * scale;
  rail1.userData.isCollider = true;
  g.add(rail1);

  const rail2 = new THREE.Mesh(
    new THREE.BoxGeometry(3.6 * scale, 0.12 * scale, 0.1 * scale),
    woodMat,
  );
  rail2.position.y = 0.6 * scale;
  rail2.userData.isCollider = true;
  g.add(rail2);

  return g;
}

export function buildPavilion(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a0845, roughness: 0.7 });

  for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as [number, number][]) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 4 * scale, 8),
      woodMat,
    );
    pillar.position.set(px * scale, 2 * scale, pz * scale);
    pillar.castShadow = true;
    pillar.userData.isCollider = true;
    g.add(pillar);
  }

  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5 * scale, 2 * scale, 4), roofMat);
  roof.position.y = 5 * scale;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.userData.isCollider = true;
  g.add(roof);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(5 * scale, 0.1 * scale, 5 * scale), woodMat);
  floor.position.y = 0.05 * scale;
  floor.receiveShadow = true;
  floor.userData.isCollider = true;
  g.add(floor);

  return g;
}

export function buildPortalArch(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.75 });
  const portalMat = new THREE.MeshStandardMaterial({
    color: 0x8844ff,
    emissive: new THREE.Color(0x6622ff),
    emissiveIntensity: 1.2,
    transparent: true,
    opacity: 0.6,
  });

  for (const side of [-1, 1] as const) {
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25 * scale, 0.3 * scale, 5 * scale, 8),
      stoneMat,
    );
    pillar.position.set(side * 1.5 * scale, 2.5 * scale, 0);
    pillar.castShadow = true;
    pillar.userData.isCollider = true;
    g.add(pillar);

    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.6 * scale, 0.4 * scale, 0.6 * scale),
      stoneMat,
    );
    cap.position.set(side * 1.5 * scale, 5.2 * scale, 0);
    cap.userData.noCollision = true;
    g.add(cap);
  }

  const lintel = new THREE.Mesh(
    new THREE.BoxGeometry(3.4 * scale, 0.5 * scale, 0.4 * scale),
    stoneMat,
  );
  lintel.position.y = 5.5 * scale;
  lintel.userData.isCollider = true;
  g.add(lintel);

  const portalGeo = new THREE.PlaneGeometry(2.6 * scale, 4.8 * scale);
  const portal = new THREE.Mesh(portalGeo, portalMat);
  portal.position.y = 2.9 * scale;
  portal.userData.noCollision = true;
  g.add(portal);

  return g;
}

export function buildMalakaHouse(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xcc5533, roughness: 0.8 }); // Terracotta
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });

  // Main body
  const body = new THREE.Mesh(new THREE.BoxGeometry(4 * scale, 3 * scale, 4 * scale), wallMat);
  body.position.y = 1.5 * scale;
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.isCollider = true;
  g.add(body);

  // Roof
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2 * scale, 1.5 * scale, 4), roofMat);
  roof.position.y = 3.75 * scale;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  roof.userData.isCollider = true;
  g.add(roof);

  // Door
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, 1.5 * scale, 0.1 * scale), woodMat);
  door.position.set(0, 0.75 * scale, 2.01 * scale);
  door.userData.noCollision = true;
  g.add(door);

  return g;
}

export function buildMalakaChurch(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffee, roughness: 0.9 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xcc5533, roughness: 0.8 });

  // Main hall
  const hall = new THREE.Mesh(new THREE.BoxGeometry(6 * scale, 4 * scale, 8 * scale), wallMat);
  hall.position.y = 2 * scale;
  hall.castShadow = true;
  hall.receiveShadow = true;
  hall.userData.isCollider = true;
  g.add(hall);

  // Hall roof (Prism)
  const roofGeo = new THREE.CylinderGeometry(4.5 * scale, 4.5 * scale, 8 * scale, 3);
  const hallRoof = new THREE.Mesh(roofGeo, roofMat);
  hallRoof.rotation.z = Math.PI / 2;
  hallRoof.rotation.x = Math.PI / 2;
  hallRoof.position.y = 5.2 * scale;
  hallRoof.castShadow = true;
  hallRoof.userData.isCollider = true;
  g.add(hallRoof);

  // Bell Tower
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3 * scale, 8 * scale, 3 * scale), wallMat);
  tower.position.set(0, 4 * scale, 4 * scale);
  tower.castShadow = true;
  tower.receiveShadow = true;
  tower.userData.isCollider = true;
  g.add(tower);

  // Tower roof
  const towerRoof = new THREE.Mesh(new THREE.ConeGeometry(2.5 * scale, 2 * scale, 4), roofMat);
  towerRoof.position.set(0, 9 * scale, 4 * scale);
  towerRoof.rotation.y = Math.PI / 4;
  towerRoof.castShadow = true;
  towerRoof.userData.isCollider = true;
  g.add(towerRoof);

  return g;
}

export function buildMalakaCastle(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xd8c8b8, roughness: 1.0 }); // Warm sandstone

  // Central Keep
  const keep = new THREE.Mesh(new THREE.BoxGeometry(8 * scale, 6 * scale, 8 * scale), stoneMat);
  keep.position.y = 3 * scale;
  keep.castShadow = true;
  keep.receiveShadow = true;
  keep.userData.isCollider = true;
  g.add(keep);

  // Corner towers
  const towerGeo = new THREE.CylinderGeometry(1.5 * scale, 1.5 * scale, 8 * scale, 8);
  for (const [x, z] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    const tower = new THREE.Mesh(towerGeo, stoneMat);
    tower.position.set(x * scale, 4 * scale, z * scale);
    tower.castShadow = true;
    tower.receiveShadow = true;
    tower.userData.isCollider = true;
    g.add(tower);
  }

  // Crenellations
  const crenMat = stoneMat;
  for (let i = -3; i <= 3; i += 1.5) {
    for (const [x, z] of [[i, -4, true], [i, 4, true], [-4, i, false], [4, i, false]] as [number, number, boolean][]) {
      const cren = new THREE.Mesh(new THREE.BoxGeometry(0.8 * scale, 1 * scale, 0.8 * scale), crenMat);
      cren.position.set(x * scale, 6.5 * scale, z * scale);
      cren.castShadow = true;
      cren.userData.isCollider = true;
      g.add(cren);
    }
  }

  return g;
}

export function buildRomanAmphitheatre(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.9 });

  // Create tiered semi-circular steps
  const tiers = 5;
  for (let i = 1; i <= tiers; i++) {
    const radius = i * 2 * scale;
    const height = i * 0.8 * scale;
    
    const geo = new THREE.CylinderGeometry(radius, radius, 0.8 * scale, 16, 1, false, 0, Math.PI);
    const mesh = new THREE.Mesh(geo, stoneMat);
    mesh.position.y = height - (0.4 * scale);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.isCollider = true;
    g.add(mesh);
  }

  // Stage area
  const stage = new THREE.Mesh(new THREE.BoxGeometry(8 * scale, 0.2 * scale, 4 * scale), stoneMat);
  stage.position.set(0, 0.1 * scale, -2 * scale);
  stage.receiveShadow = true;
  stage.userData.isCollider = true;
  g.add(stage);

  return g;
}

export function buildRoad(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x999988, roughness: 1.0 });

  // A flat plane for the road. We raise it slightly (0.05) to avoid z-fighting with terrain.
  const roadGeo = new THREE.BoxGeometry(4 * scale, 0.1 * scale, 8 * scale);
  const road = new THREE.Mesh(roadGeo, stoneMat);
  road.position.y = 0.05 * scale;
  road.receiveShadow = true;
  road.userData.noCollision = true; // Roads shouldn't block walking
  g.add(road);

  return g;
}
