import * as THREE from 'three';
import { buildMesh } from '../../meshes/core/MeshRegistry';
import { mergeStaticByMaterial } from '../../meshes/core/mergeStatic';
import { addPlaceholderAccessory, addNPCVisualOutline, applyFlatShading } from '../NPCAccessories';
import type { NPCPlaceholderStyle } from '../NPCModels';
import type { AppearanceSpec } from './NPCAppearanceResolver';

/** Set false to disable NPC geometry merging (debug visual issues). */
const MERGE_NPC_RIG = true;

/** Rig nodes the animator rotates per-frame — kept intact (merged within, not flattened). */
const ANIMATED_NODES = ['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'cloak', 'head'] as const;

/**
 * Property signature for NPC materials: `vmat`/`npcMat` create a fresh material
 * per box, so merging by instance uuid would collapse nothing. Visually-identical
 * materials (same colour/finish/maps/flags) share this key and merge into one
 * draw. MUST include every field that affects appearance or the program.
 */
function npcMaterialKey(m: THREE.Material): string {
  const s = m as THREE.MeshStandardMaterial;
  return [
    s.color?.getHexString?.() ?? '',
    s.roughness ?? '', s.metalness ?? '',
    s.emissive?.getHexString?.() ?? '', s.emissiveIntensity ?? '',
    s.map?.uuid ?? '', s.normalMap?.uuid ?? '', s.roughnessMap?.uuid ?? '',
    s.metalnessMap?.uuid ?? '', s.emissiveMap?.uuid ?? '',
    s.flatShading ? 1 : 0, s.transparent ? 1 : 0, s.opacity ?? 1, s.side,
    (m.userData?.charMatKind as string) ?? '',
  ].join('|');
}

/**
 * Collapse a rigged NPC's STATIC geometry (torso + accessories + their outline
 * shells) into one draw per material-look, while keeping the animator's nodes
 * (limbs/cloak/head) intact and movable — each is detached, the static remainder
 * is merged, the nodes are re-attached at their exact transform, then merged
 * internally (their own sub-parts are static relative to the limb). Limbs are
 * direct children of the root with un-rotated parents, so pivots are preserved.
 */
function mergeRiggedCharacter(group: THREE.Group): void {
  group.updateMatrixWorld(true);
  const rootInv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const detached: { node: THREE.Object3D; local: THREE.Matrix4 }[] = [];
  for (const name of ANIMATED_NODES) {
    const node = group.getObjectByName(name);
    if (node?.parent) {
      detached.push({ node, local: new THREE.Matrix4().multiplyMatrices(rootInv, node.matrixWorld) });
      node.removeFromParent();
    }
  }
  mergeStaticByMaterial(group, { materialKey: npcMaterialKey });
  for (const { node, local } of detached) {
    local.decompose(node.position, node.quaternion, node.scale);
    node.matrixAutoUpdate = true;
    group.add(node);
    if (node instanceof THREE.Group) mergeStaticByMaterial(node, { materialKey: npcMaterialKey });
  }
}

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

  // Collapse static geometry to ~1 draw per material-look BEFORE cloning
  // materials, so highlight/tint still works on the merged result. Limbs stay
  // animated. 60 NPCs × dozens of boxes (+ per-part outline shells) was a large
  // chunk of the fort draw count.
  if (MERGE_NPC_RIG) mergeRiggedCharacter(group);

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
