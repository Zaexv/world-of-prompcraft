import * as THREE from 'three';
import { buildMesh } from '../../meshes/core/MeshRegistry';
import { addPlaceholderAccessory, addNPCVisualOutline, applyFlatShading } from '../NPCAccessories';
import type { NPCPlaceholderStyle } from '../NPCModels';
import type { AppearanceSpec } from './NPCAppearanceResolver';

export interface NPCBuiltMesh {
  object3D: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
}

/**
 * Builds a complete NPC mesh from an AppearanceSpec.
 * Accessories, outlines, and flat-shading are applied here so the NPC entity
 * has zero appearance knowledge.
 * All MeshStandardMaterials are cloned per-instance so highlight/tint cannot
 * bleed across NPCs sharing the same registered mesh.
 */
export function buildNPCMesh(
  spec: AppearanceSpec,
  position: THREE.Vector3,
  npcId: string,
): NPCBuiltMesh {
  const ctx = {
    position: position.clone(),
    scale: spec.scale ?? 1,
    label: npcId,
  };

  const builtObj = buildMesh(spec.meshType, ctx);
  if (!builtObj) {
    console.warn(`[NPCMeshFactory] Unknown mesh type "${spec.meshType}" — using empty group.`);
    return { object3D: new THREE.Group(), materials: [] };
  }

  const group = builtObj as THREE.Group;

  const style = extractStyle(spec.meshType);
  if (style) {
    addPlaceholderAccessory(group, style);
    addNPCVisualOutline(group, style);
  }
  applyFlatShading(group);

  const materials = cloneInstanceMaterials(group);
  return { object3D: group, materials };
}

function extractStyle(meshType: string): NPCPlaceholderStyle | null {
  const match = /^npc_style_(.+)$/.exec(meshType);
  return match ? (match[1] as NPCPlaceholderStyle) : null;
}

/** Clone all MeshStandardMaterials in-place so each NPC owns its own instances. */
function cloneInstanceMaterials(object3D: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const mats: THREE.MeshStandardMaterial[] = [];
  object3D.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const mat = child.material;
      if (mat instanceof THREE.MeshStandardMaterial) {
        const cloned = mat.clone();
        child.material = cloned;
        mats.push(cloned);
      }
    }
  });
  return mats;
}
