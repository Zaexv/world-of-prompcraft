import * as THREE from 'three';
import {
  buildLowPolyCharacter,
  finishCharacter,
  box,
  vmat,
} from '../meshes/npcs/individual/_LowPolyKit';
import { NPC_Y_TORSO, NPC_TORSO_TOP } from './NPCAppearance';
import type { CharMatKind } from '../utils/PBRMaps';

/**
 * Player race models, built on the same faceted low-poly kit as the hand-authored
 * individual NPCs (see meshes/npcs/individual/Zaex.ts for the reference style):
 * octagonal tapered torso, tapered cylinder limbs, faceted icosahedron hands,
 * wedge feet, layered armour, and glowing bloom-driven eyes.
 *
 * Animation contract (Player.ts / RemotePlayer.ts): the rig exposes pivots named
 * `leftArm`, `rightArm`, `leftLeg`, `rightLeg`, plus `head` and a trailing
 * `cloak` — the animator rotates each around its local origin.
 */
export function buildRaceModel(race: string): THREE.Group {
  switch (race) {
    case 'human':   return buildHumanModel();
    case 'orc':     return buildOrcModel();
    case 'undead':  return buildUndeadModel();
    case 'night_elf':
    default:        return buildNightElfModel();
  }
}

// ── Night Elf — moon ranger ──────────────────────────────────────────────────

export function buildNightElfModel(): THREE.Group {
  const group = new THREE.Group();

  const SKIN = 0xccb6e8;
  const ARMOR = 0x36204f;
  const ARMOR_LT = 0x553080;
  const TRIM = 0xb8c4e8;
  const HAIR_D = 0x6a3aa0;
  const HAIR_L = 0xe6ddff;
  const GLOW = 0x88bbff;
  const LEATHER = 0x281540;
  const BOOT = 0x18102c;
  const TORSO_D = 0.38;

  const rig = buildLowPolyCharacter(group, {
    torsoW: 0.6, torsoD: TORSO_D, torsoColor: ARMOR, clothKind: 'velvet',
    headW: 0.48, headD: 0.46, skinColor: SKIN,
    armW: 0.17, armD: 0.19, armColor: ARMOR_LT,
    legW: 0.19, legD: 0.22, legColor: LEATHER, footColor: BOOT,
  });

  const trim = (): THREE.MeshStandardMaterial => vmat(TRIM, { roughness: 0.3, metalness: 0.7, kind: 'metal' });

  // V-tapered chest cuirass with a glowing arcane gem.
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.27, 0.42, 8), vmat(ARMOR_LT, { roughness: 0.5, kind: 'velvet' }));
  chest.rotation.y = Math.PI / 8;
  chest.scale.z = 0.6;
  chest.position.y = NPC_Y_TORSO + 0.16;
  chest.castShadow = true;
  group.add(chest);
  group.add(box(0.3, 0.06, 0.28, trim(), 0, NPC_TORSO_TOP - 0.05, 0)); // collar
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), vmat(0xcc99ff, { emissive: 0x9944ff, emissiveIntensity: 3.2, roughness: 0.2, metalness: 0.4 }));
  gem.position.set(0, NPC_Y_TORSO + 0.16, 0.21);
  group.add(gem);
  // Belt.
  group.add(box(0.64, 0.09, 0.42, vmat(LEATHER, { roughness: 0.7 }), 0, NPC_Y_TORSO - 0.4, 0));

  // Sweeping side drapes (kept short so legs stay free).
  for (const sx of [-1, 1]) {
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 4), vmat(ARMOR, { roughness: 0.7, kind: 'velvet' }));
    drape.position.set(sx * 0.2, NPC_Y_TORSO - 0.62, 0.04);
    drape.rotation.z = sx * 0.08;
    drape.castShadow = true;
    group.add(drape);
  }

  // Pauldrons + bracers (swing with the arms).
  for (const arm of [rig.leftArm, rig.rightArm]) {
    const pauldron = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), vmat(ARMOR_LT, { roughness: 0.5 }));
    pauldron.scale.set(1, 0.8, 1);
    pauldron.position.y = 0.02;
    pauldron.castShadow = true;
    arm.add(pauldron);
    arm.add(box(0.04, 0.1, 0.04, vmat(GLOW, { emissive: GLOW, emissiveIntensity: 2.0 }), 0, 0.02, 0.1)); // rune
    arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.18, 8), trim()).translateY(-0.5));
  }

  // Tall greaves + knee cuffs.
  for (const leg of [rig.leftLeg, rig.rightLeg]) {
    const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.46, 8), vmat(BOOT, { roughness: 0.55 }));
    greave.position.y = -0.58;
    greave.castShadow = true;
    leg.add(greave);
    leg.add(box(0.22, 0.06, 0.24, vmat(LEATHER, { roughness: 0.7 }), 0, -0.36, 0));
  }

  // Swept-back silver crest (mohawk of cones), leaning back.
  rig.head.add(box(0.06, 0.1, 0.5, vmat(HAIR_D, { roughness: 0.8 }), 0, 0.3, -0.02));
  const crestN = 7;
  for (let i = 0; i < crestN; i++) {
    const t = i / (crestN - 1);
    const h = 0.18 + Math.sin(t * Math.PI) * 0.24;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, h, 4), vmat(i % 2 === 0 ? HAIR_L : HAIR_D, { roughness: 0.8 }));
    spike.position.set(0, 0.3 + h / 2 - 0.02, 0.2 - t * 0.46);
    spike.rotation.x = -0.2;
    spike.castShadow = true;
    rig.head.add(spike);
  }

  // Long pointed ears.
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.26, 4), vmat(SKIN, { roughness: 0.55 }));
    ear.position.set(sx * 0.26, 0.06, -0.04);
    ear.rotation.z = sx * -0.7;
    ear.rotation.x = -0.4;
    rig.head.add(ear);
  }

  // Glowing silver-blue eyes + brows.
  const eyeMat = vmat(0xcfe2ff, { emissive: GLOW, emissiveIntensity: 4.2 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), eyeMat);
    eye.position.set(sx * 0.11, 0.03, 0.235);
    rig.head.add(eye);
    rig.head.add(box(0.13, 0.022, 0.03, vmat(HAIR_D, { roughness: 0.7 }), sx * 0.11, 0.12, 0.235));
  }
  // Slender nose.
  rig.head.add(box(0.06, 0.13, 0.07, vmat(SKIN, { roughness: 0.55 }), 0, -0.05, 0.24));

  // Glowing moonblade on the back.
  mountOnBack(group, makeBackSword({
    bladeLen: 1.0, bladeW: 0.08, bladeColor: 0xcfe6ff, bladeMetal: 0.85, bladeRough: 0.2,
    edgeEmissive: 0x66ccff, edgeIntensity: 3.4,
    guardColor: 0xb8c4e8, guardW: 0.3, crescent: true,
    gripColor: 0x2a1c40, gripLen: 0.22, pommelColor: 0xaad4ff, pommelEmissive: 0x66aaff,
  }), TORSO_D);

  makeCloak(group, { rTop: 0.3, rBot: 0.46, height: 1.04, color: 0x1e0f3a, kind: 'velvet', mantleColor: 0x2c1a52 });

  finishCharacter(group);
  return group;
}

// ── Human — steel knight ──────────────────────────────────────────────────────

export function buildHumanModel(): THREE.Group {
  const group = new THREE.Group();

  const SKIN = 0xe0b489;
  const STEEL = 0x8a96ab;
  const STEEL_D = 0x5d6675;
  const GOLD = 0xd9b24a;
  const LEATHER = 0x4a2c18;
  const HAIR = 0x4a2c10;
  const TORSO_D = 0.42;

  const rig = buildLowPolyCharacter(group, {
    torsoW: 0.66, torsoD: TORSO_D, torsoColor: STEEL_D, clothKind: 'metal',
    headW: 0.5, headD: 0.48, skinColor: SKIN,
    armW: 0.19, armD: 0.21, armColor: STEEL_D,
    legW: 0.21, legD: 0.24, legColor: STEEL_D, footColor: 0x2a2018,
  });

  const steel = (): THREE.MeshStandardMaterial => vmat(STEEL, { roughness: 0.35, metalness: 0.8, kind: 'metal' });
  const gold = (): THREE.MeshStandardMaterial => vmat(GOLD, { roughness: 0.3, metalness: 0.9, kind: 'gold' });

  // Broad V-tapered breastplate with a gold collar.
  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.31, 0.44, 8), steel());
  chest.rotation.y = Math.PI / 8;
  chest.scale.z = 0.62;
  chest.position.y = NPC_Y_TORSO + 0.16;
  chest.castShadow = true;
  group.add(chest);
  group.add(box(0.34, 0.07, 0.3, gold(), 0, NPC_TORSO_TOP - 0.05, 0)); // collar

  // Blue tabard with a gold diamond emblem.
  group.add(box(0.22, 0.56, 0.04, vmat(0x21459e, { roughness: 0.75, kind: 'wool' }), 0, NPC_Y_TORSO - 0.16, 0.215));
  const emblem = box(0.11, 0.11, 0.03, gold(), 0, NPC_Y_TORSO + 0.0, 0.235);
  emblem.rotation.z = Math.PI / 4;
  group.add(emblem);
  // Belt + buckle.
  group.add(box(0.72, 0.1, 0.46, vmat(LEATHER, { roughness: 0.8 }), 0, NPC_Y_TORSO - 0.4, 0));
  group.add(box(0.1, 0.1, 0.05, gold(), 0, NPC_Y_TORSO - 0.4, 0.235));

  // Steel pauldrons + bracers.
  for (const arm of [rig.leftArm, rig.rightArm]) {
    const pauldron = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), steel());
    pauldron.scale.set(1, 0.78, 1);
    pauldron.position.y = 0.03;
    pauldron.castShadow = true;
    arm.add(pauldron);
    arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.105, 0.2, 8), steel()).translateY(-0.5));
  }

  // Steel greaves + knee guards.
  for (const leg of [rig.leftLeg, rig.rightLeg]) {
    const greave = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.135, 0.46, 8), steel());
    greave.position.y = -0.58;
    greave.castShadow = true;
    leg.add(greave);
    const knee = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), steel());
    knee.position.set(0, -0.36, 0.04);
    knee.scale.set(1, 0.8, 0.9);
    leg.add(knee);
  }

  // Layered short hair.
  const hairMat = vmat(HAIR, { roughness: 0.9 });
  rig.head.add(box(0.52, 0.16, 0.5, hairMat, 0, 0.26, 0));
  rig.head.add(box(0.5, 0.2, 0.08, hairMat, 0, 0.16, -0.22));
  for (const sx of [-1, 1]) rig.head.add(box(0.07, 0.22, 0.46, hairMat, sx * 0.24, 0.12, -0.02));
  // Gold circlet.
  const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.022, 6, 16), gold());
  circlet.rotation.x = Math.PI / 2;
  circlet.position.y = 0.2;
  rig.head.add(circlet);

  // Eyes (faint blue glow) + brows.
  const eyeMat = vmat(0xbcd0ff, { emissive: 0x4a6cc0, emissiveIntensity: 1.4 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), eyeMat);
    eye.position.set(sx * 0.12, 0.02, 0.245);
    rig.head.add(eye);
    rig.head.add(box(0.13, 0.022, 0.03, hairMat, sx * 0.12, 0.1, 0.245));
  }
  // Nose.
  rig.head.add(box(0.07, 0.14, 0.08, vmat(SKIN, { roughness: 0.55 }), 0, -0.04, 0.25));

  // Knight's steel longsword on the back.
  mountOnBack(group, makeBackSword({
    bladeLen: 0.96, bladeW: 0.11, bladeColor: 0xdde2ea, bladeMetal: 0.92, bladeRough: 0.2,
    guardColor: GOLD, guardW: 0.36, gripColor: LEATHER, gripLen: 0.24, pommelColor: GOLD,
  }), TORSO_D);

  makeCloak(group, { rTop: 0.32, rBot: 0.5, height: 1.04, color: 0x2250c4, kind: 'wool', mantleColor: 0x9a1f1f });

  finishCharacter(group);
  return group;
}

// ── Orc — war chief ────────────────────────────────────────────────────────────

export function buildOrcModel(): THREE.Group {
  const group = new THREE.Group();

  const SKIN = 0x4f8a35;
  const SKIN_D = 0x3a6824;
  const IRON = 0x3a3f3a;
  const LEATHER = 0x4a3018;
  const FUR = 0x2a1c12;
  const TUSK = 0xe8d2b0;
  const TORSO_D = 0.5;

  const rig = buildLowPolyCharacter(group, {
    torsoW: 0.84, torsoD: TORSO_D, torsoColor: SKIN,
    headW: 0.62, headD: 0.56, skinColor: SKIN,
    armW: 0.26, armD: 0.28, armColor: SKIN,
    legW: 0.27, legD: 0.3, legColor: SKIN_D, footColor: 0x1e1008,
  });

  const iron = (): THREE.MeshStandardMaterial => vmat(IRON, { roughness: 0.45, metalness: 0.55, kind: 'metal' });
  const leather = (): THREE.MeshStandardMaterial => vmat(LEATHER, { roughness: 0.75 });

  // Crossed leather strap harness + iron heart-guard.
  for (const dir of [1, -1]) {
    const s = box(0.7, 0.1, 0.02, leather(), 0, NPC_Y_TORSO + 0.06, 0.26);
    s.rotation.z = dir * 0.7;
    group.add(s);
  }
  group.add(box(0.26, 0.26, 0.06, iron(), 0, NPC_Y_TORSO + 0.1, 0.27));
  // Fur shoulder ruff.
  const ruff = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.1, 6, 14), vmat(FUR, { roughness: 0.95, kind: 'wool' }));
  ruff.position.set(0, NPC_TORSO_TOP - 0.04, 0);
  ruff.rotation.x = Math.PI / 2;
  ruff.scale.set(1.1, 0.85, 1);
  ruff.castShadow = true;
  group.add(ruff);
  // War belt + crimson loincloth panels.
  group.add(box(0.86, 0.12, 0.52, leather(), 0, NPC_Y_TORSO - 0.4, 0));
  for (let i = -1; i <= 1; i++) {
    const panel = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.56, 4), vmat(0xa01f1f, { roughness: 0.75, kind: 'wool' }));
    panel.position.set(i * 0.18, NPC_Y_TORSO - 0.66, 0.22);
    panel.castShadow = true;
    group.add(panel);
  }

  // Spiked iron pauldrons + bracers.
  for (const arm of [rig.leftArm, rig.rightArm]) {
    const pauldron = new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 0), iron());
    pauldron.scale.set(1, 0.8, 1);
    pauldron.position.y = 0.04;
    pauldron.castShadow = true;
    arm.add(pauldron);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 5), iron());
    spike.position.y = 0.24;
    arm.add(spike);
    arm.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.2, 8), iron()).translateY(-0.5));
  }

  // Greaves + knee spikes.
  for (const leg of [rig.leftLeg, rig.rightLeg]) {
    leg.add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.44, 8), vmat(0x1e1008, { roughness: 0.8 })).translateY(-0.58));
    const knee = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 6), iron());
    knee.position.set(0, -0.34, 0.12);
    knee.rotation.x = 1.3;
    leg.add(knee);
  }

  // Heavy brow + jaw + tusks.
  rig.head.add(box(0.6, 0.1, 0.1, vmat(SKIN_D, { roughness: 0.6 }), 0, 0.14, 0.24)); // brow
  rig.head.add(box(0.5, 0.16, 0.22, vmat(SKIN_D, { roughness: 0.6 }), 0, -0.24, 0.18)); // jaw
  for (const sx of [-1, 1]) {
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 5), vmat(TUSK, { roughness: 0.5 }));
    tusk.position.set(sx * 0.13, -0.28, 0.26);
    tusk.rotation.z = sx * 0.9;
    tusk.rotation.x = -0.2;
    rig.head.add(tusk);
  }
  // Black top-knot.
  rig.head.add(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.4, 6), vmat(0x141414, { roughness: 0.95 })).translateY(0.44));

  // Feral yellow glow eyes.
  const eyeMat = vmat(0xffd34a, { emissive: 0xffaa00, emissiveIntensity: 3.6 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), eyeMat);
    eye.position.set(sx * 0.14, 0.06, 0.285);
    rig.head.add(eye);
  }
  // Broad flat nose.
  rig.head.add(box(0.13, 0.11, 0.1, vmat(SKIN_D, { roughness: 0.6 }), 0, -0.02, 0.28));

  // Brutal jagged iron greatcleaver on the back.
  mountOnBack(group, makeBackSword({
    bladeLen: 0.82, bladeW: 0.28, bladeColor: 0x4a4038, bladeMetal: 0.45, bladeRough: 0.55,
    edgeEmissive: 0xff3300, edgeIntensity: 1.6,
    guardColor: 0x2a2018, guardW: 0.32, gripColor: 0x6b4a2a, gripLen: 0.32, pommelColor: TUSK,
    tip: false, spikes: { color: 0x2a2018, count: 3 },
  }), TORSO_D);

  makeCloak(group, { rTop: 0.42, rBot: 0.58, height: 0.92, color: 0x3a2a1c, kind: 'wool', mantleColor: FUR });

  finishCharacter(group);
  return group;
}

// ── Undead — soul revenant ──────────────────────────────────────────────────────

export function buildUndeadModel(): THREE.Group {
  const group = new THREE.Group();

  const SKIN = 0x9aa890;
  const SKIN_D = 0x6d7a66;
  const CLOTH = 0x23262a;
  const BONE = 0xcdd4c8;
  const GLOW = 0x33ff99;
  const TORSO_D = 0.32;

  const rig = buildLowPolyCharacter(group, {
    torsoW: 0.5, torsoD: TORSO_D, torsoColor: CLOTH,
    headW: 0.46, headD: 0.44, skinColor: SKIN,
    armW: 0.13, armD: 0.14, armColor: SKIN,
    legW: 0.14, legD: 0.16, legColor: SKIN_D, footColor: 0x1a1a1a,
  });

  const bone = (): THREE.MeshStandardMaterial => vmat(BONE, { roughness: 0.7 });

  // Exposed rib cage down the chest.
  for (let i = 0; i < 4; i++) {
    group.add(box(0.3 - i * 0.04, 0.03, 0.05, bone(), 0, NPC_Y_TORSO + 0.18 - i * 0.13, 0.15));
  }
  // Sternum + belt rope.
  group.add(box(0.04, 0.42, 0.06, bone(), 0, NPC_Y_TORSO + 0.0, 0.15));
  group.add(box(0.52, 0.07, 0.34, vmat(0x141414, { roughness: 0.85 }), 0, NPC_Y_TORSO - 0.4, 0));

  // Bony shoulder spikes + claw fingers (swing with arms).
  for (const arm of [rig.leftArm, rig.rightArm]) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.2, 6), bone());
    spike.position.set(0, 0.04, 0);
    spike.rotation.z = 0.2;
    arm.add(spike);
    for (let f = -1; f <= 1; f++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.12, 4), bone());
      claw.position.set(f * 0.035, -0.78, 0.03);
      claw.rotation.x = -0.4;
      arm.add(claw);
    }
  }

  // Hood: a dark cone shrouding the head, opening downward.
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.56, 6), vmat(0x121212, { roughness: 0.95, kind: 'wool' }));
  hood.position.y = 0.16;
  hood.castShadow = true;
  rig.head.add(hood);
  // Sunken brow ridge.
  rig.head.add(box(0.4, 0.06, 0.06, vmat(SKIN_D, { roughness: 0.8 }), 0, 0.12, 0.22));
  // Skeletal jaw.
  rig.head.add(box(0.34, 0.12, 0.14, vmat(SKIN_D, { roughness: 0.8 }), 0, -0.24, 0.16));

  // Hollow glowing green eyes (driven hard for bloom).
  const eyeMat = vmat(0x66ffbb, { emissive: GLOW, emissiveIntensity: 5.0 });
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), eyeMat);
    eye.position.set(sx * 0.1, 0.02, 0.225);
    rig.head.add(eye);
  }

  // Floating soul wisps at the shoulders + crown.
  const wispMat = vmat(0x66ffbb, { emissive: GLOW, emissiveIntensity: 3.2 });
  for (const [x, y, s] of [[-0.34, NPC_TORSO_TOP + 0.05, 1], [0.34, NPC_TORSO_TOP + 0.12, 1], [0, NPC_Y_TORSO + 1.0, 0.7]] as const) {
    const wisp = new THREE.Mesh(new THREE.IcosahedronGeometry(0.04, 0), wispMat);
    wisp.position.set(x, y, -0.05);
    wisp.scale.setScalar(s);
    group.add(wisp);
  }

  // Soul reaver — black blade, green soul-fire edge — on the back.
  mountOnBack(group, makeBackSword({
    bladeLen: 0.95, bladeW: 0.1, bladeColor: 0x2a2e2a, bladeMetal: 0.3, bladeRough: 0.6,
    edgeEmissive: GLOW, edgeIntensity: 3.6,
    guardColor: BONE, guardW: 0.26, gripColor: 0x161616, gripLen: 0.22,
    pommelColor: 0x66ffbb, pommelEmissive: GLOW, spikes: { color: BONE, count: 2 },
  }), TORSO_D);

  makeCloak(group, { rTop: 0.28, rBot: 0.46, height: 1.08, color: 0x161616, kind: 'wool', opacity: 0.7, tattered: true });

  finishCharacter(group);
  return group;
}

// ── Cloak ────────────────────────────────────────────────────────────────────

type CloakOpts = {
  rTop: number;        // radius at the shoulders
  rBot: number;        // radius at the hem (> rTop → flares out)
  height: number;
  color: number;
  kind?: CharMatKind;
  opacity?: number;
  mantleColor?: number;  // layered shoulder mantle over the cape
  tattered?: boolean;    // ragged notched hem (undead)
};

/**
 * A flared, curved cape that wraps the back: an open partial-cylinder shell
 * (narrow at the shoulders, wide at the hem) instead of a flat plane, with an
 * optional layered shoulder mantle. Named 'cloak' and pivoted at the shoulders so
 * the animator's lean/flutter swings the hem out behind the character.
 */
function makeCloak(group: THREE.Group, o: CloakOpts): THREE.Group {
  const pivot = new THREE.Group();
  pivot.name = 'cloak';
  pivot.position.set(0, NPC_TORSO_TOP, 0);

  const span = 2.3;                  // arc width (radians) wrapping the back
  const start = Math.PI - span / 2;  // centred on −z (behind the body)

  const capeMat = vmat(o.color, { roughness: 0.85, kind: o.kind });
  capeMat.side = THREE.DoubleSide;
  if (o.opacity !== undefined && o.opacity < 1) {
    capeMat.transparent = true;
    capeMat.opacity = o.opacity;
  }
  const cape = new THREE.Mesh(
    new THREE.CylinderGeometry(o.rTop, o.rBot, o.height, 16, 3, true, start, span),
    capeMat,
  );
  cape.position.y = -o.height / 2 + 0.02;
  cape.castShadow = true;

  if (o.tattered) {
    const pos = cape.geometry.attributes.position;
    const minY = -o.height / 2;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < minY + 0.01) {
        pos.setY(i, minY + (i % 2 === 0 ? 0.14 : -0.05)); // alternating notches/points
      }
    }
    pos.needsUpdate = true;
    cape.geometry.computeVertexNormals();
  }
  pivot.add(cape);

  // Layered shoulder mantle over the top of the cape.
  if (o.mantleColor !== undefined) {
    const mantleMat = vmat(o.mantleColor, { roughness: 0.85, kind: 'wool' });
    mantleMat.side = THREE.DoubleSide;
    const mantle = new THREE.Mesh(
      new THREE.CylinderGeometry(o.rTop + 0.04, o.rTop + 0.12, 0.34, 16, 1, true, start - 0.1, span + 0.2),
      mantleMat,
    );
    mantle.position.y = -0.15;
    mantle.castShadow = true;
    pivot.add(mantle);
  }

  group.add(pivot);
  return pivot;
}

// ── Back weapon ────────────────────────────────────────────────────────────────

type SwordOpts = {
  bladeLen: number;
  bladeW: number;
  bladeThick?: number;
  bladeColor: number;
  bladeMetal?: number;
  bladeRough?: number;
  edgeEmissive?: number;     // glowing fuller down the blade
  edgeIntensity?: number;
  guardColor: number;
  guardW: number;
  crescent?: boolean;        // curved elven crossguard instead of a straight bar
  gripColor: number;
  gripLen: number;
  pommelColor: number;
  pommelEmissive?: number;
  tip?: boolean;             // pointed tip (false → flat cleaver edge)
  spikes?: { color: number; count: number };  // jagged spikes down one edge
};

/**
 * Builds a sword pointing up the +Y axis with the hilt at the origin, ready to be
 * strapped across the back by mountOnBack.
 */
function makeBackSword(o: SwordOpts): THREE.Group {
  const g = new THREE.Group();
  const thick = o.bladeThick ?? 0.04;
  const bladeMat = vmat(o.bladeColor, { roughness: o.bladeRough ?? 0.25, metalness: o.bladeMetal ?? 0.85 });

  const guardY = o.gripLen / 2 + 0.02;
  const baseY = guardY + 0.03;
  const centerY = baseY + o.bladeLen / 2;

  g.add(box(o.bladeW, o.bladeLen, thick, bladeMat, 0, centerY, 0));

  if (o.tip !== false) {
    const tipH = o.bladeW * 1.5;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(o.bladeW / 2, tipH, 4), bladeMat);
    tip.position.y = centerY + o.bladeLen / 2 + tipH / 2 - 0.01;
    tip.rotation.y = Math.PI / 4;
    tip.castShadow = true;
    g.add(tip);
  }

  if (o.edgeEmissive !== undefined) {
    g.add(box(
      o.bladeW * 0.32, o.bladeLen * 0.92, thick + 0.016,
      vmat(o.bladeColor, { emissive: o.edgeEmissive, emissiveIntensity: o.edgeIntensity ?? 3, roughness: 0.2, metalness: 0.3 }),
      0, centerY, 0,
    ));
  }

  if (o.spikes) {
    const spMat = vmat(o.spikes.color, { roughness: 0.5, metalness: 0.4 });
    for (let i = 0; i < o.spikes.count; i++) {
      const t = (i + 1) / (o.spikes.count + 1);
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.15, 4), spMat);
      sp.position.set(o.bladeW / 2 + 0.02, baseY + o.bladeLen * t, 0);
      sp.rotation.z = -Math.PI / 2;
      sp.castShadow = true;
      g.add(sp);
    }
  }

  // Crossguard.
  if (o.crescent) {
    const cg = new THREE.Mesh(
      new THREE.TorusGeometry(o.guardW / 2, 0.025, 6, 16, Math.PI),
      vmat(o.guardColor, { roughness: 0.3, metalness: 0.7, kind: 'metal' }),
    );
    cg.position.y = guardY;
    cg.castShadow = true;
    g.add(cg);
  } else {
    g.add(box(o.guardW, 0.06, thick + 0.07, vmat(o.guardColor, { roughness: 0.3, metalness: 0.7, kind: 'metal' }), 0, guardY, 0));
  }

  // Grip.
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, o.gripLen, 8), vmat(o.gripColor, { roughness: 0.9 })));

  // Pommel.
  const pommelMat = o.pommelEmissive !== undefined
    ? vmat(o.pommelColor, { emissive: o.pommelEmissive, emissiveIntensity: 2.5, roughness: 0.3, metalness: 0.5 })
    : vmat(o.pommelColor, { roughness: 0.3, metalness: 0.7, kind: 'metal' });
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), pommelMat);
  pommel.position.y = -o.gripLen / 2 - 0.03;
  g.add(pommel);

  return g;
}

/**
 * Straps a +Y-built weapon diagonally across the back, flipped so the blade
 * points DOWN — pommel/grip rising over the shoulder, blade running to the hip.
 */
function mountOnBack(group: THREE.Group, weapon: THREE.Group, torsoD: number): void {
  weapon.rotation.set(0.16, 0, Math.PI + 0.18); // π flip → blade down, +0.18 diagonal flourish
  weapon.position.set(0.1, NPC_TORSO_TOP - 0.02, -torsoD / 2 - 0.14);
  group.add(weapon);
}
