import * as THREE from 'three';

export function buildMushroomCluster(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const capMat = new THREE.MeshStandardMaterial({
    color: 0x2255aa,
    emissive: new THREE.Color(0x0033cc),
    emissiveIntensity: 0.6,
    roughness: 0.7,
  });
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.85 });

  const count = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < count; i++) {
    const h = (0.6 + Math.random() * 1.2) * scale;
    const r = (0.4 + Math.random() * 0.6) * scale;
    const ox = (Math.random() - 0.5) * 3 * scale;
    const oz = (Math.random() - 0.5) * 3 * scale;

    const stemGeo = new THREE.CylinderGeometry(0.1 * scale, 0.15 * scale, h, 6);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(ox, h / 2, oz);
    stem.userData.isCollider = true;
    g.add(stem);

    const capGeo = new THREE.CylinderGeometry(r, r * 0.3, 0.4 * scale, 8);
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.set(ox, h + 0.2 * scale, oz);
    cap.userData.noCollision = true;
    g.add(cap);
  }

  return g;
}

export function buildAncientTree(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.95 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.85 });

  const trunkGeo = new THREE.CylinderGeometry(0.5 * scale, 0.8 * scale, 6 * scale, 8);
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 3 * scale;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  trunk.userData.isCollider = true;
  g.add(trunk);

  const layers = [
    { y: 7, r: 3.5, h: 3 },
    { y: 9, r: 2.5, h: 2.5 },
    { y: 11, r: 1.5, h: 2 },
  ];
  for (const l of layers) {
    const geo = new THREE.ConeGeometry(l.r * scale, l.h * scale, 8);
    const mesh = new THREE.Mesh(geo, canopyMat);
    mesh.position.y = l.y * scale;
    mesh.castShadow = true;
    mesh.userData.noCollision = true;
    g.add(mesh);
  }

  return g;
}

export function buildCrystalCluster(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x44ffcc,
    emissive: new THREE.Color(0x00ffaa),
    emissiveIntensity: 0.8,
    roughness: 0.1,
    metalness: 0.3,
  });

  const count = 3 + Math.floor(Math.random() * 5);
  for (let i = 0; i < count; i++) {
    const h = (0.8 + Math.random() * 2.5) * scale;
    const r = (0.15 + Math.random() * 0.2) * scale;
    const ox = (Math.random() - 0.5) * 2 * scale;
    const oz = (Math.random() - 0.5) * 2 * scale;

    const geo = new THREE.ConeGeometry(r, h, 5);
    const crystal = new THREE.Mesh(geo, crystalMat);
    crystal.position.set(ox, h / 2, oz);
    crystal.rotation.z = (Math.random() - 0.5) * 0.4;
    crystal.rotation.x = (Math.random() - 0.5) * 0.3;
    crystal.castShadow = true;
    crystal.userData.isCollider = true;
    g.add(crystal);
  }

  return g;
}
