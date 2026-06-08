import * as THREE from 'three';
import type { BuildContext, MeshCategory, Mesh, MeshClass } from './Mesh';

/** type string → reusable mesh instance. Populated by registerMesh() at import time. */
const registry = new Map<string, Mesh>();
/** type string → category, kept alongside instances for cheap filtering. */
const categories = new Map<string, MeshCategory>();

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

  // Register any alias type strings against the same instance.
  for (const alias of cls.aliases ?? []) {
    if (registry.has(alias)) {
      throw new Error(`Duplicate mesh type "${alias}" (alias of "${cls.type}") registered.`);
    }
    registry.set(alias, instance);
    categories.set(alias, cls.category);
  }
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
  return mesh.build(ctx);
}

/** List every registered type, optionally filtered by category (for tooling/export). */
export function meshTypes(category?: MeshCategory): string[] {
  if (!category) return Array.from(registry.keys());
  return Array.from(categories.entries())
    .filter(([, cat]) => cat === category)
    .map(([type]) => type);
}
