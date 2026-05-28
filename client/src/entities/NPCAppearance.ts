/**
 * NPCAppearance — Roblox-style procedural mesh for NPCs.
 * Box torso, box head, cylinder arms/legs — same proportions grid as Player.
 */
import { applyCharacterPBR } from '../utils/PBRMaps';

import * as THREE from 'three';
import type { NPCPlaceholderStyle } from './NPCModels';

// ── Shared proportions grid (must match RaceModels.ts / Player.ts) ────────────
export const NPC_Y_LEG   = 0.44;
export const NPC_Y_TORSO = 1.29;
export const NPC_Y_ARM   = 1.40;
export const NPC_Y_HEAD  = 1.99;
export const NPC_HEAD_HALF = 0.26; // half of fixed head height 0.52
// Derived helpers for accessories
export const NPC_TORSO_TOP = NPC_Y_TORSO + 0.44; // 1.73
export const NPC_HEAD_TOP  = NPC_Y_HEAD + NPC_HEAD_HALF; // 2.25

export interface AppearanceData {
  // Box torso (height always 0.88)
  bodyWidth: number;
  bodyDepth: number;
  bodyColor: number;
  // Box head (height always 0.52)
  headWidth: number;
  headDepth: number;
  headColor: number;
  // Eyes — set emissiveIntensity=0 to skip (accessory handles it instead)
  eyeColor: number;
  eyeEmissive: number;
  eyeEmissiveIntensity: number;
  // Cylinder arms
  armRadius: number;
  armColor: number;
  // Cylinder legs
  legRadius: number;
  legColor: number;
  // Belt
  beltColor: number;
  // Cone hat on top of head (radius=0 → skip)
  hatRadius: number;
  hatHeight: number;
  hatColor: number;
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

export function buildProceduralMesh(
  group: THREE.Group,
  appearance: AppearanceData,
  _color: number,
): THREE.MeshStandardMaterial[] {
  const a = appearance;
  const materials: THREE.MeshStandardMaterial[] = [];
  const ARM_X = a.bodyWidth / 2 + a.armRadius + 0.02;
  const LEG_X = a.bodyWidth / 4;

  // ── Torso ──
  const bodyMat = npcMat(a.bodyColor);
  const body = new THREE.Mesh(new THREE.BoxGeometry(a.bodyWidth, 0.88, a.bodyDepth), bodyMat);
  body.name = 'body';
  body.position.y = NPC_Y_TORSO;
  body.castShadow = true;
  group.add(body);
  materials.push(bodyMat);

  // Belt
  const beltMat = npcMat(a.beltColor, 0.6, 0.15);
  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(a.bodyWidth / 2 - 0.01, 0.028, 5, 14),
    beltMat,
  );
  belt.name = 'belt';
  belt.position.y = NPC_Y_TORSO - 0.28;
  belt.rotation.x = Math.PI / 2;
  group.add(belt);
  materials.push(beltMat);

  // ── Head ──
  const headMat = npcMat(a.headColor, 0.88);
  const head = new THREE.Mesh(new THREE.BoxGeometry(a.headWidth, 0.52, a.headDepth), headMat);
  head.name = 'head';
  head.position.y = NPC_Y_HEAD;
  head.castShadow = true;
  group.add(head);
  materials.push(headMat);

  // Eyes (skip if intensity=0 — accessory provides custom eyes for that style)
  if (a.eyeEmissiveIntensity > 0) {
    const eyeMat = npcMat(a.eyeColor, 0.05, 0, a.eyeEmissive, a.eyeEmissiveIntensity);
    const eyeGeo = new THREE.SphereGeometry(0.046, 8, 6);
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
    const hatMat = npcMat(a.hatColor);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(a.hatRadius, a.hatHeight, 8), hatMat);
    hat.name = 'hat';
    hat.position.y = NPC_HEAD_TOP + a.hatHeight / 2;
    group.add(hat);
    materials.push(hatMat);
  }

  // ── Arms ──
  const armMat = npcMat(a.armColor, 0.78);
  const armGeo = new THREE.CylinderGeometry(a.armRadius, a.armRadius, 0.66, 10);
  const handGeo = new THREE.SphereGeometry(a.armRadius + 0.01, 8, 5);

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
  const legMat = npcMat(a.legColor, 0.75);
  const legGeo = new THREE.CylinderGeometry(a.legRadius, a.legRadius, 0.82, 10);
  const bootMat = npcMat(darken(a.legColor, 0.22), 0.80);
  const bootGeo = new THREE.CylinderGeometry(a.legRadius + 0.01, a.legRadius + 0.02, 0.22, 10);
  const toeGeo  = new THREE.SphereGeometry(a.legRadius + 0.015, 8, 5);

  const lLeg = new THREE.Mesh(legGeo, legMat);
  lLeg.name = 'leftLeg';
  lLeg.position.set(-LEG_X, NPC_Y_LEG, 0);
  lLeg.castShadow = true;
  group.add(lLeg);
  const lBoot = childMesh(lLeg, bootGeo, bootMat, 0, -0.38, 0);
  childMesh(lBoot, toeGeo, bootMat, 0, -0.09, 0.04);

  const rLeg = new THREE.Mesh(legGeo, legMat);
  rLeg.name = 'rightLeg';
  rLeg.position.set(LEG_X, NPC_Y_LEG, 0);
  rLeg.castShadow = true;
  group.add(rLeg);
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
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive: emissive !== undefined && emissive !== 0 ? new THREE.Color(emissive) : undefined,
    emissiveIntensity,
    flatShading: true,
  });
}

function childMesh(
  parent: THREE.Mesh,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const child = new THREE.Mesh(geo, mat);
  child.position.set(x, y, z);
  parent.add(child);
  return child;
}

export function applyFlatShading(group: THREE.Group): void {
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      for (const mat of mats) {
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.flatShading = true;
          mat.needsUpdate = true;
        }
      }
    }
  });
}
