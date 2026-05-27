import * as THREE from 'three';

export function buildCampfire(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const geo = new THREE.SphereGeometry(0.25 * scale, 5, 4);
    const mesh = new THREE.Mesh(geo, stoneMat);
    mesh.position.set(Math.cos(angle) * 0.6 * scale, 0.2 * scale, Math.sin(angle) * 0.6 * scale);
    mesh.userData.noCollision = true;
    g.add(mesh);
  }

  const logMat = new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2;
    const geo = new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 1.2 * scale, 5);
    const log = new THREE.Mesh(geo, logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = angle;
    log.position.y = 0.1 * scale;
    log.userData.noCollision = true;
    g.add(log);
  }

  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: new THREE.Color(0xff2200),
    emissiveIntensity: 1.5,
  });
  for (let i = 0; i < 3; i++) {
    const size = (0.1 + Math.random() * 0.1) * scale;
    const geo = new THREE.SphereGeometry(size, 5, 4);
    const orb = new THREE.Mesh(geo, fireMat);
    orb.position.set(
      (Math.random() - 0.5) * 0.3 * scale,
      (0.4 + Math.random() * 0.4) * scale,
      (Math.random() - 0.5) * 0.3 * scale,
    );
    orb.userData.noCollision = true;
    g.add(orb);
  }

  return g;
}

export function buildBonfire(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.9 });
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    emissive: new THREE.Color(0xff3300),
    emissiveIntensity: 2.0,
  });

  for (let i = 0; i < 2; i++) {
    const logGeo = new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 2.5 * scale, 6);
    const log = new THREE.Mesh(logGeo, logMat);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = i * (Math.PI / 2);
    log.castShadow = true;
    log.userData.isCollider = true;
    g.add(log);
  }

  const flameGeo = new THREE.ConeGeometry(0.6 * scale, 2.0 * scale, 6);
  const flame = new THREE.Mesh(flameGeo, fireMat);
  flame.position.y = 1.5 * scale;
  flame.userData.noCollision = true;
  g.add(flame);

  return g;
}

export function buildLantern(pos: THREE.Vector3, scale: number): THREE.Group {
  const g = new THREE.Group();
  g.position.copy(pos);

  const metalMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.4, metalness: 0.7 });
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffee88,
    emissive: new THREE.Color(0xffcc44),
    emissiveIntensity: 1.0,
  });

  const postGeo = new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 3 * scale, 6);
  const post = new THREE.Mesh(postGeo, metalMat);
  post.position.y = 1.5 * scale;
  post.castShadow = true;
  post.userData.isCollider = true;
  g.add(post);

  const houseGeo = new THREE.BoxGeometry(0.4 * scale, 0.5 * scale, 0.4 * scale);
  const house = new THREE.Mesh(houseGeo, metalMat);
  house.position.y = 3.25 * scale;
  house.userData.noCollision = true;
  g.add(house);

  const coreGeo = new THREE.SphereGeometry(0.15 * scale, 6, 6);
  const core = new THREE.Mesh(coreGeo, lightMat);
  core.position.y = 3.25 * scale;
  core.userData.noCollision = true;
  g.add(core);

  return g;
}
