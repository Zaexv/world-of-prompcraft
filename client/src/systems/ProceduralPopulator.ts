/**
 * ProceduralPopulator — deferred, proximity-gated world population.
 *
 * PERFORMANCE:
 *   onChunkLoaded() → queueChunk()  (zero work)
 *   update() drains 1 chunk/frame, only within SPAWN_RADIUS of player.
 *   Startup lag eliminated: 121 preloaded chunks stay queued, spawn
 *   as the player walks close.
 *
 * DESPAWNING:
 *   Every spawned Three.js object is tracked per chunk key.
 *   releaseChunk() removes them from the scene and collision system,
 *   preventing unbounded memory/GPU growth during long sessions.
 *
 * ENCOUNTERS:
 *   Encounters are grouped content (campsite, bandit camp, etc.) registered
 *   in EncounterRegistry via encounters.ts.  They produce geometry + NPCs
 *   at a single anchor point.  See EncounterRegistry.ts for the API.
 *
 * EXTENSION:
 *   • New biome building/prop → BiomeRegistry.registerBiome()
 *   • New encounter type    → EncounterRegistry.registerEncounter()
 *   • New monster type      → add row to BIOME_MONSTERS below
 */

import * as THREE from 'three';
import { BiomeType, getDominantBiome } from '../scene/Biomes';
import { Water } from '../scene/Water';
import type { Terrain } from '../scene/Terrain';
import type { CollisionSystem } from './CollisionSystem';
import type { EntityManager } from '../entities/EntityManager';
import { buildMesh, selectBiomeBuildingType, selectBiomePropType, selectBiomeVegetationType } from '../meshes';
import { getBiomeEntry } from './BiomeRegistry';
import { getEncountersFor } from './EncounterRegistry';
import { tagDebugInfo } from '../debug/DebugInfo';
// Side-effect import: registers all built-in encounters
import './encounters';

// ── Seeded PRNG ───────────────────────────────────────────────────────────────

class SeededRng {
  private s: number;
  constructor(cx: number, cz: number, salt = 0) {
    this.s = ((cx * 73856093) ^ (cz * 19349663) ^ salt) | 0;
    if (this.s === 0) this.s = 1;
    for (let i = 0; i < 4; i++) this._step();
  }
  private _step(): void {
    this.s ^= this.s << 13; this.s ^= this.s >> 17; this.s ^= this.s << 5;
  }
  next(): number { this._step(); return (this.s >>> 0) / 0xffffffff; }
  nextInt(n: number): number { return Math.floor(this.next() * n); }
  nextRange(lo: number, hi: number): number { return lo + this.next() * (hi - lo); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[this.nextInt(arr.length)]!; }
}

// ── Built-in monster catalogue ────────────────────────────────────────────────
// Prefer adding monsters via BiomeRegistry to avoid editing this file.

interface MonsterDef { id: string; name: string; maxHp: number; scale: number; }
function mon(id: string, name: string, hp: number, scale: number): MonsterDef {
  return { id, name, maxHp: hp, scale };
}

const BIOME_MONSTERS: Partial<Record<BiomeType, MonsterDef[]>> = {
  [BiomeType.Teldrassil]: [
    mon('wraith',   'Forest Wraith',     60,  1.1),
    mon('spider',   'Moon Spider',       45,  0.85),
    mon('sentinel', 'Corrupted Sentinel',80,  1.0),
    mon('treant',   'Young Treant',      95,  1.25),
  ],
  [BiomeType.EmberWastes]: [
    mon('lava_hound',  'Lava Hound',     70,  1.0),
    mon('obs_golem',   'Obsidian Golem', 140, 1.6),
    mon('fire_sprite', 'Fire Sprite',    40,  0.75),
    mon('ash_crawler', 'Ash Crawler',    55,  0.9),
  ],
  [BiomeType.CrystalTundra]: [
    mon('frost_wraith', 'Frost Wraith',  65,  1.15),
    mon('glacial_golem','Glacial Golem', 160, 1.7),
    mon('ice_wolf',     'Ice Wolf',      55,  0.9),
    mon('snow_stalker', 'Snow Stalker',  70,  1.05),
  ],
  [BiomeType.TwilightMarsh]: [
    mon('bog_lurker',  'Bog Lurker',     75,  1.2),
    mon('shadow_snake','Shadow Serpent', 50,  0.8),
    mon('swamp_troll', 'Swamp Troll',   120, 1.4),
    mon('marsh_wisp',  'Marsh Wisp',    35,  0.7),
  ],
  [BiomeType.SunlitMeadows]: [
    mon('stone_boar',     'Stone Boar',     60,  0.95),
    mon('sunstone_golem', 'Sunstone Golem', 130, 1.5),
    mon('giant_wasp',     'Giant Wasp',     45,  0.8),
    mon('field_stalker',  'Field Stalker',  65,  1.0),
  ],
  [BiomeType.Desert]: [
    mon('sand_wraith',  'Sand Wraith',  55,  1.05),
    mon('dune_crawler', 'Dune Crawler', 80,  1.1),
    mon('desert_golem', 'Desert Golem',110, 1.4),
    mon('scorpion',     'Giant Scorpion',60, 0.85),
  ],
};

// ── Pending queue entry ───────────────────────────────────────────────────────

interface PendingChunk {
  chunkX: number; chunkZ: number;
  worldX: number; worldZ: number;
  cx: number; cz: number;  // world-space chunk centre
}

// ── Main class ────────────────────────────────────────────────────────────────

export class ProceduralPopulator {
  private terrain: Terrain;
  private scene: THREE.Scene | null = null;
  private collisionSystem: CollisionSystem | null = null;
  private entityManager: EntityManager | null = null;

  private npcCounter = 0;

  private queue: PendingChunk[] = [];
  private _queueDirty = false; // sort only when new chunks are queued
  private populated = new Set<string>();

  /**
   * Every spawned object, keyed by chunkKey.
   * Used to clean up when chunks unload.
   */
  private spawnedObjects = new Map<string, THREE.Object3D[]>();
  /**
   * NPC ids spawned per chunk — so we can remove them on unload.
   */
  private spawnedNpcs = new Map<string, string[]>();

  /** Only populate chunks within this radius (world-units) of the player. */
  private readonly SPAWN_RADIUS = 220;
  /** Chunks processed per frame. Keep at 1 for smooth frame budget. */
  private readonly CHUNKS_PER_FRAME = 1;

  private _sortPX = 0;
  private _sortPZ = 0;

  // Reusable scratch Vector3 — avoids per-chunk allocation (GC pressure)
  private static _v = new THREE.Vector3();

  // Small margin above the sea surface: anything whose ground sits at or below
  // this never spawns, so props/buildings/monsters don't end up submerged (or
  // half-sunk at the shoreline) in basins and lakebeds.
  private static readonly WATER_SPAWN_MARGIN = 0.3;

  constructor(terrain: Terrain) { this.terrain = terrain; }

  /** True when the ground at (x, z) is at/below the water surface — no spawning there. */
  private isUnderwater(x: number, z: number): boolean {
    return this.terrain.getHeightAt(x, z) <= Water.LEVEL + ProceduralPopulator.WATER_SPAWN_MARGIN;
  }

  setScene(scene: THREE.Scene): void { this.scene = scene; }
  setCollisionSystem(cs: CollisionSystem): void { this.collisionSystem = cs; }
  setEntityManager(em: EntityManager): void { this.entityManager = em; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Called by WorldGenerator.onChunkLoaded — no geometry created here. */
  queueChunk(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.populated.has(key)) return;

    const cx = worldX + 32;
    const cz = worldZ + 32;
    // Preserve the hand-authored starting area
    if (cx * cx + cz * cz < 60 * 60) return;

    this.queue.push({ chunkX, chunkZ, worldX, worldZ, cx, cz });
    this._queueDirty = true;
  }

  /**
   * Called by WorldGenerator.onChunkUnloaded.
   * Removes all procedurally spawned objects for this chunk.
   */
  releaseChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    this.populated.delete(key);

    // Remove Three.js objects
    const objs = this.spawnedObjects.get(key);
    if (objs) {
      for (const obj of objs) {
        this.scene?.remove(obj);
        this.collisionSystem?.removeCollidable(obj);
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });
      }
      this.spawnedObjects.delete(key);
    }

    // Remove procedural NPCs
    const npcIds = this.spawnedNpcs.get(key);
    if (npcIds && this.entityManager) {
      for (const id of npcIds) this.entityManager.removeNPC(id);
      this.spawnedNpcs.delete(key);
    }

    // Remove from queue if still pending (no need to mark dirty — removing doesn't change sort order)
    const qi = this.queue.findIndex((c) => c.chunkX === chunkX && c.chunkZ === chunkZ);
    if (qi !== -1) this.queue.splice(qi, 1);
  }

  /** Call once per frame from the game loop. */
  update(playerX: number, playerZ: number): void {
    if (this.queue.length === 0 || !this.scene) return;

    const r2 = this.SPAWN_RADIUS * this.SPAWN_RADIUS;

    // Re-sort only when new chunks have been queued — avoid per-frame sort cost.
    if (this._queueDirty) {
      this._sortPX = playerX; this._sortPZ = playerZ;
      this.queue.sort(this._distSort);
      this._queueDirty = false;
    }

    let done = 0;
    while (done < this.CHUNKS_PER_FRAME && this.queue.length > 0) {
      const next = this.queue[0]!;
      const dx = next.cx - playerX, dz = next.cz - playerZ;
      if (dx * dx + dz * dz > r2) break;
      this.queue.shift();
      const key = `${next.chunkX},${next.chunkZ}`;
      if (!this.populated.has(key)) {
        this.populated.add(key);
        this._populate(next, key);
        done++;
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private readonly _distSort = (a: PendingChunk, b: PendingChunk): number => {
    const px = this._sortPX, pz = this._sortPZ;
    return ((a.cx - px) ** 2 + (a.cz - pz) ** 2) - ((b.cx - px) ** 2 + (b.cz - pz) ** 2);
  };

  private _populate(chunk: PendingChunk, key: string): void {
    const { worldX, worldZ, chunkX, chunkZ, cx, cz } = chunk;
    const SIZE = 64;
    const dist = Math.sqrt(cx * cx + cz * cz);
    const biome = getDominantBiome(cx, cz);
    const rng = new SeededRng(chunkX, chunkZ, 0xdeadbeef);
    const registryEntry = getBiomeEntry(biome);

    const objs: THREE.Object3D[] = [];
    const npcIds: string[] = [];

    // ── Encounter (first pick — highest-priority content) ──────────────
    const eligibleEncounters = getEncountersFor(biome, dist);
    if (eligibleEncounters.length > 0) {
      for (const enc of eligibleEncounters) {
        if (!rng.chance(enc.chance)) continue;

        const ex = worldX + rng.nextRange(8, SIZE - 8);
        const ez = worldZ + rng.nextRange(8, SIZE - 8);
        if (this.isUnderwater(ex, ez)) continue;
        const ey = this.terrain.getHeightAt(ex, ez);
        const anchor = ProceduralPopulator._v.set(ex, ey, ez);

        const group = enc.buildFn(anchor, rng);
        if (this.scene) {
          group.rotation.y = rng.nextRange(0, Math.PI * 2);
          this.scene.add(group);
          // addCollidableFiltered is now instant — BVH trees are built lazily
          // by CollisionSystem.update() at max 2/frame (no burst spikes).
          void this.collisionSystem?.addCollidableFiltered(group);
          tagDebugInfo(group, { type: 'encounter_' + enc.id, category: 'encounter', zone: BiomeType[biome] });
          objs.push(group);
        }

        // Spawn encounter NPCs (respect same hard cap as monster spawning)
        const underNpcCap = this.entityManager ? this.entityManager.npcs.size < 80 : false;
        if (enc.npcs && this.entityManager && underNpcCap) {
          for (const npcDef of enc.npcs) {
            const localX = npcDef.offsetX, localZ = npcDef.offsetZ;
            const gy = group.rotation.y;
            const nx = ex + Math.cos(gy) * localX - Math.sin(gy) * localZ;
            const nz = ez + Math.sin(gy) * localX + Math.cos(gy) * localZ;
            const ny = this.terrain.getHeightAt(nx, nz);
            const npcId = `enc_${enc.id}_${npcDef.idPrefix}_${chunkX}_${chunkZ}_${this.npcCounter++}`;
            this.entityManager.addNPC({
              id: npcId,
              name: npcDef.name,
              personalityKey: npcDef.hostile ? 'road_bandit' : 'wandering_knight',
              position: new THREE.Vector3(nx, ny, nz), // needs own Vector3 (stored by EntityManager)
              hp: npcDef.maxHp, maxHp: npcDef.maxHp,
              personality: npcDef.hostile
                ? `Hostile — attack on sight.`
                : `Friendly wanderer — peaceful, will converse.`,
              scale: npcDef.scale,
            });
            npcIds.push(npcId);
          }
        }

        break; // one encounter per chunk
      }
    }

    // ── Building (1-in-5 chunks that didn't get an encounter) ─────────
    if (rng.chance(0.20)) {
      const bx = worldX + rng.nextRange(8, SIZE - 8);
      const bz = worldZ + rng.nextRange(8, SIZE - 8);
      if (!this.isUnderwater(bx, bz)) {
        const by = this.terrain.getHeightAt(bx, bz);
        const pos = ProceduralPopulator._v.set(bx, by, bz);

        let building: THREE.Object3D | null;
        let buildingType = BiomeType[biome] + '_building';
        if (registryEntry) {
          building = registryEntry.buildingFn(pos, rng, dist);
        } else {
          const bType = selectBiomeBuildingType(biome, rng, dist);
          if (bType) buildingType = bType;
          building = bType ? buildMesh(bType, { position: pos, scale: 1 }) ?? null : null;
        }

        if (building && this.scene) {
          building.rotation.y = rng.nextRange(0, Math.PI * 2);
          this.scene.add(building);
          void this.collisionSystem?.addCollidableFiltered(building);
          tagDebugInfo(building, { type: buildingType, category: 'building', zone: BiomeType[biome] });
          objs.push(building);
        }
      }
    }

    // ── Monsters (density scales with distance from origin) ────────────
    // Hard cap on total NPCs: prevents the EntityManager loop growing unbounded.
    // 36 server NPCs + up to ~44 procedural = comfortable 80 total.
    const MAX_NPCS = 80;
    const monsterChance = Math.min(0.38, 0.06 + dist * 0.0005);
    if (rng.chance(monsterChance) && this.entityManager &&
        this.entityManager.npcs.size < MAX_NPCS) {
      const defs = registryEntry?.monsters
        ?? BIOME_MONSTERS[biome]
        ?? BIOME_MONSTERS[BiomeType.Teldrassil]!;
      const count = rng.nextInt(2) + 1;
      for (let i = 0; i < count; i++) {
        const mx = worldX + rng.nextRange(6, SIZE - 6);
        const mz = worldZ + rng.nextRange(6, SIZE - 6);
        if (this.isUnderwater(mx, mz)) continue;
        const my = this.terrain.getHeightAt(mx, mz);
        const def = rng.pick(defs);
        const npcId = `proc_${def.id}_${chunkX}_${chunkZ}_${i}_${this.npcCounter++}`;
        this.entityManager.addNPC({
          id: npcId, name: def.name,
          personalityKey: def.id,
          position: new THREE.Vector3(mx, my, mz),
          hp: def.maxHp, maxHp: def.maxHp,
          personality: `Hostile creature — attack on sight.`,
          scale: def.scale,
        });
        npcIds.push(npcId);
      }
    }

    // ── Vegetation / Clutter (High density, 10–30 items) ───────────────
    if (rng.chance(0.95)) {
      const vegCount = rng.nextInt(20) + 10;
      for (let i = 0; i < vegCount; i++) {
        const px = worldX + rng.nextRange(2, SIZE - 2);
        const pz = worldZ + rng.nextRange(2, SIZE - 2);
        if (this.isUnderwater(px, pz)) continue;
        const py = this.terrain.getHeightAt(px, pz);
        const pos = ProceduralPopulator._v.set(px, py, pz);
        const scale = rng.nextRange(0.6, 1.5);

        // BiomeRegistry doesn't currently specify a vegFn, so we rely on the internal selector
        const type = selectBiomeVegetationType(biome, rng);
        const veg = type ? buildMesh(type, { position: pos, scale, rng }) ?? null : null;

        if (veg && this.scene) {
          veg.rotation.y = rng.nextRange(0, Math.PI * 2);
          this.scene.add(veg);
          if (veg.userData.isCollider || veg.children.some(c => c.userData.isCollider)) {
            void this.collisionSystem?.addCollidableFiltered(veg);
          }
          tagDebugInfo(veg, { type: type ?? 'vegetation', category: 'vegetation', zone: BiomeType[biome] });
          objs.push(veg);
        }
      }
    }

    // ── Ambient props (3–6, richer density) ───────────────────────────
    if (rng.chance(0.60)) {
      const propCount = rng.nextInt(4) + 3; // 3–6
      for (let i = 0; i < propCount; i++) {
        const px = worldX + rng.nextRange(3, SIZE - 3);
        const pz = worldZ + rng.nextRange(3, SIZE - 3);
        if (this.isUnderwater(px, pz)) continue;
        const py = this.terrain.getHeightAt(px, pz);
        const pos = ProceduralPopulator._v.set(px, py, pz);
        const scale = rng.nextRange(0.7, 1.35);

        let prop: THREE.Object3D | null;
        let propType = BiomeType[biome] + '_prop';
        if (registryEntry) {
          prop = registryEntry.propFn(pos, scale, rng);
        } else {
          const pType = selectBiomePropType(biome, rng);
          if (pType) propType = pType;
          prop = pType ? buildMesh(pType, { position: pos, scale, rng }) ?? null : null;
        }

        if (prop && this.scene) {
          prop.rotation.y = rng.nextRange(0, Math.PI * 2);
          this.scene.add(prop);
          tagDebugInfo(prop, { type: propType, category: 'prop', zone: BiomeType[biome] });
          objs.push(prop);
        }
      }
    }

    // Track for cleanup
    if (objs.length > 0) this.spawnedObjects.set(key, objs);
    if (npcIds.length > 0) this.spawnedNpcs.set(key, npcIds);
  }
}
