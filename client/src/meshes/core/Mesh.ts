import * as THREE from 'three';
import type { Rng } from '../../systems/worldbuilder/RngTypes';

/** Category used by map generation to filter what may be placed where. */
export type MeshCategory = 'building' | 'prop' | 'vegetation' | 'npc' | 'player';

/**
 * Everything a mesh needs in order to build itself. Authored placement (from the
 * world manifest) and procedural placement (from the populator) both fill this in.
 */
export interface BuildContext {
  /** World position the mesh should be built at. */
  position: THREE.Vector3;
  /** Uniform scale factor. */
  scale: number;
  /** Optional Euler rotation (radians). Applied by the caller, not by build(). */
  rotation?: [number, number, number];
  /** Seeded RNG for procedural variation. Authored placement may omit it. */
  rng?: Rng;
  /** Optional display label. */
  label?: string;
}

/**
 * Abstract base for every world mesh. One mesh = one subclass = one file.
 *
 * `build()` must be pure geometry: it returns a Three.js object and performs no
 * scene insertion, collision registration, or persistence — those stay the
 * responsibility of the placement layer (WorldBuilder / WorldGenerator).
 */
export abstract class Mesh {
  /** Stable id used in JSON manifests and the registry, e.g. "malaka_church". */
  static readonly type: string;
  /** Coarse category for map-generation filtering. */
  static readonly category: MeshCategory;
  /** Optional extra type strings this mesh also answers to (legacy/synonyms). */
  static readonly aliases?: readonly string[];

  /** Build the Three.js object for this mesh. */
  abstract build(ctx: BuildContext): THREE.Object3D;
}

/** Constructor shape the registry accepts: a Mesh subclass with static metadata. */
export interface MeshClass {
  readonly type: string;
  readonly category: MeshCategory;
  readonly aliases?: readonly string[];
  new (): Mesh;
}
