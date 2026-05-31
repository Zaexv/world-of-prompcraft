/**
 * Mesh catalog entry point.
 *
 * Importing this module registers every mesh class with the MeshRegistry and
 * exposes the catalog API (`buildMesh`, `meshTypes`, …). Map generation imports
 * from here only — never from individual geometry files.
 */

// Register all meshes (side-effect imports).
import './buildings';

export { Mesh } from './core/Mesh';
export type { BuildContext, MeshCategory, MeshClass } from './core/Mesh';
export { registerMesh, buildMesh, hasMesh, meshTypes } from './core/MeshRegistry';
export { BIOME_BUILDINGS, selectBiomeBuildingType } from './buildings/biome/BiomeBuildings';
