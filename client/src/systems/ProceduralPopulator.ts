/**
 * ProceduralPopulator — deferred, proximity-gated world population.
 *
 * WHY DEFERRED:
 *   WorldGenerator.onChunkLoaded() fires for all 121 chunks during startup
 *   preload.  Spawning geometry synchronously in that callback creates thousands
 *   of Three.js objects in one frame → guaranteed lag spike.
 *
 *   Instead we enqueue every chunk and drain 1-2 entries per frame in update(),
 *   but ONLY when the chunk is within SPAWN_RADIUS of the player.  Chunks that
 *   are preloaded but out of range sit in the queue until the player walks close.
 *
 * DETERMINISM:
 *   All RNG is seeded by (chunkX, chunkZ) so the world is identical across
 *   sessions and page reloads.
 */

import * as THREE from 'three';
import { BiomeType, getDominantBiome } from '../scene/Biomes';
import type { Terrain } from '../scene/Terrain';
import type { CollisionSystem } from './CollisionSystem';
import type { EntityManager } from '../entities/EntityManager';
import { buildBiomeBuilding, buildBiomeProp } from './worldbuilder/objects/biomeProps';
import { getBiomeEntry } from './BiomeRegistry';

// ── Seeded PRNG ───────────────────────────────────────────────────────────────

class SeededRng {
  private s: number;
  constructor(cx: number, cz: number, salt = 0) {
    this.s = ((cx * 73856093) ^ (cz * 19349663) ^ salt) | 0;
    if (this.s === 0) this.s = 1;
    // Warm up the state
    for (let i = 0; i < 4; i++) this._step();
  }
  private _step(): void {
    this.s ^= this.s << 13;
    this.s ^= this.s >> 17;
    this.s ^= this.s << 5;
  }
  next(): number { this._step(); return (this.s >>> 0) / 0xffffffff; }
  nextInt(n: number): number { return Math.floor(this.next() * n); }
  nextRange(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[this.nextInt(arr.length)]!; }
}

// ── Monster catalogue ─────────────────────────────────────────────────────────

interface MonsterDef { id: string; name: string; hp: number; maxHp: number; scale: number; }

function mon(id: string, name: string, hp: number, scale: number): MonsterDef {
  return { id, name, hp, maxHp: hp, scale };
}

const BIOME_MONSTERS: Partial<Record<BiomeType, MonsterDef[]>> = {
  [BiomeType.Teldrassil]: [
    mon('wraith',   'Forest Wraith',     60, 1.1),
    mon('spider',   'Moon Spider',       45, 0.85),
    mon('sentinel', 'Corrupted Sentinel',80, 1.0),
  ],
  [BiomeType.EmberWastes]: [
    mon('lava_hound',    'Lava Hound',       70,  1.0),
    mon('obs_golem',     'Obsidian Golem',   140, 1.6),
    mon('fire_sprite',   'Fire Sprite',      40,  0.75),
  ],
  [BiomeType.CrystalTundra]: [
    mon('frost_wraith',  'Frost Wraith',     65,  1.15),
    mon('glacial_golem', 'Glacial Golem',    160, 1.7),
    mon('ice_wolf',      'Ice Wolf',         55,  0.9),
  ],
  [BiomeType.TwilightMarsh]: [
    mon('bog_lurker',    'Bog Lurker',       75,  1.2),
    mon('shadow_snake',  'Shadow Serpent',   50,  0.8),
    mon('swamp_troll',   'Swamp Troll',      120, 1.4),
  ],
  [BiomeType.SunlitMeadows]: [
    mon('stone_boar',    'Stone Boar',       60,  0.95),
    mon('sunstone_golem','Sunstone Golem',   130, 1.5),
    mon('giant_wasp',    'Giant Wasp',       45,  0.8),
  ],
  [BiomeType.Desert]: [
    mon('sand_wraith',   'Sand Wraith',      55,  1.05),
    mon('dune_crawler',  'Dune Crawler',     80,  1.1),
    mon('desert_golem',  'Desert Golem',     110, 1.4),
  ],
};

// ── Queue entry ───────────────────────────────────────────────────────────────

interface PendingChunk {
  chunkX: number; chunkZ: number;
  worldX: number; worldZ: number;
  /** Centre of the chunk in world space — used for distance sorting. */
  cx: number; cz: number;
}

// ── Main class ────────────────────────────────────────────────────────────────

export class ProceduralPopulator {
  private terrain: Terrain;
  private scene: THREE.Scene | null = null;
  private collisionSystem: CollisionSystem | null = null;
  private entityManager: EntityManager | null = null;

  private npcCounter = 0;

  /** Chunks waiting to be populated. */
  private queue: PendingChunk[] = [];
  /** Chunks already populated (de-dup guard). */
  private populated = new Set<string>();

  /**
   * Only populate chunks whose centre is within this many world-units of
   * the player.  3 chunks × 64 wu/chunk = 192 wu.
   */
  private readonly SPAWN_RADIUS = 200;
  /** Max chunks to process per frame. Keep at 1 to avoid frame spikes. */
  private readonly CHUNKS_PER_FRAME = 1;

  // Reusable sort scratch
  private _sortPlayerX = 0;
  private _sortPlayerZ = 0;

  constructor(terrain: Terrain) { this.terrain = terrain; }

  setScene(scene: THREE.Scene): void { this.scene = scene; }
  setCollisionSystem(cs: CollisionSystem): void { this.collisionSystem = cs; }
  setEntityManager(em: EntityManager): void { this.entityManager = em; }

  /** Called by WorldGenerator.onChunkLoaded — zero work done here. */
  queueChunk(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.populated.has(key)) return;

    const cx = worldX + 32; // chunk centre (CHUNK_SIZE = 64)
    const cz = worldZ + 32;

    // Skip within 60 wu of origin (hand-authored starting area)
    if (cx * cx + cz * cz < 60 * 60) return;

    this.queue.push({ chunkX, chunkZ, worldX, worldZ, cx, cz });
  }

  /** Remove tracking for a chunk so it can be re-populated if it reloads. */
  releaseChunk(chunkX: number, chunkZ: number): void {
    this.populated.delete(`${chunkX},${chunkZ}`);
  }

  /**
   * Call once per frame from the game loop.
   * Processes the closest queued chunk that is within SPAWN_RADIUS.
   */
  update(playerX: number, playerZ: number): void {
    if (this.queue.length === 0 || !this.scene) return;

    const r2 = this.SPAWN_RADIUS * this.SPAWN_RADIUS;

    // Sort cheaply: bring the closest item to front
    this._sortPlayerX = playerX;
    this._sortPlayerZ = playerZ;
    this.queue.sort(this._distSort);

    let processed = 0;
    while (processed < this.CHUNKS_PER_FRAME && this.queue.length > 0) {
      const next = this.queue[0]!;
      const dx = next.cx - playerX, dz = next.cz - playerZ;
      if (dx * dx + dz * dz > r2) break; // closest is still too far

      this.queue.shift();
      const key = `${next.chunkX},${next.chunkZ}`;
      if (!this.populated.has(key)) {
        this.populated.add(key);
        this._populateNow(next);
        processed++;
      }
    }
  }

  // ── Private ──────────────────────────────────────────────────────────────────

  private readonly _distSort = (a: PendingChunk, b: PendingChunk): number => {
    const px = this._sortPlayerX, pz = this._sortPlayerZ;
    const da = (a.cx - px) ** 2 + (a.cz - pz) ** 2;
    const db = (b.cx - px) ** 2 + (b.cz - pz) ** 2;
    return da - db;
  };

  private _populateNow(chunk: PendingChunk): void {
    const { worldX, worldZ, chunkX, chunkZ, cx, cz } = chunk;
    const chunkSize = 64;
    const distFromOrigin = Math.sqrt(cx * cx + cz * cz);
    const biome = getDominantBiome(cx, cz);
    const rng = new SeededRng(chunkX, chunkZ, 0xdeadbeef);

    // Check if this biome has a registry entry (extensible path)
    const registryEntry = getBiomeEntry(biome);

    // ── Building (1-in-4 chunks) ───────────────────────────────────────
    if (rng.chance(0.25)) {
      const bx = worldX + rng.nextRange(8, chunkSize - 8);
      const bz = worldZ + rng.nextRange(8, chunkSize - 8);
      const by = this.terrain.getHeightAt(bx, bz);
      const pos = new THREE.Vector3(bx, by, bz);

      // Registry entry takes priority; fall back to built-in biomeProps
      const building = registryEntry
        ? registryEntry.buildingFn(pos, rng, distFromOrigin)
        : buildBiomeBuilding(biome, pos, rng, distFromOrigin);

      if (building && this.scene) {
        building.rotation.y = rng.nextRange(0, Math.PI * 2);
        this.scene.add(building);
        if (this.collisionSystem) void this.collisionSystem.addCollidableFiltered(building);
      }
    }

    // ── Monsters (density scales with distance) ────────────────────────
    const monsterChance = Math.min(0.40, 0.08 + distFromOrigin * 0.0005);
    if (rng.chance(monsterChance) && this.entityManager) {
      // Registry entry monsters > inline catalogue
      const defs = registryEntry?.monsters
        ?? BIOME_MONSTERS[biome]
        ?? BIOME_MONSTERS[BiomeType.Teldrassil]!;
      const count = rng.nextInt(2) + 1;
      for (let i = 0; i < count; i++) {
        const mx = worldX + rng.nextRange(6, chunkSize - 6);
        const mz = worldZ + rng.nextRange(6, chunkSize - 6);
        const my = this.terrain.getHeightAt(mx, mz);
        const def = rng.pick(defs);
        const npcId = `proc_${def.id}_${chunkX}_${chunkZ}_${i}_${this.npcCounter++}`;
        this.entityManager.addNPC({
          id: npcId, name: def.name,
          position: new THREE.Vector3(mx, my, mz),
          hp: def.maxHp ?? (def as { hp?: number }).hp ?? 60,
          maxHp: def.maxHp ?? (def as { hp?: number }).hp ?? 60,
          personality: `Hostile creature — attack on sight.`,
          scale: def.scale,
        });
      }
    }

    // ── Ambient props (1-in-2 chunks) ──────────────────────────────────
    if (rng.chance(0.50)) {
      const propCount = rng.nextInt(3) + 2; // 2–4 props
      for (let i = 0; i < propCount; i++) {
        const px = worldX + rng.nextRange(3, chunkSize - 3);
        const pz = worldZ + rng.nextRange(3, chunkSize - 3);
        const py = this.terrain.getHeightAt(px, pz);
        const pos = new THREE.Vector3(px, py, pz);
        const scale = rng.nextRange(0.75, 1.3);

        const prop = registryEntry
          ? registryEntry.propFn(pos, scale, rng)
          : buildBiomeProp(biome, pos, scale, rng);

        if (prop && this.scene) {
          prop.rotation.y = rng.nextRange(0, Math.PI * 2);
          this.scene.add(prop);
        }
      }
    }
  }
}
