/**
 * ProceduralPopulator — deterministic per-chunk world population.
 *
 * Every chunk gets a seeded PRNG so spawns are consistent across sessions
 * (same chunk coords → same content, always). Biome is sampled at the chunk
 * centre; the dominant biome drives the content theme.
 *
 * Content per chunk (1-in-N chance gates):
 *  • 1-in-4  → a biome building / structure
 *  • 1-in-3  → a monster NPC encounter group
 *  • 1-in-2  → 2-6 ambient props (rocks, crystals, stumps, etc.)
 *
 * Monsters are spawned as client-side NPC entities and are NOT server-
 * authoritative — they are decorative wanderers driven by the existing
 * NPCWander system.  If you want them to respond to player interaction,
 * add them to world_manifest.json (the server picks those up).
 */

import * as THREE from 'three';
import { BiomeType, getDominantBiome } from '../scene/Biomes';
import type { Terrain } from '../scene/Terrain';
import type { CollisionSystem } from './CollisionSystem';
import type { EntityManager } from '../entities/EntityManager';
import { buildBiomeBuilding, buildBiomeProp } from './worldbuilder/objects/biomeProps';

// ── Seeded PRNG (xorshift32) ──────────────────────────────────────────────────

function hash(cx: number, cz: number, salt: number): number {
  let s = (cx * 73856093) ^ (cz * 19349663) ^ salt;
  s |= 0;
  s ^= s << 13; s ^= s >> 17; s ^= s << 5;
  return ((s >>> 0) / 0xffffffff);
}

class SeededRng {
  private s: number;
  constructor(cx: number, cz: number, salt = 0) {
    this.s = (cx * 73856093) ^ (cz * 19349663) ^ salt;
    if (this.s === 0) this.s = 1;
  }
  next(): number {
    this.s ^= this.s << 13;
    this.s ^= this.s >> 17;
    this.s ^= this.s << 5;
    return ((this.s >>> 0) / 0xffffffff);
  }
  nextInt(n: number): number { return Math.floor(this.next() * n); }
  nextRange(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: T[]): T { return arr[this.nextInt(arr.length)]!; }
}

// ── Spawn result ──────────────────────────────────────────────────────────────

export interface SpawnedChunkContent {
  objects: THREE.Object3D[];
}

// ── Monster catalogue (visual NPC spawns, no server agent) ───────────────────

interface MonsterDef {
  id: string;
  name: string;
  hp: number;
  hostile: boolean;
  scale: number;
}

const BIOME_MONSTERS: Record<number, MonsterDef[]> = {
  [BiomeType.Teldrassil]: [
    { id: 'wraith',        name: 'Forest Wraith',    hp: 60,  hostile: true,  scale: 1.1 },
    { id: 'spider',        name: 'Moon Spider',      hp: 45,  hostile: true,  scale: 0.85 },
    { id: 'corrupted_elf', name: 'Corrupted Sentinel', hp: 80, hostile: true, scale: 1.0 },
  ],
  [BiomeType.EmberWastes]: [
    { id: 'lava_hound',   name: 'Lava Hound',       hp: 70,  hostile: true,  scale: 1.0 },
    { id: 'obsidian_golem',name:'Obsidian Golem',    hp: 140, hostile: true,  scale: 1.6 },
    { id: 'fire_sprite',  name: 'Fire Sprite',       hp: 40,  hostile: true,  scale: 0.75 },
  ],
  [BiomeType.CrystalTundra]: [
    { id: 'frost_wraith', name: 'Frost Wraith',      hp: 65,  hostile: true,  scale: 1.15 },
    { id: 'glacial_golem',name: 'Glacial Golem',     hp: 160, hostile: true,  scale: 1.7 },
    { id: 'ice_wolf',     name: 'Ice Wolf',           hp: 55,  hostile: true,  scale: 0.9 },
  ],
  [BiomeType.TwilightMarsh]: [
    { id: 'bog_lurker',   name: 'Bog Lurker',        hp: 75,  hostile: true,  scale: 1.2 },
    { id: 'shadow_serpent',name:'Shadow Serpent',     hp: 50,  hostile: true,  scale: 0.8 },
    { id: 'swamp_troll',  name: 'Swamp Troll',       hp: 120, hostile: true,  scale: 1.4 },
  ],
  [BiomeType.SunlitMeadows]: [
    { id: 'stone_boar',   name: 'Stone Boar',        hp: 60,  hostile: true,  scale: 0.95 },
    { id: 'sunstone_golem',name:'Sunstone Golem',     hp: 130, hostile: true,  scale: 1.5 },
    { id: 'giant_wasp',   name: 'Giant Wasp',        hp: 45,  hostile: true,  scale: 0.8 },
  ],
  [BiomeType.Desert]: [
    { id: 'sand_wraith',  name: 'Sand Wraith',       hp: 55,  hostile: true,  scale: 1.05 },
    { id: 'dune_crawler', name: 'Dune Crawler',      hp: 80,  hostile: true,  scale: 1.1 },
    { id: 'desert_golem', name: 'Desert Golem',      hp: 110, hostile: true,  scale: 1.4 },
  ],
};

// ── Main populator ────────────────────────────────────────────────────────────

export class ProceduralPopulator {
  private terrain: Terrain;
  private collisionSystem: CollisionSystem | null = null;
  private entityManager: EntityManager | null = null;

  // Unique counter so each procedural NPC gets a distinct id
  private npcCounter = 0;

  constructor(terrain: Terrain) {
    this.terrain = terrain;
  }

  setCollisionSystem(cs: CollisionSystem): void { this.collisionSystem = cs; }
  setEntityManager(em: EntityManager): void { this.entityManager = em; }

  /**
   * Generate all content for a chunk.  Returns the spawned Three.js objects
   * so the caller can track them for later cleanup.
   */
  populateChunk(
    scene: THREE.Scene,
    chunkX: number,
    chunkZ: number,
    worldX: number,
    worldZ: number,
    chunkSize: number,
  ): THREE.Object3D[] {
    const cx = worldX + chunkSize / 2;
    const cz = worldZ + chunkSize / 2;
    const biome = getDominantBiome(cx, cz);

    // Skip tiny chunks and the very centre (where hand-authored content lives)
    const distFromOrigin = Math.sqrt(cx * cx + cz * cz);
    if (distFromOrigin < 60) return [];

    const rng = new SeededRng(chunkX, chunkZ, 0xdeadbeef);
    const spawned: THREE.Object3D[] = [];

    // ── Building (1-in-4 chunks) ──────────────────────────────────────────
    if (rng.chance(0.25)) {
      const bx = worldX + rng.nextRange(8, chunkSize - 8);
      const bz = worldZ + rng.nextRange(8, chunkSize - 8);
      const by = this.terrain.getHeightAt(bx, bz);
      const pos = new THREE.Vector3(bx, by, bz);
      const rot = rng.nextRange(0, Math.PI * 2);

      const building = buildBiomeBuilding(biome, pos, rng, distFromOrigin);
      if (building) {
        building.rotation.y = rot;
        scene.add(building);
        if (this.collisionSystem) {
          void this.collisionSystem.addCollidableFiltered(building);
        }
        spawned.push(building);
      }
    }

    // ── Monster encounter (1-in-3 chunks, gets denser far from origin) ───
    const monsterChance = Math.min(0.45, 0.12 + distFromOrigin * 0.0006);
    if (rng.chance(monsterChance) && this.entityManager) {
      const mDefs = BIOME_MONSTERS[biome] ?? BIOME_MONSTERS[BiomeType.Teldrassil]!;
      const count = rng.nextInt(2) + 1; // 1-2 monsters per encounter
      for (let i = 0; i < count; i++) {
        const mx = worldX + rng.nextRange(6, chunkSize - 6);
        const mz = worldZ + rng.nextRange(6, chunkSize - 6);
        const my = this.terrain.getHeightAt(mx, mz);
        const def = rng.pick(mDefs);
        const npcId = `proc_${def.id}_${chunkX}_${chunkZ}_${i}_${this.npcCounter++}`;

        this.entityManager.addNPC({
          id: npcId,
          name: def.name,
          position: new THREE.Vector3(mx, my, mz),
          hp: def.hp,
          maxHp: def.hp,
          personality: `Hostile creature in the wild. Attack on sight.`,
          scale: def.scale,
        });
      }
    }

    // ── Ambient props (1-in-2 chunks) ────────────────────────────────────
    if (rng.chance(0.50)) {
      const propCount = rng.nextInt(4) + 2; // 2-5 props
      for (let i = 0; i < propCount; i++) {
        const px = worldX + rng.nextRange(3, chunkSize - 3);
        const pz = worldZ + rng.nextRange(3, chunkSize - 3);
        const py = this.terrain.getHeightAt(px, pz);
        const pos = new THREE.Vector3(px, py, pz);
        const rot = rng.nextRange(0, Math.PI * 2);
        const scale = rng.nextRange(0.7, 1.4);

        const prop = buildBiomeProp(biome, pos, scale, rng);
        if (prop) {
          prop.rotation.y = rot;
          scene.add(prop);
          spawned.push(prop);
        }
      }
    }

    return spawned;
  }
}

/** Simple deterministic hash helper (exported for tests). */
export { hash as chunkHash };
