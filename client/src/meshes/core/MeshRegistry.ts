import * as THREE from 'three';
import type { BuildContext, MeshCategory, Mesh, MeshClass } from './Mesh';
import { mergeStaticByMaterial } from './mergeStatic';

/**
 * Categories whose meshes are static geometry and safe to collapse to one draw
 * per material. NPCs are skeletal/animated and must stay split.
 */
const MERGEABLE_CATEGORIES: ReadonlySet<MeshCategory> = new Set<MeshCategory>([
  'building',
  'prop',
  'vegetation',
]);

/** type string → reusable mesh instance. Populated by registerMesh() at import time. */
const registry = new Map<string, Mesh>();
/** type string → category, kept alongside instances for cheap filtering. */
const categories = new Map<string, MeshCategory>();
/** type strings opted into cross-instance GPU instancing (see Mesh.instanceable). */
const instanceableTypes = new Set<string>();

/**
 * Register a mesh class. Called at module load (side effect) from each mesh file.
 * One reusable instance is created per type — build() must stay stateless.
 */
export function registerMesh(cls: MeshClass): void {
  if (!cls.type) {
    throw new Error(`Mesh class ${cls.name ?? '<anonymous>'} is missing a static "type".`);
  }
  if (registry.has(cls.type)) {
    throw new Error(`Duplicate mesh type "${cls.type}" registered.`);
  }
  const instance = new cls();
  registry.set(cls.type, instance);
  categories.set(cls.type, cls.category);
  if (cls.instanceable) instanceableTypes.add(cls.type);

  // Register any alias type strings against the same instance.
  for (const alias of cls.aliases ?? []) {
    if (registry.has(alias)) {
      throw new Error(`Duplicate mesh type "${alias}" (alias of "${cls.type}") registered.`);
    }
    registry.set(alias, instance);
    categories.set(alias, cls.category);
    if (cls.instanceable) instanceableTypes.add(alias);
  }
}

/** True if a mesh type opted into cross-instance GPU instancing. */
export function isInstanceable(type: string): boolean {
  return instanceableTypes.has(type);
}

/** True if a mesh type is known to the registry. */
export function hasMesh(type: string): boolean {
  return registry.has(type);
}

/** Get the category of a registered mesh type. */
export function meshCategory(type: string): MeshCategory | undefined {
  return categories.get(type);
}

/**
 * Build a registered mesh. Returns undefined if the type is unknown so callers
 * can fall back to a legacy path during migration.
 */
export function buildMesh(type: string, ctx: BuildContext): THREE.Object3D | undefined {
  const mesh = registry.get(type);
  if (!mesh) return undefined;
  const obj = mesh.build(ctx);

  // Collapse static meshes to one draw per material — the renderer was draw-call
  // bound (5000+ draws of ~30 triangles each). A bare Mesh has nothing to
  // collapse. `userData.noMerge` on the root opts a mesh out (e.g. an animated
  // opaque sub-mesh). Groups already merged inside withLOD carry
  // `userData.merged` and are skipped.
  if (obj.userData.noMerge !== true && MERGEABLE_CATEGORIES.has(categories.get(type)!)) {
    if (obj instanceof THREE.Group && obj.userData.merged !== true) {
      mergeStaticByMaterial(obj);
    } else if (obj instanceof THREE.LOD) {
      // Self-built LODs (e.g. palm tree: ~324 meshes/level) bypass withLOD —
      // merge each level's group. Levels derived from an already-merged level
      // (kit makeReducedLevel clones) inherit `merged` and are skipped.
      for (const level of obj.levels) {
        const g = level.object;
        if (g instanceof THREE.Group && g.userData.merged !== true) {
          mergeStaticByMaterial(g);
        }
      }
    }
  }
  return obj;
}

/** List every registered type, optionally filtered by category (for tooling/export). */
export function meshTypes(category?: MeshCategory): string[] {
  if (!category) return Array.from(registry.keys());
  return Array.from(categories.entries())
    .filter(([, cat]) => cat === category)
    .map(([type]) => type);
}
