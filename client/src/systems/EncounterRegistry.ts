/**
 * EncounterRegistry — pluggable, data-driven encounter system.
 *
 * An "encounter" is a cohesive set of geometry + optional NPCs placed as a
 * group around a single world-space anchor point.  Examples:
 *   • Campsite  — fire ring, tents, 1-2 friendly travellers
 *   • Bandit camp — palisade, fire, hostile bandits
 *   • Merchant caravan — wagons, merchant NPC, guard NPC
 *   • Hermit hut — solitary hut, strange old NPC
 *   • Battlefield remnant — scattered weapons, graves
 *   • Mine entrance — timber arch, minecart, lantern
 *
 * TO ADD A NEW ENCOUNTER TYPE:
 *   1. Define an EncounterDef object (biomes, chance, buildFn, npcs)
 *   2. Call registerEncounter(def) at module load time
 *   3. That's it — ProceduralPopulator picks it up automatically
 *
 * Server-authoritative NPCs (with LangGraph agents):
 *   Add them to shared/data/world_manifest.json AND
 *   server/src/agents/personalities/templates.py.
 *   Procedural encounter NPCs are purely client-side (visual wanderers).
 */

import * as THREE from 'three';
import { BiomeType } from '../scene/Biomes';
import type { Rng } from './worldbuilder/RngTypes';

// ── NPC definition inside an encounter ───────────────────────────────────────

export interface EncounterNpc {
  /** Prefix for the unique NPC id generated at spawn time. */
  idPrefix: string;
  name: string;
  maxHp: number;
  hostile: boolean;
  scale: number;
  /** Offset from the encounter anchor in local space (before world rotation). */
  offsetX: number;
  offsetZ: number;
  wanderRadius: number;
}

// ── Encounter definition ──────────────────────────────────────────────────────

export interface EncounterDef {
  /** Unique stable id string (used for logging / debugging). */
  id: string;
  /** Human name (shown in minimap tooltip if we add one). */
  name: string;
  /**
   * Which biomes this encounter can appear in.
   * Omit or set to [] to allow ALL biomes.
   */
  biomes?: BiomeType[];
  /** Minimum world-space distance from origin before this encounter spawns. */
  minDist: number;
  /** Probability per qualifying chunk (0–1). */
  chance: number;
  /**
   * Build and return the encounter's Three.js geometry.
   * The returned group will be placed at the anchor position.
   * Mark solid meshes userData.isCollider = true.
   * Mark decorative/emissive meshes userData.noCollision = true.
   */
  buildFn: (anchor: THREE.Vector3, rng: Rng) => THREE.Group;
  /** NPCs that spawn with this encounter. */
  npcs?: EncounterNpc[];
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _encounters: EncounterDef[] = [];

/** Register a new encounter type. Safe to call at module load time. */
export function registerEncounter(def: EncounterDef): void {
  _encounters.push(def);
}

/**
 * Return all encounters eligible for a given biome and world distance.
 * Encounters without a biomes restriction are eligible everywhere.
 */
export function getEncountersFor(biome: BiomeType, dist: number): EncounterDef[] {
  return _encounters.filter(
    (e) =>
      dist >= e.minDist &&
      (e.biomes === undefined || e.biomes.length === 0 || e.biomes.includes(biome)),
  );
}

/** All registered encounter ids (useful for debugging). */
export function registeredEncounterIds(): string[] {
  return _encounters.map((e) => e.id);
}
