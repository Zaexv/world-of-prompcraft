/**
 * BiomeRegistry — the single place to register a new biome.
 *
 * To add a new biome:
 *  1. Add its BiomeType entry to scene/Biomes.ts (enum + weight + colors)
 *  2. Add a BiomeEntry here: { monsters, buildingFn, propFn }
 *  3. Add an AtmospherePreset in scene/ZoneAtmosphere.ts
 *  4. Add a ZoneData entry in systems/ZoneTracker.ts
 *  5. Add monster personalities in server/src/agents/personalities/templates.py
 *  6. Add NPC entries in shared/data/world_manifest.json
 *
 * That's it — ProceduralPopulator reads this registry automatically.
 *
 * DESIGN GOALS:
 *  • Zero changes to ProceduralPopulator when adding biomes
 *  • Building and prop factories are plain functions — easy to unit-test
 *  • Monster list is data, not code — add a row, done
 */

import * as THREE from 'three';
import { BiomeType } from '../scene/Biomes';
import type { Rng } from './worldbuilder/RngTypes';

// ── Public types ──────────────────────────────────────────────────────────────

export interface BiomeMonster {
  /** Unique id prefix for procedural NPC ids. */
  id: string;
  /** Display name shown in interaction panel. */
  name: string;
  maxHp: number;
  /** Scale applied to the NPC mesh. */
  scale: number;
}

export interface BiomeEntry {
  monsters: BiomeMonster[];
  /**
   * Returns a Three.js Group for a biome-specific building.
   * Return null to skip building for this roll.
   */
  buildingFn: (pos: THREE.Vector3, rng: Rng, distFromOrigin: number) => THREE.Group | null;
  /**
   * Returns a Three.js Group for a small ambient prop.
   * Return null to skip.
   */
  propFn: (pos: THREE.Vector3, scale: number, rng: Rng) => THREE.Group | null;
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry = new Map<BiomeType, BiomeEntry>();

/** Register a biome. Call this at module load time (top-level). */
export function registerBiome(type: BiomeType, entry: BiomeEntry): void {
  _registry.set(type, entry);
}

/** Retrieve a biome entry. Returns undefined if not registered. */
export function getBiomeEntry(type: BiomeType): BiomeEntry | undefined {
  return _registry.get(type);
}

/** All registered biome types. */
export function registeredBiomes(): BiomeType[] {
  return Array.from(_registry.keys());
}
