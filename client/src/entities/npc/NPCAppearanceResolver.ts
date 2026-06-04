/**
 * Pure resolver: maps NPC identity → AppearanceSpec.
 * No THREE.js. No DOM. Fully unit-testable.
 *
 * Resolution priority (highest → lowest):
 *   1. Explicit appearance.mesh from manifest/server (authored override)
 *   2. npc_individual_<id> if registered (unique authored mesh)
 *   3. npc_style_<style> if style provided and registered
 *   4. Keyword inference via getNPCPlaceholderStyle → npc_style_<inferred>
 */
import { hasMesh } from '../../meshes/core/MeshRegistry';
import { getNPCPlaceholderStyle, hashString } from '../NPCModels';
import type { NPCAppearanceOverride } from '../NPCModels';
import type { NPCBehavior } from '../NPCMotion';

export interface NPCIdentityInput {
  id: string;
  name: string;
  behavior?: NPCBehavior;
  style?: string;
  appearance?: NPCAppearanceOverride;
}

export interface AppearanceSpec {
  meshType: string;
  seed: number;
  palette?: Record<string, number>;
  scale?: number;
}

export function resolveAppearance(identity: NPCIdentityInput): AppearanceSpec {
  const seed = hashString(identity.id);
  const paletteOverride = identity.appearance?.palette;
  const scaleOverride = identity.appearance?.scale;

  // Priority 1: explicit appearance.mesh from manifest/server
  if (identity.appearance?.mesh) {
    const type = identity.appearance.mesh;
    if (hasMesh(type)) {
      return { meshType: type, seed, palette: paletteOverride, scale: scaleOverride };
    }
  }

  // Priority 2: per-id individual mesh
  const individualType = `npc_individual_${identity.id}`;
  if (hasMesh(individualType)) {
    return { meshType: individualType, seed, palette: paletteOverride, scale: scaleOverride };
  }

  // Priority 3: explicit style from manifest/server
  if (identity.style) {
    const styleType = `npc_style_${identity.style}`;
    if (hasMesh(styleType)) {
      return { meshType: styleType, seed, palette: paletteOverride, scale: scaleOverride };
    }
  }

  // Priority 4: keyword inference
  const inferredStyle = getNPCPlaceholderStyle(identity.id, identity.name, identity.behavior);
  return {
    meshType: `npc_style_${inferredStyle}`,
    seed,
    palette: paletteOverride,
    scale: scaleOverride,
  };
}
