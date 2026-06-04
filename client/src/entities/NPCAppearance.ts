/**
 * NPCAppearance — Roblox-style procedural mesh for NPCs.
 * Optimized with Singleton Geometry & Material caching.
 */
import { applyCharacterPBR } from '../utils/PBRMaps';
import * as THREE from 'three';
import { hashString } from './NPCModels';
import type { NPCPlaceholderStyle } from './NPCModels';

export const NPC_Y_LEG   = 0.44;
export const NPC_Y_TORSO = 1.29;
export const NPC_Y_ARM   = 1.40;
export const NPC_Y_HEAD  = 1.99;
export const NPC_HEAD_HALF = 0.26;
export const NPC_TORSO_TOP = NPC_Y_TORSO + 0.44; 
export const NPC_HEAD_TOP  = NPC_Y_HEAD + NPC_HEAD_HALF;

export interface AppearanceData {
  bodyWidth: number;
  bodyDepth: number;
  bodyColor: number;
  headWidth: number;
  headDepth: number;
  headColor: number;
  eyeColor: number;
  eyeEmissive: number;
  eyeEmissiveIntensity: number;
  armRadius: number;
  armColor: number;
  legRadius: number;
  legColor: number;
  beltColor: number;
  hatRadius: number;
  hatHeight: number;
  hatColor: number;
}

/** Global cache for NPC geometry and materials to minimize memory usage in dense crowds. */
const _geometryCache: Map<string, THREE.BufferGeometry> = new Map();
const _materialCache: Map<string, THREE.MeshStandardMaterial> = new Map();

function getSharedGeo(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = _geometryCache.get(key);
  if (!geo) {
    geo = factory();
    _geometryCache.set(key, geo);
  }
  return geo;
}

function getSharedMat(key: string, factory: () => THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  let mat = _materialCache.get(key);
  if (!mat) {
    mat = factory();
    _materialCache.set(key, mat);
  }
  return mat;
}

export function buildProceduralMesh(
  group: THREE.Group,
  appearance: AppearanceData,
  style: NPCPlaceholderStyle,
): THREE.MeshStandardMaterial[] {
  if (style === 'spider') return buildSpiderMesh(group, appearance);
  if (style === 'wasp') return buildWaspMesh(group, appearance);
  if (style === 'wolf' || style === 'boar') return buildQuadrupedMesh(group, appearance, style);
  if (style === 'golem') return buildGolemMesh(group, appearance);

  const a = appearance;
  
  // Seed-based variation for humans/humanoids if we have an ID
  const seed = group.name ? hashString(group.name) : 0;
  const skinColor = style === 'civilian' || style === 'merchant' || style === 'guard' || style === 'healer' 
    ? varyColor(a.headColor, seed, 0.1) 
    : a.headColor;
  const clothColor = varyColor(a.bodyColor, seed, 0.15);

  const materials: THREE.MeshStandardMaterial[] = [];
  const ARM_X = a.bodyWidth / 2 + a.armRadius + 0.02;
  const LEG_X = a.bodyWidth / 4;

  // ── Torso ──
  const bodyGeo = getSharedGeo(`${style}_body`, () => new THREE.BoxGeometry(a.bodyWidth, 0.88, a.bodyDepth));
  const bodyMat = getSharedMat(`${style}_body_${seed}`, () => npcMat(clothColor));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'body';
  body.position.y = NPC_Y_TORSO;
  body.castShadow = true;
  group.add(body);
  materials.push(bodyMat);

  // Belt
  const beltGeo = getSharedGeo(`${style}_belt`, () => new THREE.TorusGeometry(a.bodyWidth / 2 - 0.01, 0.028, 5, 14));
  const beltMat = getSharedMat(`${style}_belt`, () => npcMat(a.beltColor, 0.6, 0.15));
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.name = 'belt';
  belt.position.y = NPC_Y_TORSO - 0.28;
  belt.rotation.x = Math.PI / 2;
  group.add(belt);
  materials.push(beltMat);

  // ── Head ──
  const headGeo = getSharedGeo(`${style}_head`, () => new THREE.BoxGeometry(a.headWidth, 0.52, a.headDepth));
  const headMat = getSharedMat(`${style}_head_${seed}`, () => npcMat(skinColor, 0.88));
  const head = new THREE.Mesh(headGeo, headMat);
  head.name = 'head';
  head.position.y = NPC_Y_HEAD;
  head.castShadow = true;
  group.add(head);
  materials.push(headMat);

  // Eyes
  if (a.eyeEmissiveIntensity > 0) {
    const eyeGeo = getSharedGeo('eye_sphere', () => new THREE.SphereGeometry(0.046, 8, 6));
    const eyeMat = getSharedMat(`${style}_eye`, () => npcMat(a.eyeColor, 0.05, 0, a.eyeEmissive, a.eyeEmissiveIntensity));
    const ex = a.headWidth * 0.22;
    const ez = a.headDepth / 2 + 0.02;
    const lEye = new THREE.Mesh(eyeGeo, eyeMat);
    lEye.name = 'leftEye';
    lEye.position.set(-ex, NPC_Y_HEAD + 0.03, ez);
    group.add(lEye);
    const rEye = lEye.clone();
    rEye.name = 'rightEye';
    rEye.position.x = ex;
    group.add(rEye);
    materials.push(eyeMat);
  }

  // Hat
  if (a.hatRadius > 0) {
    const hatGeo = getSharedGeo(`${style}_hat`, () => new THREE.ConeGeometry(a.hatRadius, a.hatHeight, 8));
    const hatMat = getSharedMat(`${style}_hat`, () => npcMat(a.hatColor));
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.name = 'hat';
    hat.position.y = NPC_HEAD_TOP + a.hatHeight / 2;
    group.add(hat);
    materials.push(hatMat);
  }

  // ── Arms ──
  const armGeo = getSharedGeo(`${style}_arm`, () => new THREE.CylinderGeometry(a.armRadius, a.armRadius, 0.66, 10));
  const handGeo = getSharedGeo(`${style}_hand`, () => new THREE.SphereGeometry(a.armRadius + 0.01, 8, 5));
  const armMat = getSharedMat(`${style}_arm`, () => npcMat(a.armColor, 0.78));

  const lArm = new THREE.Mesh(armGeo, armMat);
  lArm.name = 'leftArm';
  lArm.position.set(-ARM_X, NPC_Y_ARM, 0);
  lArm.castShadow = true;
  group.add(lArm);
  childMesh(lArm, handGeo, armMat, 0, -0.37, 0);

  const rArm = new THREE.Mesh(armGeo, armMat);
  rArm.name = 'rightArm';
  rArm.position.set(ARM_X, NPC_Y_ARM, 0);
  rArm.castShadow = true;
  group.add(rArm);
  childMesh(rArm, handGeo, armMat, 0, -0.37, 0);
  materials.push(armMat);

  // ── Legs ──
  const legGeo = getSharedGeo(`${style}_leg`, () => new THREE.CylinderGeometry(a.legRadius, a.legRadius, 0.82, 10));
  const bootGeo = getSharedGeo(`${style}_boot`, () => new THREE.CylinderGeometry(a.legRadius + 0.01, a.legRadius + 0.02, 0.22, 10));
  const toeGeo = getSharedGeo(`${style}_toe`, () => new THREE.SphereGeometry(a.legRadius + 0.015, 8, 5));
  const legMat = getSharedMat(`${style}_leg`, () => npcMat(a.legColor, 0.75));
  const bootMat = getSharedMat(`${style}_boot`, () => npcMat(darken(a.legColor, 0.22), 0.80));
  
  const legHalfHeight = 0.41;
  const hipY = NPC_Y_LEG + legHalfHeight;

  const lLegPivot = new THREE.Group();
  lLegPivot.name = 'leftLeg';
  lLegPivot.position.set(-LEG_X, hipY, 0);
  group.add(lLegPivot);
  const lLeg = new THREE.Mesh(legGeo, legMat);
  lLeg.position.set(0, -legHalfHeight, 0);
  lLeg.castShadow = true;
  lLegPivot.add(lLeg);
  const lBoot = childMesh(lLeg, bootGeo, bootMat, 0, -0.38, 0);
  childMesh(lBoot, toeGeo, bootMat, 0, -0.09, 0.04);

  const rLegPivot = new THREE.Group();
  rLegPivot.name = 'rightLeg';
  rLegPivot.position.set(LEG_X, hipY, 0);
  group.add(rLegPivot);
  const rLeg = new THREE.Mesh(legGeo, legMat);
  rLeg.position.set(0, -legHalfHeight, 0);
  rLeg.castShadow = true;
  rLegPivot.add(rLeg);
  const rBoot = childMesh(rLeg, bootGeo, bootMat, 0, -0.38, 0);
  childMesh(rBoot, toeGeo, bootMat, 0, -0.09, 0.04);
  materials.push(legMat);

  applyCharacterPBR(group);
  return materials;
}

function npcMat(
  color: number,
  roughness = 0.78,
  metalness = 0,
  emissive?: number,
  emissiveIntensity?: number,
): THREE.MeshStandardMaterial {
  const params: THREE.MeshStandardMaterialParameters = {
    color,
    roughness,
    metalness,
    flatShading: true,
    dithering: true, // Prevent banding in dark areas
  };
  if (emissive !== undefined && emissive !== 0) {
    params.emissive = new THREE.Color(emissive);
    if (emissiveIntensity !== undefined) params.emissiveIntensity = emissiveIntensity;
  }
  return new THREE.MeshStandardMaterial(params);
}

function childMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const child = new THREE.Mesh(geo, mat);
  child.position.set(x, y, z);
  parent.add(child);
  return child;
}

export function darken(hex: number, amount: number): number {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  return (
    ((Math.max(0, r - 255 * amount)) << 16) |
    ((Math.max(0, g - 255 * amount)) << 8) |
    Math.max(0, b - 255 * amount)
  );
}

export function varyColor(hex: number, seed: number, amount: number): number {
  const r = (hex >> 16) & 255;
  const g = (hex >> 8) & 255;
  const b = hex & 255;
  
  const vr = (Math.sin(seed * 1.1) * 0.5 + 0.5) * 2 - 1;
  const vg = (Math.sin(seed * 1.2) * 0.5 + 0.5) * 2 - 1;
  const vb = (Math.sin(seed * 1.3) * 0.5 + 0.5) * 2 - 1;

  return (
    (Math.min(255, Math.max(0, r + vr * 255 * amount)) << 16) |
    (Math.min(255, Math.max(0, g + vg * 255 * amount)) << 8) |
    Math.min(255, Math.max(0, b + vb * 255 * amount))
  );
}

function buildSpiderMesh(group: THREE.Group, a: AppearanceData): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  const bodyMat = npcMat(a.bodyColor);
  materials.push(bodyMat);

  // Abdomen
  const abdomenGeo = new THREE.SphereGeometry(a.bodyWidth * 0.6, 8, 8);
  const abdomen = new THREE.Mesh(abdomenGeo, bodyMat);
  abdomen.position.set(0, 0.5, -0.4);
  abdomen.scale.set(1, 0.8, 1.2);
  group.add(abdomen);

  // Cephalothorax (head/torso)
  const headGeo = new THREE.SphereGeometry(a.bodyWidth * 0.4, 8, 8);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 0.5, 0.2);
  group.add(head);

  // Legs (8 legs)
  const legMat = npcMat(a.legColor);
  materials.push(legMat);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const legGroup = new THREE.Group();
    legGroup.position.set(0, 0.5, 0.1);
    legGroup.rotation.y = angle;
    
    const legGeo = new THREE.CylinderGeometry(a.legRadius, a.legRadius, 0.8, 4);
    legGeo.translate(0, 0.4, 0);
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.rotation.z = Math.PI / 3;
    legGroup.add(leg);
    
    const lowerLegGeo = new THREE.CylinderGeometry(a.legRadius * 0.7, a.legRadius * 0.7, 0.8, 4);
    lowerLegGeo.translate(0, 0.4, 0);
    const lowerLeg = new THREE.Mesh(lowerLegGeo, legMat);
    lowerLeg.position.set(0.6, 0.4, 0);
    lowerLeg.rotation.z = -Math.PI / 2;
    legGroup.add(lowerLeg);

    group.add(legGroup);
  }

  // Eyes (many small eyes)
  const eyeMat = npcMat(a.eyeColor, 0.1, 0, a.eyeEmissive, a.eyeEmissiveIntensity);
  materials.push(eyeMat);
  for (let i = 0; i < 6; i++) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 4), eyeMat);
    eye.position.set((i - 2.5) * 0.08, 0.65, 0.5);
    group.add(eye);
  }

  return materials;
}

function buildWaspMesh(group: THREE.Group, a: AppearanceData): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  const bodyMat = npcMat(a.bodyColor);
  materials.push(bodyMat);

  // Abdomen (striped)
  const abdomenGeo = new THREE.SphereGeometry(a.bodyWidth * 0.5, 8, 8);
  const abdomen = new THREE.Mesh(abdomenGeo, bodyMat);
  abdomen.position.set(0, 1.2, -0.4);
  abdomen.scale.set(0.8, 0.8, 1.5);
  group.add(abdomen);

  // Thorax
  const thoraxGeo = new THREE.SphereGeometry(a.bodyWidth * 0.4, 8, 8);
  const thorax = new THREE.Mesh(thoraxGeo, npcMat(0x111111));
  thorax.position.set(0, 1.3, 0.1);
  group.add(thorax);

  // Head
  const headGeo = new THREE.SphereGeometry(a.headWidth * 0.5, 8, 8);
  const head = new THREE.Mesh(headGeo, npcMat(0x111111));
  head.position.set(0, 1.4, 0.4);
  group.add(head);

  // Wings (translucent)
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const wingGeo = new THREE.PlaneGeometry(1.2, 0.4);
  wingGeo.translate(0.6, 0, 0);
  const lWing = new THREE.Mesh(wingGeo, wingMat);
  lWing.position.set(-0.1, 1.5, 0);
  lWing.rotation.set(0, 0.5, 0.2);
  group.add(lWing);
  const rWing = lWing.clone();
  rWing.scale.x = -1;
  rWing.position.x = 0.1;
  rWing.rotation.set(0, -0.5, -0.2);
  group.add(rWing);

  // Stinger
  const stingerGeo = new THREE.ConeGeometry(0.05, 0.3, 4);
  const stinger = new THREE.Mesh(stingerGeo, npcMat(0x000000));
  stinger.position.set(0, 1.1, -1.0);
  stinger.rotation.x = -Math.PI / 2;
  group.add(stinger);

  return materials;
}

function buildQuadrupedMesh(group: THREE.Group, a: AppearanceData, style: string): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  const bodyMat = npcMat(a.bodyColor);
  materials.push(bodyMat);

  // Body
  const bodyGeo = new THREE.BoxGeometry(a.bodyWidth, a.bodyWidth, a.bodyDepth);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, a.bodyWidth / 2 + 0.2, 0);
  group.add(body);

  // Head
  const headGeo = new THREE.BoxGeometry(a.headWidth, a.headWidth, a.headDepth);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, a.bodyWidth + 0.1, a.bodyDepth / 2);
  group.add(head);

  // Snout for wolf
  if (style === 'wolf') {
    const snoutGeo = new THREE.BoxGeometry(a.headWidth * 0.6, a.headWidth * 0.4, 0.3);
    const snout = new THREE.Mesh(snoutGeo, bodyMat);
    snout.position.set(0, -0.05, a.headDepth / 2);
    head.add(snout);
  }

  // Legs (4 legs)
  const legMat = npcMat(a.legColor);
  materials.push(legMat);
  const legH = 0.5;
  const legGeo = new THREE.CylinderGeometry(a.legRadius, a.legRadius, legH, 6);
  const legPositions = [
    [-a.bodyWidth / 3, legH / 2, -a.bodyDepth / 3],
    [a.bodyWidth / 3, legH / 2, -a.bodyDepth / 3],
    [-a.bodyWidth / 3, legH / 2, a.bodyDepth / 3],
    [a.bodyWidth / 3, legH / 2, a.bodyDepth / 3],
  ];
  for (const pos of legPositions) {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(pos[0], pos[1], pos[2]);
    group.add(leg);
  }

  return materials;
}

function buildGolemMesh(group: THREE.Group, a: AppearanceData): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];
  const bodyMat = npcMat(a.bodyColor);
  materials.push(bodyMat);

  // Bulky Torso
  const bodyGeo = new THREE.BoxGeometry(a.bodyWidth, 1.2, a.bodyDepth);
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 1.0, 0);
  group.add(body);

  // Head (small, sunken)
  const headGeo = new THREE.BoxGeometry(a.headWidth, 0.4, a.headDepth);
  const head = new THREE.Mesh(headGeo, bodyMat);
  head.position.set(0, 1.7, 0.1);
  group.add(head);

  // Massive Arms
  const armMat = npcMat(a.armColor);
  materials.push(armMat);
  const armGeo = new THREE.BoxGeometry(a.armRadius * 2, 1.0, a.armRadius * 2);
  const lArm = new THREE.Mesh(armGeo, armMat);
  lArm.position.set(-(a.bodyWidth / 2 + a.armRadius), 1.2, 0);
  group.add(lArm);
  const rArm = lArm.clone();
  rArm.position.x *= -1;
  group.add(rArm);

  // Thick Legs
  const legMat = npcMat(a.legColor);
  materials.push(legMat);
  const legGeo = new THREE.BoxGeometry(a.legRadius * 2, 0.6, a.legRadius * 2);
  const lLeg = new THREE.Mesh(legGeo, legMat);
  lLeg.position.set(-a.bodyWidth / 4, 0.3, 0);
  group.add(lLeg);
  const rLeg = lLeg.clone();
  rLeg.position.x *= -1;
  group.add(rLeg);

  return materials;
}

export function getPlaceholderAppearance(style: NPCPlaceholderStyle): AppearanceData {
  switch (style) {
    case 'merchant':
      return {
        bodyWidth: 0.62, bodyDepth: 0.38, bodyColor: 0x7a5c38,
        headWidth: 0.52, headDepth: 0.48, headColor: 0xf0c888,
        eyeColor: 0xcc8833, eyeEmissive: 0xaa6622, eyeEmissiveIntensity: 0.8,
        armRadius: 0.115, armColor: 0x7a5c38,
        legRadius: 0.135, legColor: 0x4a3520,
        beltColor: 0x8b6914,
        hatRadius: 0.24, hatHeight: 0.22, hatColor: 0x5a3a18,
      };
    case 'guard':
      return {
        bodyWidth: 0.70, bodyDepth: 0.42, bodyColor: 0x6a7288,
        headWidth: 0.54, headDepth: 0.50, headColor: 0xf0c888,
        eyeColor: 0x4466aa, eyeEmissive: 0x224488, eyeEmissiveIntensity: 0.3,
        armRadius: 0.13, armColor: 0x6a7288,
        legRadius: 0.145, legColor: 0x3a4055,
        beltColor: 0x666677,
        hatRadius: 0.20, hatHeight: 0.28, hatColor: 0x5a6278,
      };
    case 'healer':
      return {
        bodyWidth: 0.56, bodyDepth: 0.34, bodyColor: 0xd8cdb8,
        headWidth: 0.52, headDepth: 0.48, headColor: 0xf5d8be,
        eyeColor: 0xffcc44, eyeEmissive: 0xddaa22, eyeEmissiveIntensity: 0.9,
        armRadius: 0.11, armColor: 0xd8cdb8,
        legRadius: 0.12, legColor: 0x9a9080,
        beltColor: 0xffdd66,
        hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case "oracle":
      return {
        bodyWidth: 0.60, bodyDepth: 0.38, bodyColor: 0x4a5a8a,
        headWidth: 0.52, headDepth: 0.52, headColor: 0xc8a070,
        eyeColor: 0xccff00, eyeEmissive: 0x88ee00, eyeEmissiveIntensity: 1.5,
        armRadius: 0.11, armColor: 0x4a5a8a,
        legRadius: 0.13, legColor: 0x223355,
        beltColor: 0x8877aa,
        hatRadius: 0.0, hatHeight: 0.0, hatColor: 0x000000,
      };
    case 'sage':
    case 'mage':
      return {
        bodyWidth: 0.52, bodyDepth: 0.32, bodyColor: 0x3d3270,
        headWidth: 0.50, headDepth: 0.46, headColor: 0xe4cfbd,
        eyeColor: 0xaa66ff, eyeEmissive: 0x7733cc, eyeEmissiveIntensity: 1.2,
        armRadius: 0.105, armColor: 0x3d3270,
        legRadius: 0.12, legColor: 0x251e40,
        beltColor: 0x553366,
        hatRadius: 0.17, hatHeight: 0.46, hatColor: 0x2a1f50,
      };
    case 'dragon':
      return {
        bodyWidth: 0.86, bodyDepth: 0.52, bodyColor: 0x1f4520,
        headWidth: 0.64, headDepth: 0.58, headColor: 0x2d5a24,
        eyeColor: 0, eyeEmissive: 0, eyeEmissiveIntensity: 0,
        armRadius: 0.16, armColor: 0x1f4520,
        legRadius: 0.18, legColor: 0x0e2010,
        beltColor: 0x0f2510,
        hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'monster':
      return {
        bodyWidth: 0.76, bodyDepth: 0.46, bodyColor: 0x5e5a42,
        headWidth: 0.58, headDepth: 0.52, headColor: 0xd8d0b0,
        eyeColor: 0, eyeEmissive: 0, eyeEmissiveIntensity: 0,
        armRadius: 0.15, armColor: 0x5e5a42,
        legRadius: 0.165, legColor: 0x383522,
        beltColor: 0x2f2f2f,
        hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'spider':
      return {
        bodyWidth: 0.8, bodyDepth: 0.8, bodyColor: 0x222222,
        headWidth: 0.4, headDepth: 0.4, headColor: 0x111111,
        eyeColor: 0xff0000, eyeEmissive: 0x880000, eyeEmissiveIntensity: 1.2,
        armRadius: 0.05, armColor: 0x222222,
        legRadius: 0.05, legColor: 0x222222,
        beltColor: 0, hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'wasp':
      return {
        bodyWidth: 0.5, bodyDepth: 0.5, bodyColor: 0xffcc00,
        headWidth: 0.3, headDepth: 0.3, headColor: 0x111111,
        eyeColor: 0x000000, eyeEmissive: 0, eyeEmissiveIntensity: 0,
        armRadius: 0.02, armColor: 0x000000,
        legRadius: 0.02, legColor: 0x000000,
        beltColor: 0, hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'wolf':
      return {
        bodyWidth: 0.6, bodyDepth: 1.2, bodyColor: 0x666666,
        headWidth: 0.4, headDepth: 0.5, headColor: 0x666666,
        eyeColor: 0xffff00, eyeEmissive: 0x888800, eyeEmissiveIntensity: 0.8,
        armRadius: 0.1, armColor: 0x666666,
        legRadius: 0.1, legColor: 0x666666,
        beltColor: 0, hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'golem':
      return {
        bodyWidth: 1.2, bodyDepth: 0.8, bodyColor: 0x888888,
        headWidth: 0.6, headDepth: 0.6, headColor: 0x888888,
        eyeColor: 0x00ffff, eyeEmissive: 0x008888, eyeEmissiveIntensity: 1.5,
        armRadius: 0.25, armColor: 0x888888,
        legRadius: 0.3, legColor: 0x888888,
        beltColor: 0x444444,
        hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'boar':
      return {
        bodyWidth: 0.8, bodyDepth: 1.3, bodyColor: 0x4a3520,
        headWidth: 0.5, headDepth: 0.6, headColor: 0x4a3520,
        eyeColor: 0xff0000, eyeEmissive: 0x440000, eyeEmissiveIntensity: 0.5,
        armRadius: 0.12, armColor: 0x4a3520,
        legRadius: 0.15, legColor: 0x4a3520,
        beltColor: 0, hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'orc':
      return {
        bodyWidth: 0.80, bodyDepth: 0.46, bodyColor: 0x3d6b2a,
        headWidth: 0.60, headDepth: 0.54, headColor: 0x3d6b2a,
        eyeColor: 0xffcc22, eyeEmissive: 0xdd9900, eyeEmissiveIntensity: 1.5,
        armRadius: 0.155, armColor: 0x3d6b2a,
        legRadius: 0.17, legColor: 0x26491b,
        beltColor: 0x5f1f1f,
        hatRadius: 0.09, hatHeight: 0.30, hatColor: 0x111111,
      };
    case 'undead':
      return {
        bodyWidth: 0.50, bodyDepth: 0.30, bodyColor: 0x3a3d35,
        headWidth: 0.48, headDepth: 0.44, headColor: 0xc8c8c0,
        eyeColor: 0, eyeEmissive: 0, eyeEmissiveIntensity: 0,
        armRadius: 0.09, armColor: 0x6e7a6e,
        legRadius: 0.10, legColor: 0x1a1a14,
        beltColor: 0x1a1f1a,
        hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'civilian':
      return {
        bodyWidth: 0.60, bodyDepth: 0.36, bodyColor: 0x5d4037,
        headWidth: 0.52, headDepth: 0.48, headColor: 0xe0ac69,
        eyeColor: 0x5a3311, eyeEmissive: 0, eyeEmissiveIntensity: 0,
        armRadius: 0.115, armColor: 0x5d4037,
        legRadius: 0.13, legColor: 0x212121,
        beltColor: 0x3e2723,
        hatRadius: 0, hatHeight: 0, hatColor: 0,
      };
    case 'pyromancer':
      return {
        bodyWidth: 0.54, bodyDepth: 0.34, bodyColor: 0x6a1a06,
        headWidth: 0.50, headDepth: 0.46, headColor: 0xe8b890,
        eyeColor: 0xff6600, eyeEmissive: 0xff3300, eyeEmissiveIntensity: 1.8,
        armRadius: 0.105, armColor: 0x6a1a06,
        legRadius: 0.12, legColor: 0x3c1408,
        beltColor: 0xcc4400,
        hatRadius: 0.17, hatHeight: 0.46, hatColor: 0x4a0f02,
      };
    case 'cryomancer':
      return {
        bodyWidth: 0.54, bodyDepth: 0.34, bodyColor: 0x2a4a7a,
        headWidth: 0.50, headDepth: 0.46, headColor: 0xe0ecf8,
        eyeColor: 0x88ccff, eyeEmissive: 0x4499dd, eyeEmissiveIntensity: 1.4,
        armRadius: 0.105, armColor: 0x2a4a7a,
        legRadius: 0.12, legColor: 0x1a2a44,
        beltColor: 0x66aadd,
        hatRadius: 0.17, hatHeight: 0.46, hatColor: 0x1a3a6a,
      };
    default:
      throw new Error(`Unknown NPC placeholder style: ${style}`);
  }
}
