import * as THREE from 'three';
import { addOutlineShell } from './ModelStyling';

export function buildRaceModel(race: string): THREE.Group {
  switch (race) {
    case 'human':   return buildHumanModel();
    case 'orc':     return buildOrcModel();
    case 'undead':  return buildUndeadModel();
    case 'night_elf':
    default:        return buildNightElfModel();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared proportions  (all races use the same grid so positioning is exact)
// ─────────────────────────────────────────────────────────────────────────────
//  Leg:   height 0.82  →  center y = 0.44   (bottom 0.03, top 0.85)
//  Torso: height 0.88  →  center y = 1.29   (bottom 0.85, top 1.73)
//  Head:  height 0.52  →  center y = 1.99   (bottom 1.73, top 2.25)
//  Arm:   height 0.66  →  center y = 1.40   (shoulder at torso top)
//  Arm X: ±(torso_half_w + arm_r + 0.02)
// ─────────────────────────────────────────────────────────────────────────────

const Y_LEG   = 0.44;
const Y_TORSO = 1.29;
const Y_ARM   = 1.40;
const Y_HEAD  = 1.99;

// ── Night Elf ────────────────────────────────────────────────────────────────

export function buildNightElfModel(): THREE.Group {
  const group = new THREE.Group();

  const TORSO_W = 0.62;
  const ARM_R   = 0.115;
  const LEG_R   = 0.135;
  const ARM_X   = TORSO_W / 2 + ARM_R + 0.02;  // 0.445

  // ── Torso ──
  const torso = mesh(box(TORSO_W, 0.88, 0.36), mat(0x3a1d60));
  torso.name = 'body';
  torso.position.y = Y_TORSO;
  torso.castShadow = true;
  group.add(torso);

  // Chest ornament (emissive gem)
  const gem = mesh(sph(0.048, 8), mat(0xcc88ff, { em: 0x9944ff, ei: 1.6, r: 0.2, m: 0.5 }));
  gem.name = 'gem';
  gem.position.set(0, Y_TORSO + 0.1, 0.2);
  group.add(gem);

  // Belt line
  const belt = mesh(new THREE.TorusGeometry(0.22, 0.028, 5, 14), mat(0xc0c8e8, { r: 0.3, m: 0.7 }));
  belt.name = 'belt';
  belt.position.set(0, Y_TORSO - 0.28, 0);
  belt.rotation.x = Math.PI / 2;
  group.add(belt);

  // ── Head ──
  const headMesh = mesh(box(0.52, 0.52, 0.48), mat(0xddc5a8));
  headMesh.name = 'head';
  headMesh.position.y = Y_HEAD;
  headMesh.castShadow = true;
  group.add(headMesh);

  // Ears (children of head — animate with head nod)
  const earMat = mat(0xddc5a8);
  const earGeo = new THREE.ConeGeometry(0.05, 0.32, 5);
  const lEar = mesh(earGeo, earMat);
  lEar.name = 'leftEar';
  lEar.position.set(-0.3, 0.08, -0.04);
  lEar.rotation.z = 1.05;
  lEar.rotation.x = -0.12;
  headMesh.add(lEar);
  const rEar = lEar.clone();
  rEar.name = 'rightEar';
  rEar.position.x = 0.3;
  rEar.rotation.z = -1.05;
  headMesh.add(rEar);

  // Glowing silver-blue eyes (children of head)
  const eyeMat = mat(0xaabbff, { em: 0x7799ff, ei: 2.2, r: 0.05 });
  const eyeGeo = new THREE.SphereGeometry(0.052, 8, 6);
  const lEye = mesh(eyeGeo, eyeMat);
  lEye.name = 'leftEye';
  lEye.position.set(-0.12, 0.05, 0.26);
  headMesh.add(lEye);
  const rEye = lEye.clone();
  rEye.name = 'rightEye';
  rEye.position.x = 0.12;
  headMesh.add(rEye);

  // ── Hair ──
  const hairMat = mat(0xeeeaff, { r: 0.88 });
  const crown = mesh(new THREE.ConeGeometry(0.2, 0.38, 8), hairMat);
  crown.name = 'hair';
  crown.position.y = 2.44;
  group.add(crown);

  // ── Pauldrons ──
  const pauldronGeo = new THREE.SphereGeometry(0.11, 8, 5);
  const pauldronMat = mat(0x7755cc, { r: 0.35, m: 0.4 });
  const lPaul = mesh(pauldronGeo, pauldronMat);
  lPaul.name = 'leftPauldron';
  lPaul.position.set(-ARM_X + 0.02, Y_TORSO + 0.38, 0);
  lPaul.scale.set(1, 0.55, 0.85);
  group.add(lPaul);
  const rPaul = lPaul.clone();
  rPaul.name = 'rightPauldron';
  rPaul.position.x = ARM_X - 0.02;
  group.add(rPaul);

  // ── Arms ──
  const armGeo = new THREE.CylinderGeometry(ARM_R, ARM_R, 0.66, 12);
  const armMat = mat(0xddc5a8, { r: 0.82 });
  const handGeo = new THREE.SphereGeometry(0.065, 8, 6);

  const lArm = mesh(armGeo, armMat);
  lArm.name = 'leftArm';
  lArm.position.set(-ARM_X, Y_ARM, 0);
  lArm.castShadow = true;
  group.add(lArm);
  addChildMesh(lArm, handGeo, armMat, 0, -0.38, 0);

  const rArm = mesh(armGeo, armMat);
  rArm.name = 'rightArm';
  rArm.position.set(ARM_X, Y_ARM, 0);
  rArm.castShadow = true;
  group.add(rArm);
  addChildMesh(rArm, handGeo, armMat, 0, -0.38, 0);

  // ── Legs ──
  const legGeo = new THREE.CylinderGeometry(LEG_R, LEG_R, 0.82, 12);
  const legMat = mat(0x25124a, { r: 0.65 });
  const bootGeo = new THREE.CylinderGeometry(LEG_R + 0.01, LEG_R + 0.02, 0.22, 12);
  const bootMat = mat(0x120820, { r: 0.75 });
  const toeGeo  = new THREE.SphereGeometry(LEG_R + 0.015, 8, 5);
  const legHalfHeight = 0.41;
  const hipY = Y_LEG + legHalfHeight;

  const lLegPivot = new THREE.Group();
  lLegPivot.name = 'leftLeg';
  lLegPivot.position.set(-0.16, hipY, 0);
  group.add(lLegPivot);
  const lLeg = mesh(legGeo, legMat);
  lLeg.position.set(0, -legHalfHeight, 0);
  lLeg.castShadow = true;
  lLegPivot.add(lLeg);
  const lBoot = addChildMesh(lLeg, bootGeo, bootMat, 0, -0.38, 0);
  addChildMesh(lBoot, toeGeo, bootMat, 0, -0.09, 0.04);

  const rLegPivot = new THREE.Group();
  rLegPivot.name = 'rightLeg';
  rLegPivot.position.set(0.16, hipY, 0);
  group.add(rLegPivot);
  const rLeg = mesh(legGeo, legMat);
  rLeg.position.set(0, -legHalfHeight, 0);
  rLeg.castShadow = true;
  rLegPivot.add(rLeg);
  const rBoot = addChildMesh(rLeg, bootGeo, bootMat, 0, -0.38, 0);
  addChildMesh(rBoot, toeGeo, bootMat, 0, -0.09, 0.04);

  // ── Cloak ──
  const cloak = mesh(
    new THREE.PlaneGeometry(0.58, 0.95, 2, 6),
    mat(0x1e0f3a, { side: THREE.DoubleSide, t: true, o: 0.9 }),
  );
  cloak.name = 'cloak';
  cloak.position.set(0, Y_TORSO, -0.20);
  cloak.castShadow = true;
  group.add(cloak);

  addOutlineShell(group, {
    includeNames: ['body', 'head', 'hair', 'cloak', 'leftLeg', 'rightLeg',
      'leftArm', 'rightArm', 'leftPauldron', 'rightPauldron'],
    scale: 1.05,
  });

  return group;
}

// ── Human ────────────────────────────────────────────────────────────────────

export function buildHumanModel(): THREE.Group {
  const group = new THREE.Group();

  const TORSO_W = 0.66;
  const ARM_R   = 0.12;
  const LEG_R   = 0.14;
  const ARM_X   = TORSO_W / 2 + ARM_R + 0.02;

  // Torso
  const torso = mesh(box(TORSO_W, 0.88, 0.38), mat(0x7a6042, { r: 0.7, m: 0.1 }));
  torso.name = 'body';
  torso.position.y = Y_TORSO;
  torso.castShadow = true;
  group.add(torso);

  // Chest plate
  const plate = mesh(box(0.28, 0.3, 0.06), mat(0x9a8262, { r: 0.4, m: 0.3 }));
  plate.name = 'chestPlate';
  plate.position.set(0, Y_TORSO + 0.08, 0.22);
  group.add(plate);

  // Belt
  const belt = mesh(new THREE.TorusGeometry(0.23, 0.03, 5, 14), mat(0x3f2a20, { r: 0.85 }));
  belt.name = 'belt';
  belt.position.set(0, Y_TORSO - 0.28, 0);
  belt.rotation.x = Math.PI / 2;
  group.add(belt);

  // Belt buckle
  const buckle = mesh(box(0.08, 0.08, 0.04), mat(0xb8bcd0, { r: 0.3, m: 0.7 }));
  buckle.position.set(0, Y_TORSO - 0.28, 0.24);
  group.add(buckle);

  // Head
  const headMesh = mesh(box(0.54, 0.52, 0.5), mat(0xd4a87a));
  headMesh.name = 'head';
  headMesh.position.y = Y_HEAD;
  headMesh.castShadow = true;
  group.add(headMesh);

  // Hair (layered box on top of head)
  const hairMat = mat(0x4a2c10, { r: 0.9 });
  const hairTop = mesh(box(0.54, 0.18, 0.5), hairMat);
  hairTop.name = 'hair';
  hairTop.position.set(0, 0.35, 0);
  headMesh.add(hairTop);
  // Side/back drape
  const hairBack = mesh(box(0.5, 0.22, 0.08), hairMat);
  hairBack.position.set(0, 0.22, -0.29);
  headMesh.add(hairBack);

  // Eyes (brown, non-emissive — human)
  const eyeMat = mat(0x4a3010, { r: 0.4 });
  const eyeGeo = new THREE.SphereGeometry(0.044, 8, 6);
  const lEye = mesh(eyeGeo, eyeMat);
  lEye.name = 'leftEye';
  lEye.position.set(-0.13, 0.06, 0.27);
  headMesh.add(lEye);
  const rEye = lEye.clone();
  rEye.name = 'rightEye';
  rEye.position.x = 0.13;
  headMesh.add(rEye);

  // Pauldrons
  const pauldronMat = mat(0x7b5f98, { r: 0.4, m: 0.35 });
  const pauldronGeo = new THREE.SphereGeometry(0.12, 8, 5);
  const lPaul = mesh(pauldronGeo, pauldronMat);
  lPaul.name = 'leftPauldron';
  lPaul.position.set(-ARM_X + 0.02, Y_TORSO + 0.38, 0);
  lPaul.scale.set(1, 0.58, 0.85);
  group.add(lPaul);
  const rPaul = lPaul.clone();
  rPaul.name = 'rightPauldron';
  rPaul.position.x = ARM_X - 0.02;
  group.add(rPaul);

  // Arms
  const armGeo = new THREE.CylinderGeometry(ARM_R, ARM_R, 0.66, 12);
  const armMat = mat(0x7a6042, { r: 0.7 });
  const gloveGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const gloveMat = mat(0x3f2a20, { r: 0.88 });

  const lArm = mesh(armGeo, armMat);
  lArm.name = 'leftArm';
  lArm.position.set(-ARM_X, Y_ARM, 0);
  lArm.castShadow = true;
  group.add(lArm);
  addChildMesh(lArm, gloveGeo, gloveMat, 0, -0.38, 0);

  const rArm = mesh(armGeo, armMat);
  rArm.name = 'rightArm';
  rArm.position.set(ARM_X, Y_ARM, 0);
  rArm.castShadow = true;
  group.add(rArm);
  addChildMesh(rArm, gloveGeo, gloveMat, 0, -0.38, 0);

  // Legs
  const legGeo = new THREE.CylinderGeometry(LEG_R, LEG_R, 0.82, 12);
  const legMat = mat(0x5a3f22, { r: 0.72 });
  const bootGeo = new THREE.CylinderGeometry(LEG_R + 0.01, LEG_R + 0.02, 0.24, 12);
  const bootMat = mat(0x3a2010, { r: 0.82 });
  const toeGeo  = new THREE.SphereGeometry(LEG_R + 0.015, 8, 5);
  const legHalfHeight = 0.41;
  const hipY = Y_LEG + legHalfHeight;

  const lLegPivot = new THREE.Group();
  lLegPivot.name = 'leftLeg';
  lLegPivot.position.set(-0.16, hipY, 0);
  group.add(lLegPivot);
  const lLeg = mesh(legGeo, legMat);
  lLeg.position.set(0, -legHalfHeight, 0);
  lLeg.castShadow = true;
  lLegPivot.add(lLeg);
  const lBoot = addChildMesh(lLeg, bootGeo, bootMat, 0, -0.38, 0);
  addChildMesh(lBoot, toeGeo, bootMat, 0, -0.1, 0.045);

  const rLegPivot = new THREE.Group();
  rLegPivot.name = 'rightLeg';
  rLegPivot.position.set(0.16, hipY, 0);
  group.add(rLegPivot);
  const rLeg = mesh(legGeo, legMat);
  rLeg.position.set(0, -legHalfHeight, 0);
  rLeg.castShadow = true;
  rLegPivot.add(rLeg);
  const rBoot = addChildMesh(rLeg, bootGeo, bootMat, 0, -0.38, 0);
  addChildMesh(rBoot, toeGeo, bootMat, 0, -0.1, 0.045);

  // Cape (blue)
  const cloak = mesh(
    new THREE.PlaneGeometry(0.58, 0.95, 2, 6),
    mat(0x2255cc, { side: THREE.DoubleSide, t: true, o: 0.88 }),
  );
  cloak.name = 'cloak';
  cloak.position.set(0, Y_TORSO, -0.21);
  group.add(cloak);

  addOutlineShell(group, {
    includeNames: ['body', 'head', 'cloak', 'leftLeg', 'rightLeg',
      'leftArm', 'rightArm', 'leftPauldron', 'rightPauldron', 'chestPlate'],
    scale: 1.05,
  });

  return group;
}

// ── Orc ──────────────────────────────────────────────────────────────────────

export function buildOrcModel(): THREE.Group {
  const group = new THREE.Group();

  const TORSO_W = 0.80;  // notably wider
  const ARM_R   = 0.155;
  const LEG_R   = 0.17;
  const ARM_X   = TORSO_W / 2 + ARM_R + 0.02;

  // Torso (wider, bulkier)
  const torso = mesh(box(TORSO_W, 0.88, 0.46), mat(0x3a6e22, { r: 0.68 }));
  torso.name = 'body';
  torso.position.y = Y_TORSO;
  torso.castShadow = true;
  group.add(torso);

  // Loincloth
  const loin = mesh(
    new THREE.PlaneGeometry(0.44, 0.5, 1, 3),
    mat(0xcc2222, { side: THREE.DoubleSide, t: true, o: 0.92 }),
  );
  loin.name = 'cloak';
  loin.position.set(0, Y_TORSO - 0.32, 0.25);
  group.add(loin);

  // Head (wider, slightly shorter — orcish)
  const headMesh = mesh(box(0.62, 0.52, 0.54), mat(0x3a6e22));
  headMesh.name = 'head';
  headMesh.position.y = Y_HEAD;
  headMesh.castShadow = true;
  group.add(headMesh);

  // Jaw protrusion
  const jaw = mesh(box(0.48, 0.14, 0.22), mat(0x2d5a1e));
  jaw.name = 'jaw';
  jaw.position.set(0, -0.24, 0.18);
  headMesh.add(jaw);

  // Tusks
  const tuskMat = mat(0xe8d2b0, { r: 0.5 });
  const tuskGeo = new THREE.ConeGeometry(0.03, 0.17, 5);
  const lTusk = mesh(tuskGeo, tuskMat);
  lTusk.position.set(-0.12, -0.3, 0.22);
  lTusk.rotation.z = 0.85;
  lTusk.rotation.x = -0.2;
  headMesh.add(lTusk);
  const rTusk = lTusk.clone();
  rTusk.position.x = 0.12;
  rTusk.rotation.z = -0.85;
  headMesh.add(rTusk);

  // Feral yellow-orange eyes
  const eyeMat = mat(0xffcc22, { em: 0xdd9900, ei: 1.8, r: 0.1 });
  const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
  const lEye = mesh(eyeGeo, eyeMat);
  lEye.name = 'leftEye';
  lEye.position.set(-0.14, 0.09, 0.29);
  headMesh.add(lEye);
  const rEye = lEye.clone();
  rEye.name = 'rightEye';
  rEye.position.x = 0.14;
  headMesh.add(rEye);

  // Top-knot
  const topknot = mesh(new THREE.ConeGeometry(0.09, 0.36, 6), mat(0x111111, { r: 0.95 }));
  topknot.name = 'hair';
  topknot.position.set(0, 0.44, 0);
  headMesh.add(topknot);

  // Spiked iron pauldrons
  const pauldronMat = mat(0x383838, { r: 0.4, m: 0.55 });
  const pauldronGeo = new THREE.SphereGeometry(0.16, 8, 5);
  const lPaul = mesh(pauldronGeo, pauldronMat);
  lPaul.name = 'leftPauldron';
  lPaul.position.set(-ARM_X + 0.04, Y_TORSO + 0.38, 0);
  lPaul.scale.set(1, 0.58, 0.85);
  group.add(lPaul);
  const lSpike = mesh(new THREE.ConeGeometry(0.04, 0.24, 6), pauldronMat);
  lSpike.position.set(-ARM_X + 0.04, Y_TORSO + 0.65, 0);
  group.add(lSpike);
  const rPaul = lPaul.clone();
  rPaul.name = 'rightPauldron';
  rPaul.position.x = ARM_X - 0.04;
  group.add(rPaul);
  const rSpike = lSpike.clone();
  rSpike.position.x = ARM_X - 0.04;
  group.add(rSpike);

  // Arms (thick)
  const armGeo = new THREE.CylinderGeometry(ARM_R, ARM_R, 0.66, 12);
  const armMat = mat(0x3a6e22, { r: 0.72 });
  const ironBracerGeo = new THREE.CylinderGeometry(ARM_R + 0.01, ARM_R + 0.015, 0.18, 12);
  const ironMat = mat(0x383838, { r: 0.4, m: 0.55 });
  const fistGeo = new THREE.SphereGeometry(ARM_R + 0.01, 8, 6);

  const lArm = mesh(armGeo, armMat);
  lArm.name = 'leftArm';
  lArm.position.set(-ARM_X, Y_ARM, 0);
  lArm.castShadow = true;
  group.add(lArm);
  addChildMesh(lArm, ironBracerGeo, ironMat, 0, -0.22, 0);
  addChildMesh(lArm, fistGeo, armMat, 0, -0.39, 0);

  const rArm = mesh(armGeo, armMat);
  rArm.name = 'rightArm';
  rArm.position.set(ARM_X, Y_ARM, 0);
  rArm.castShadow = true;
  group.add(rArm);
  addChildMesh(rArm, ironBracerGeo, ironMat, 0, -0.22, 0);
  addChildMesh(rArm, fistGeo, armMat, 0, -0.39, 0);

  // Legs
  const legGeo = new THREE.CylinderGeometry(LEG_R, LEG_R, 0.82, 12);
  const legMat = mat(0x2a5018, { r: 0.72 });
  const bootGeo = new THREE.CylinderGeometry(LEG_R + 0.01, LEG_R + 0.025, 0.26, 12);
  const bootMat = mat(0x1e1008, { r: 0.82 });
  const toeGeo  = new THREE.SphereGeometry(LEG_R + 0.015, 8, 5);
  const legHalfHeight = 0.41;
  const hipY = Y_LEG + legHalfHeight;

  const lLegPivot = new THREE.Group();
  lLegPivot.name = 'leftLeg';
  lLegPivot.position.set(-0.20, hipY, 0);
  group.add(lLegPivot);
  const lLeg = mesh(legGeo, legMat);
  lLeg.position.set(0, -legHalfHeight, 0);
  lLeg.castShadow = true;
  lLegPivot.add(lLeg);
  const lBoot = addChildMesh(lLeg, bootGeo, bootMat, 0, -0.37, 0);
  addChildMesh(lBoot, toeGeo, bootMat, 0, -0.11, 0.05);

  const rLegPivot = new THREE.Group();
  rLegPivot.name = 'rightLeg';
  rLegPivot.position.set(0.20, hipY, 0);
  group.add(rLegPivot);
  const rLeg = mesh(legGeo, legMat);
  rLeg.position.set(0, -legHalfHeight, 0);
  rLeg.castShadow = true;
  rLegPivot.add(rLeg);
  const rBoot = addChildMesh(rLeg, bootGeo, bootMat, 0, -0.37, 0);
  addChildMesh(rBoot, toeGeo, bootMat, 0, -0.11, 0.05);

  addOutlineShell(group, {
    includeNames: ['body', 'head', 'cloak', 'leftLeg', 'rightLeg',
      'leftArm', 'rightArm', 'leftPauldron', 'rightPauldron'],
    scale: 1.06,
  });

  return group;
}

// ── Undead ────────────────────────────────────────────────────────────────────

export function buildUndeadModel(): THREE.Group {
  const group = new THREE.Group();

  const TORSO_W = 0.52;  // gaunt / narrow
  const ARM_R   = 0.09;
  const LEG_R   = 0.10;
  const ARM_X   = TORSO_W / 2 + ARM_R + 0.02;

  // Torso (gaunt, slight hunch via position offset)
  const torso = mesh(box(TORSO_W, 0.88, 0.30), mat(0x5a6a5a, { r: 0.85 }));
  torso.name = 'body';
  torso.position.set(0, Y_TORSO, 0.04); // slight forward lean in geometry
  torso.castShadow = true;
  group.add(torso);

  // Rib texture (dark lines on chest)
  const ribMat = mat(0x3a4a3a, { r: 0.88 });
  const rib = mesh(box(0.22, 0.26, 0.04), ribMat);
  rib.name = 'rib';
  rib.position.set(0, Y_TORSO + 0.06, 0.18);
  group.add(rib);

  // Head (slightly elongated — skull)
  const headMesh = mesh(box(0.5, 0.54, 0.46), mat(0x8a9a8a));
  headMesh.name = 'head';
  headMesh.position.y = Y_HEAD;
  headMesh.castShadow = true;
  group.add(headMesh);

  // Dark hood
  const hoodMat = mat(0x1a1a1a, { r: 0.95, t: true, o: 0.9 });
  const hood = mesh(new THREE.ConeGeometry(0.32, 0.52, 6), hoodMat);
  hood.name = 'hood';
  hood.position.set(0, 0.52, 0);
  hood.rotation.x = Math.PI; // opens downward
  headMesh.add(hood);

  // Glowing green eyes
  const eyeMat = mat(0x44ffaa, { em: 0x22cc77, ei: 2.8, r: 0.05 });
  const eyeGeo = new THREE.SphereGeometry(0.044, 8, 6);
  const lEye = mesh(eyeGeo, eyeMat);
  lEye.name = 'leftEye';
  lEye.position.set(-0.1, 0.06, 0.25);
  headMesh.add(lEye);
  const rEye = lEye.clone();
  rEye.name = 'rightEye';
  rEye.position.x = 0.1;
  headMesh.add(rEye);

  // Arms (bony — very thin)
  const armGeo = new THREE.CylinderGeometry(ARM_R, ARM_R, 0.66, 10);
  const armMat = mat(0x8a9a8a, { r: 0.88 });
  const clawMat = mat(0x666666, { r: 0.5, m: 0.3 });
  const clawGeo = new THREE.ConeGeometry(0.016, 0.1, 4);

  const lArm = mesh(armGeo, armMat);
  lArm.name = 'leftArm';
  lArm.position.set(-ARM_X, Y_ARM, 0);
  lArm.castShadow = true;
  group.add(lArm);
  // Three finger-claws as arm children
  for (let i = -1; i <= 1; i++) {
    const claw = mesh(clawGeo, clawMat);
    claw.position.set(i * 0.03, -0.38, 0.02);
    claw.rotation.x = -0.45;
    lArm.add(claw);
  }

  const rArm = mesh(armGeo, armMat);
  rArm.name = 'rightArm';
  rArm.position.set(ARM_X, Y_ARM, 0);
  rArm.castShadow = true;
  group.add(rArm);
  for (let i = -1; i <= 1; i++) {
    const claw = mesh(clawGeo, clawMat);
    claw.position.set(i * 0.03, -0.38, 0.02);
    claw.rotation.x = -0.45;
    rArm.add(claw);
  }

  // Legs (very thin)
  const legGeo = new THREE.CylinderGeometry(LEG_R, LEG_R, 0.82, 10);
  const legMat = mat(0x4a5a4a, { r: 0.85 });
  const footGeo = new THREE.CylinderGeometry(LEG_R + 0.01, LEG_R + 0.02, 0.2, 10);
  const footMat = mat(0x2a2a2a, { r: 0.9 });
  const toeGeo  = new THREE.SphereGeometry(LEG_R + 0.01, 8, 5);
  const legHalfHeight = 0.41;
  const hipY = Y_LEG + legHalfHeight;

  const lLegPivot = new THREE.Group();
  lLegPivot.name = 'leftLeg';
  lLegPivot.position.set(-0.12, hipY, 0);
  group.add(lLegPivot);
  const lLeg = mesh(legGeo, legMat);
  lLeg.position.set(0, -legHalfHeight, 0);
  lLeg.castShadow = true;
  lLegPivot.add(lLeg);
  const lFoot = addChildMesh(lLeg, footGeo, footMat, 0, -0.38, 0);
  addChildMesh(lFoot, toeGeo, footMat, 0, -0.09, 0.04);

  const rLegPivot = new THREE.Group();
  rLegPivot.name = 'rightLeg';
  rLegPivot.position.set(0.12, hipY, 0);
  group.add(rLegPivot);
  const rLeg = mesh(legGeo, legMat);
  rLeg.position.set(0, -legHalfHeight, 0);
  rLeg.castShadow = true;
  rLegPivot.add(rLeg);
  const rFoot = addChildMesh(rLeg, footGeo, footMat, 0, -0.38, 0);
  addChildMesh(rFoot, toeGeo, footMat, 0, -0.09, 0.04);

  // Tattered cloak
  const cloak = mesh(
    new THREE.PlaneGeometry(0.5, 0.95, 2, 6),
    mat(0x1a1a1a, { side: THREE.DoubleSide, t: true, o: 0.72 }),
  );
  cloak.name = 'cloak';
  cloak.position.set(0, Y_TORSO, -0.17);
  group.add(cloak);

  addOutlineShell(group, {
    includeNames: ['body', 'head', 'rib', 'cloak', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm'],
    scale: 1.05,
  });

  return group;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type MatOpts = {
  r?: number;   // roughness
  m?: number;   // metalness
  em?: number;  // emissive hex
  ei?: number;  // emissiveIntensity
  side?: THREE.Side;
  t?: boolean;  // transparent
  o?: number;   // opacity
};

function mat(color: number, opts: MatOpts = {}): THREE.MeshStandardMaterial {
  const params: THREE.MeshStandardMaterialParameters = {
    color,
    roughness: opts.r ?? 0.75,
    metalness: opts.m ?? 0,
  };
  if (opts.em !== undefined) {
    params.emissive = new THREE.Color(opts.em);
    params.emissiveIntensity = opts.ei ?? 1;
  }
  if (opts.side !== undefined) params.side = opts.side;
  if (opts.t !== undefined) params.transparent = opts.t;
  if (opts.o !== undefined) params.opacity = opts.o;
  return new THREE.MeshStandardMaterial(params);
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(geo, material);
}

function box(w: number, h: number, d: number): THREE.BoxGeometry {
  return new THREE.BoxGeometry(w, h, d);
}

function sph(r: number, segs: number): THREE.SphereGeometry {
  return new THREE.SphereGeometry(r, segs, Math.ceil(segs * 0.75));
}

function addChildMesh(
  parent: THREE.Mesh,
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const child = new THREE.Mesh(geo, material);
  child.position.set(x, y, z);
  parent.add(child);
  return child;
}
