/**
 * NPCAppearance — Procedural mesh building for NPCs.
 *
 * Handles mesh geometry creation (body, shoulders, belt, head, legs, hat)
 * and role-based appearance customization.
 */

import * as THREE from 'three';
import type { NPCPlaceholderStyle } from './NPCModels';

export interface AppearanceData {
  bodyTopRadius: number;
  bodyBottomRadius: number;
  bodyHeight: number;
  bodyY: number;
  bodySegments: number;
  bodyColor: number;
  shoulderRadius: number;
  shoulderOffset: number;
  shoulderY: number;
  beltRadius: number;
  beltTube: number;
  beltY: number;
  beltColor: number;
  headRadius: number;
  headY: number;
  headColor: number;
  legWidth: number;
  legHeight: number;
  legDepth: number;
  legOffset: number;
  legY: number;
  legColor: number;
  hatRadius: number;
  hatHeight: number;
  hatY: number;
  hatColor?: number;
}

/**
 * Darken a hex color by a percentage.
 */
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

/**
 * Get appearance parameters for a given NPC style.
 */
export function getPlaceholderAppearance(style: NPCPlaceholderStyle): AppearanceData {
  switch (style) {
    case 'merchant':
      return {
        bodyTopRadius: 0.36,
        bodyBottomRadius: 0.42,
        bodyHeight: 1.3,
        bodyY: 1.45,
        bodySegments: 10,
        bodyColor: 0xa67c52,
        shoulderRadius: 0.12,
        shoulderOffset: 0.28,
        shoulderY: 2.0,
        beltRadius: 0.34,
        beltTube: 0.04,
        beltY: 1.05,
        beltColor: 0x8b6914,
        headRadius: 0.24,
        headY: 2.26,
        headColor: 0xf3cfaf,
        legWidth: 0.15,
        legHeight: 0.62,
        legDepth: 0.15,
        legOffset: 0.12,
        legY: 0.42,
        legColor: 0x5d4037,
        hatRadius: 0.16,
        hatHeight: 0.3,
        hatY: 2.56,
      };
    case 'guard':
      return {
        bodyTopRadius: 0.42,
        bodyBottomRadius: 0.46,
        bodyHeight: 1.55,
        bodyY: 1.58,
        bodySegments: 10,
        bodyColor: 0x8b8f9c,
        shoulderRadius: 0.16,
        shoulderOffset: 0.4,
        shoulderY: 2.15,
        beltRadius: 0.37,
        beltTube: 0.045,
        beltY: 1.18,
        beltColor: 0x666677,
        headRadius: 0.26,
        headY: 2.5,
        headColor: 0xf2d0b0,
        legWidth: 0.17,
        legHeight: 0.72,
        legDepth: 0.17,
        legOffset: 0.15,
        legY: 0.45,
        legColor: 0x4b4f59,
        hatRadius: 0.1,
        hatHeight: 0.18,
        hatY: 2.96,
      };
    case 'healer':
      return {
        bodyTopRadius: 0.28,
        bodyBottomRadius: 0.32,
        bodyHeight: 1.45,
        bodyY: 1.5,
        bodySegments: 10,
        bodyColor: 0xc8b7a4,
        shoulderRadius: 0.12,
        shoulderOffset: 0.28,
        shoulderY: 2.06,
        beltRadius: 0.3,
        beltTube: 0.035,
        beltY: 1.08,
        beltColor: 0xffdd66,
        headRadius: 0.24,
        headY: 2.42,
        headColor: 0xf5d8be,
        legWidth: 0.13,
        legHeight: 0.68,
        legDepth: 0.13,
        legOffset: 0.11,
        legY: 0.44,
        legColor: 0x7b6a5c,
        hatRadius: 0.16,
        hatHeight: 0.24,
        hatY: 2.72,
      };
    case 'sage':
    case 'mage':
      return {
        bodyTopRadius: 0.3,
        bodyBottomRadius: 0.34,
        bodyHeight: 1.5,
        bodyY: 1.53,
        bodySegments: 10,
        bodyColor: 0x4b3f7a,
        shoulderRadius: 0.12,
        shoulderOffset: 0.3,
        shoulderY: 2.08,
        beltRadius: 0.31,
        beltTube: 0.035,
        beltY: 1.1,
        beltColor: 0x553366,
        headRadius: 0.24,
        headY: 2.44,
        headColor: 0xe4cfbd,
        legWidth: 0.12,
        legHeight: 0.68,
        legDepth: 0.12,
        legOffset: 0.11,
        legY: 0.44,
        legColor: 0x2f254d,
        hatRadius: 0.17,
        hatHeight: 0.4,
        hatY: 2.86,
      };
    case 'dragon':
      return {
        bodyTopRadius: 0.44,
        bodyBottomRadius: 0.52,
        bodyHeight: 1.7,
        bodyY: 1.65,
        bodySegments: 12,
        bodyColor: 0x1f4520,
        shoulderRadius: 0.17,
        shoulderOffset: 0.42,
        shoulderY: 2.24,
        beltRadius: 0.38,
        beltTube: 0.055,
        beltY: 1.25,
        beltColor: 0x0f2510,
        headRadius: 0.29,
        headY: 2.74,
        headColor: 0x2d5a24,
        legWidth: 0.19,
        legHeight: 0.74,
        legDepth: 0.19,
        legOffset: 0.15,
        legY: 0.45,
        legColor: 0x0e2010,
        hatRadius: 0.001,
        hatHeight: 0.001,
        hatY: 0,
        hatColor: 0x000000,
      };
    case 'monster':
      return {
        bodyTopRadius: 0.48,
        bodyBottomRadius: 0.54,
        bodyHeight: 1.48,
        bodyY: 1.48,
        bodySegments: 10,
        bodyColor: 0x5e5a42,
        shoulderRadius: 0.18,
        shoulderOffset: 0.42,
        shoulderY: 2.1,
        beltRadius: 0.34,
        beltTube: 0.04,
        beltY: 1.12,
        beltColor: 0x2f2f2f,
        headRadius: 0.23,
        headY: 2.34,
        headColor: 0xd8d0b0,
        legWidth: 0.18,
        legHeight: 0.68,
        legDepth: 0.18,
        legOffset: 0.14,
        legY: 0.44,
        legColor: 0x383522,
        hatRadius: 0.12,
        hatHeight: 0.2,
        hatY: 2.82,
      };
    case 'orc':
      return {
        bodyTopRadius: 0.44,
        bodyBottomRadius: 0.5,
        bodyHeight: 1.58,
        bodyY: 1.58,
        bodySegments: 10,
        bodyColor: 0x3d6b2a,
        shoulderRadius: 0.17,
        shoulderOffset: 0.42,
        shoulderY: 2.16,
        beltRadius: 0.38,
        beltTube: 0.045,
        beltY: 1.15,
        beltColor: 0x5f1f1f,
        headRadius: 0.27,
        headY: 2.5,
        headColor: 0xbda98a,
        legWidth: 0.18,
        legHeight: 0.72,
        legDepth: 0.18,
        legOffset: 0.15,
        legY: 0.45,
        legColor: 0x26491b,
        hatRadius: 0.1,
        hatHeight: 0.18,
        hatY: 2.96,
      };
    case 'undead':
      return {
        bodyTopRadius: 0.22,
        bodyBottomRadius: 0.26,
        bodyHeight: 1.5,
        bodyY: 1.52,
        bodySegments: 8,
        bodyColor: 0x3a3d35,
        shoulderRadius: 0.09,
        shoulderOffset: 0.22,
        shoulderY: 2.06,
        beltRadius: 0.24,
        beltTube: 0.025,
        beltY: 1.1,
        beltColor: 0x1a1f1a,
        headRadius: 0.24,
        headY: 2.42,
        headColor: 0xc8c8c0,
        legWidth: 0.1,
        legHeight: 0.64,
        legDepth: 0.1,
        legOffset: 0.08,
        legY: 0.43,
        legColor: 0x1a1a14,
        hatRadius: 0.15,
        hatHeight: 0.3,
        hatY: 2.74,
      };
    case 'pyromancer':
      return {
        bodyTopRadius: 0.3,
        bodyBottomRadius: 0.34,
        bodyHeight: 1.5,
        bodyY: 1.53,
        bodySegments: 10,
        bodyColor: 0x6a1a06,
        shoulderRadius: 0.12,
        shoulderOffset: 0.3,
        shoulderY: 2.08,
        beltRadius: 0.31,
        beltTube: 0.035,
        beltY: 1.1,
        beltColor: 0xcc4400,
        headRadius: 0.24,
        headY: 2.44,
        headColor: 0xe8b890,
        legWidth: 0.12,
        legHeight: 0.68,
        legDepth: 0.12,
        legOffset: 0.11,
        legY: 0.44,
        legColor: 0x3c1408,
        hatRadius: 0.17,
        hatHeight: 0.4,
        hatY: 2.86,
        hatColor: 0x6a1a06,
      };
    case 'cryomancer':
      return {
        bodyTopRadius: 0.3,
        bodyBottomRadius: 0.34,
        bodyHeight: 1.5,
        bodyY: 1.53,
        bodySegments: 10,
        bodyColor: 0x2a4a7a,
        shoulderRadius: 0.12,
        shoulderOffset: 0.3,
        shoulderY: 2.08,
        beltRadius: 0.31,
        beltTube: 0.035,
        beltY: 1.1,
        beltColor: 0x66aadd,
        headRadius: 0.24,
        headY: 2.44,
        headColor: 0xe0ecf8,
        legWidth: 0.12,
        legHeight: 0.68,
        legDepth: 0.12,
        legOffset: 0.11,
        legY: 0.44,
        legColor: 0x1a2a44,
        hatRadius: 0.17,
        hatHeight: 0.4,
        hatY: 2.86,
        hatColor: 0x1a3a5a,
      };
    default:
      throw new Error(`Unknown NPC placeholder style: ${style}`);
  }
}

/**
 * Build procedural mesh for NPC appearance.
 * Returns array of materials for later material management.
 */
export function buildProceduralMesh(
  mesh: THREE.Group,
  appearance: AppearanceData,
  color: number,
): THREE.MeshStandardMaterial[] {
  const materials: THREE.MeshStandardMaterial[] = [];

  // Body
  const bodyGeo = new THREE.CylinderGeometry(
    appearance.bodyTopRadius,
    appearance.bodyBottomRadius,
    appearance.bodyHeight,
    appearance.bodySegments,
  );
  const bodyMat = new THREE.MeshStandardMaterial({
    color: appearance.bodyColor ?? color,
    flatShading: true,
    roughness: 0.95,
    metalness: 0.02,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.name = 'body';
  body.position.y = appearance.bodyY;
  body.castShadow = true;
  mesh.add(body);
  materials.push(bodyMat);

  // Shoulders
  const shoulderGeo = new THREE.SphereGeometry(appearance.shoulderRadius, 8, 6);
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: darken(appearance.bodyColor ?? color, 0.15),
    flatShading: true,
    roughness: 0.9,
    metalness: 0.03,
  });
  const leftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
  leftShoulder.name = 'leftShoulder';
  leftShoulder.position.set(-appearance.shoulderOffset, appearance.shoulderY, 0);
  mesh.add(leftShoulder);

  const rightShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
  rightShoulder.name = 'rightShoulder';
  rightShoulder.position.set(appearance.shoulderOffset, appearance.shoulderY, 0);
  mesh.add(rightShoulder);
  materials.push(shoulderMat);

  // Belt
  const beltGeo = new THREE.TorusGeometry(appearance.beltRadius, appearance.beltTube, 6, 16);
  const beltMat = new THREE.MeshStandardMaterial({
    color: appearance.beltColor,
    flatShading: true,
    roughness: 0.72,
    metalness: 0.06,
  });
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.name = 'belt';
  belt.position.y = appearance.beltY;
  belt.rotation.x = Math.PI / 2;
  mesh.add(belt);
  materials.push(beltMat);

  // Head
  const headGeo = new THREE.SphereGeometry(appearance.headRadius, 12, 10);
  const headMat = new THREE.MeshStandardMaterial({
    color: appearance.headColor,
    flatShading: true,
    roughness: 0.98,
    metalness: 0.0,
  });
  const head = new THREE.Mesh(headGeo, headMat);
  head.name = 'head';
  head.position.y = appearance.headY;
  head.castShadow = true;
  mesh.add(head);
  materials.push(headMat);

  // Legs
  const legGeo = new THREE.BoxGeometry(appearance.legWidth, appearance.legHeight, appearance.legDepth);
  const legMat = new THREE.MeshStandardMaterial({
    color: appearance.legColor,
    flatShading: true,
    roughness: 0.96,
    metalness: 0.01,
  });

  const leftLeg = new THREE.Mesh(legGeo, legMat);
  leftLeg.name = 'leftLeg';
  leftLeg.position.set(-appearance.legOffset, appearance.legY, 0);
  mesh.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, legMat);
  rightLeg.name = 'rightLeg';
  rightLeg.position.set(appearance.legOffset, appearance.legY, 0);
  mesh.add(rightLeg);

  materials.push(legMat);

  // Hat
  const hatGeo = new THREE.ConeGeometry(appearance.hatRadius, appearance.hatHeight, 8);
  const hatMat = new THREE.MeshStandardMaterial({
    color: appearance.hatColor ?? darken(color, 0.4),
    flatShading: true,
    roughness: 0.88,
    metalness: 0.03,
  });
  const hat = new THREE.Mesh(hatGeo, hatMat);
  hat.name = 'hat';
  hat.position.y = appearance.hatY;
  mesh.add(hat);
  materials.push(hatMat);

  return materials;
}
