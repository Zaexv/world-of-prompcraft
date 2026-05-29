/**
 * NPCAppearance — Roblox-style procedural mesh for NPCs.
 * Optimized with Singleton Geometry & Material caching.
 */
import { applyCharacterPBR } from '../utils/PBRMaps';
import * as THREE from 'three';
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
  const a = appearance;
  const materials: THREE.MeshStandardMaterial[] = [];
  const ARM_X = a.bodyWidth / 2 + a.armRadius + 0.02;
  const LEG_X = a.bodyWidth / 4;

  // ── Torso ──
  const bodyGeo = getSharedGeo(`${style}_body`, () => new THREE.BoxGeometry(a.bodyWidth, 0.88, a.bodyDepth));
  const bodyMat = getSharedMat(`${style}_body`, () => npcMat(a.bodyColor));
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
  const headMat = getSharedMat(`${style}_head`, () => npcMat(a.headColor, 0.88));
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
