import * as THREE from 'three';

/**
 * Dispatches to the appropriate race model builder.
 */
export function buildRaceModel(race: string): THREE.Group {
  switch (race) {
    case 'human':
      return buildHumanModel();
    case 'orc':
      return buildOrcModel();
    case 'undead':
      return buildUndeadModel();
    case 'night_elf':
    default:
      return buildNightElfModel();
  }
}

// ── Human ────────────────────────────────────────────────────────────────────

export function buildHumanModel(): THREE.Group {
  const group = new THREE.Group();

  const skinColor = 0xc4a882;
  const armorColor = 0x8B7355;
  const legColor = 0x6b5b45;
  const hairColor = 0x5c3a1e;
  const capeColor = 0x2244aa;

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.55, 1.3, 0.35);
  const bodyMat = new THREE.MeshStandardMaterial({ color: armorColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'body';
  body.position.y = 1.45;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.22, 12, 10);
  const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.name = 'head';
  head.position.y = 2.3;
  head.castShadow = true;
  group.add(head);

  // Hair (short box)
  const hairGeo = new THREE.BoxGeometry(0.3, 0.15, 0.3);
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 2.55;
  group.add(hair);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.16, 0.65, 0.16);
  const legMat = new THREE.MeshStandardMaterial({ color: legColor });

  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(-0.14, 0.45, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(0.14, 0.45, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.13, 0.65, 0.13);
  const armMat = new THREE.MeshStandardMaterial({ color: skinColor });

  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.name = 'leftArm';
  leftArm.position.set(-0.38, 1.65, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.name = 'rightArm';
  rightArm.position.set(0.38, 1.65, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  // Cape (blue)
  const cloakGeo = new THREE.PlaneGeometry(0.55, 1.2, 1, 4);
  const cloakMat = new THREE.MeshStandardMaterial({
    color: capeColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  cloak.name = 'cloak';
  cloak.position.set(0, 1.4, -0.2);
  cloak.castShadow = true;
  group.add(cloak);

  return group;
}

// ── Night Elf ────────────────────────────────────────────────────────────────

export function buildNightElfModel(): THREE.Group {
  const group = new THREE.Group();

  const skinColor = 0xd4b8a0;
  const bodyColor = 0x332255;
  const legColor = 0x221144;
  const hairColor = 0xccccdd;
  const cloakColor = 0x2a1845;

  // Body
  const bodyGeo = new THREE.BoxGeometry(0.5, 1.4, 0.32);
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'body';
  body.position.y = 1.5;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.22, 12, 10);
  const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.name = 'head';
  head.position.y = 2.42;
  head.castShadow = true;
  group.add(head);

  // Pointed ears
  const earGeo = new THREE.ConeGeometry(0.06, 0.28, 6);
  const earMat = new THREE.MeshStandardMaterial({ color: skinColor });

  const leftEar = new THREE.Mesh(earGeo, earMat);
  leftEar.position.set(-0.24, 2.48, 0);
  leftEar.rotation.z = Math.PI / 3;
  group.add(leftEar);

  const rightEar = new THREE.Mesh(earGeo, earMat);
  rightEar.position.set(0.24, 2.48, 0);
  rightEar.rotation.z = -Math.PI / 3;
  group.add(rightEar);

  // Hair (elongated cone)
  const hairGeo = new THREE.ConeGeometry(0.18, 0.5, 8);
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 2.78;
  group.add(hair);

  // Legs
  const legGeo = new THREE.BoxGeometry(0.14, 0.7, 0.14);
  const legMat = new THREE.MeshStandardMaterial({ color: legColor });

  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(-0.13, 0.45, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(0.13, 0.45, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Cloak
  const cloakGeo = new THREE.PlaneGeometry(0.55, 1.3, 1, 4);
  const cloakMat = new THREE.MeshStandardMaterial({
    color: cloakColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.85,
  });
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  cloak.name = 'cloak';
  cloak.position.set(0, 1.45, -0.2);
  cloak.castShadow = true;
  group.add(cloak);

  // Arms
  const armGeo = new THREE.BoxGeometry(0.12, 0.7, 0.12);
  const armMat = new THREE.MeshStandardMaterial({ color: skinColor });

  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.name = 'leftArm';
  leftArm.position.set(-0.35, 1.75, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.name = 'rightArm';
  rightArm.position.set(0.35, 1.75, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  return group;
}

// ── Orc ──────────────────────────────────────────────────────────────────────

export function buildOrcModel(): THREE.Group {
  const group = new THREE.Group();

  const skinColor = 0x2d5a1e;
  const legColor = 0x1e4015;
  const hairColor = 0x111111;
  const loinclothColor = 0xaa2222;

  // Body (wider / bulkier)
  const bodyGeo = new THREE.BoxGeometry(0.6, 1.3, 0.4);
  const bodyMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'body';
  body.position.y = 1.45;
  body.castShadow = true;
  group.add(body);

  // Head (larger)
  const headGeo = new THREE.SphereGeometry(0.25, 12, 10);
  const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.name = 'head';
  head.position.y = 2.32;
  head.castShadow = true;
  group.add(head);

  // Jaw (large box under head)
  const jawGeo = new THREE.BoxGeometry(0.22, 0.1, 0.18);
  const jawMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const jaw = new THREE.Mesh(jawGeo, jawMat);
  jaw.position.set(0, 2.1, 0.08);
  group.add(jaw);

  // Top-knot hair
  const hairGeo = new THREE.ConeGeometry(0.08, 0.35, 6);
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor });
  const hair = new THREE.Mesh(hairGeo, hairMat);
  hair.position.y = 2.68;
  group.add(hair);

  // Spiked pauldrons (cones on shoulders)
  const pauldronGeo = new THREE.ConeGeometry(0.12, 0.3, 8);
  const pauldronMat = new THREE.MeshStandardMaterial({ color: 0x444444 });

  const leftPauldron = new THREE.Mesh(pauldronGeo, pauldronMat);
  leftPauldron.position.set(-0.42, 1.95, 0);
  leftPauldron.castShadow = true;
  group.add(leftPauldron);

  const rightPauldron = new THREE.Mesh(pauldronGeo, pauldronMat);
  rightPauldron.position.set(0.42, 1.95, 0);
  rightPauldron.castShadow = true;
  group.add(rightPauldron);

  // Legs (thicker)
  const legGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
  const legMat = new THREE.MeshStandardMaterial({ color: legColor });

  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(-0.16, 0.45, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(0.16, 0.45, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Arms (thicker)
  const armGeo = new THREE.BoxGeometry(0.15, 0.7, 0.15);
  const armMat = new THREE.MeshStandardMaterial({ color: skinColor });

  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.name = 'leftArm';
  leftArm.position.set(-0.42, 1.65, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.name = 'rightArm';
  rightArm.position.set(0.42, 1.65, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  // Loincloth (red plane in front)
  const cloakGeo = new THREE.PlaneGeometry(0.4, 0.5, 1, 2);
  const cloakMat = new THREE.MeshStandardMaterial({
    color: loinclothColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.9,
  });
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  cloak.name = 'cloak';
  cloak.position.set(0, 0.7, 0.15);
  group.add(cloak);

  return group;
}

// ── Undead ────────────────────────────────────────────────────────────────────

export function buildUndeadModel(): THREE.Group {
  const group = new THREE.Group();

  const skinColor = 0x7a8a7a;
  const bodyColor = 0x5a6a5a;
  const legColor = 0x4a5a4a;
  const cloakColor = 0x333333;

  // Body (gaunt / thin)
  const bodyGeo = new THREE.BoxGeometry(0.4, 1.3, 0.25);
  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'body';
  body.position.y = 1.45;
  body.castShadow = true;
  group.add(body);

  // Head
  const headGeo = new THREE.SphereGeometry(0.2, 12, 10);
  const headMat = new THREE.MeshStandardMaterial({ color: skinColor });
  const head = new THREE.Mesh(headGeo, headMat);
  head.name = 'head';
  head.position.y = 2.3;
  head.castShadow = true;
  group.add(head);

  // Glowing eyes (emissive spheres)
  const eyeGeo = new THREE.SphereGeometry(0.04, 8, 6);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: 0x44ffaa,
    emissive: 0x44ffaa,
    emissiveIntensity: 2.0,
  });

  const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
  leftEye.position.set(-0.07, 2.34, 0.17);
  group.add(leftEye);

  const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
  rightEye.position.set(0.07, 2.34, 0.17);
  group.add(rightEye);

  // Legs (thin)
  const legGeo = new THREE.BoxGeometry(0.11, 0.65, 0.11);
  const legMat = new THREE.MeshStandardMaterial({ color: legColor });

  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(-0.1, 0.45, 0);
  leftLeg.castShadow = true;
  group.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(0.1, 0.45, 0);
  rightLeg.castShadow = true;
  group.add(rightLeg);

  // Arms (thin)
  const armGeo = new THREE.BoxGeometry(0.1, 0.65, 0.1);
  const armMat = new THREE.MeshStandardMaterial({ color: skinColor });

  const leftArm = new THREE.Mesh(armGeo, armMat);
  leftArm.name = 'leftArm';
  leftArm.position.set(-0.28, 1.65, 0);
  leftArm.castShadow = true;
  group.add(leftArm);

  const rightArm = new THREE.Mesh(armGeo, armMat);
  rightArm.name = 'rightArm';
  rightArm.position.set(0.28, 1.65, 0);
  rightArm.castShadow = true;
  group.add(rightArm);

  // Tattered cloak (dark gray)
  const cloakGeo = new THREE.PlaneGeometry(0.45, 1.1, 1, 4);
  const cloakMat = new THREE.MeshStandardMaterial({
    color: cloakColor,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7,
  });
  const cloak = new THREE.Mesh(cloakGeo, cloakMat);
  cloak.name = 'cloak';
  cloak.position.set(0, 1.35, -0.18);
  cloak.castShadow = true;
  group.add(cloak);

  return group;
}
