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
import { buildMesh, selectBiomePropType, selectBiomeVegetationType, selectBiomeBuildingType } from '../meshes';
import { isInstanceable } from '../meshes/core/MeshRegistry';
import { buildInstancedBatch, type VegInstance } from './worldbuilder/instanceBatch';
import { getBiomeEntry } from './BiomeRegistry';
import { tagDebugInfo, type DebugInfo } from '../debug/DebugInfo';

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
  [BiomeType.BlastedSuarezLands]: [
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
  [BiomeType.MoinSwamps]: [
    mon('bog_lurker',  'Bog Lurker',     75,  1.2),
    mon('shadow_snake','Shadow Serpent', 50,  0.8),
    mon('swamp_troll', 'Swamp Troll',   120, 1.4),
    mon('marsh_wisp',  'Marsh Wisp',    35,  0.7),
  ],
  [BiomeType.MalakaArea]: [
    mon('stone_boar',     'Stone Boar',     60,  0.95),
    mon('sunstone_golem', 'Sunstone Golem', 130, 1.5),
    mon('giant_wasp',     'Giant Wasp',     45,  0.8),
    mon('field_stalker',  'Field Stalker',  65,  1.0),
  ],
  [BiomeType.TanisDesert]: [
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

  // Deferred per-object spawn tasks. A chunk is *planned* (cheap RNG decisions)
  // immediately, but the expensive mesh builds + collision registration are
  // drained a few per frame under a time budget so one dense chunk can't stall a
  // whole frame (the 60-70ms hitch when entering far/dense zones).
  private spawnTasks: Array<{ key: string; run: () => void }> = [];
  private readonly SPAWN_BUDGET_MS = 3;

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
          if (child instanceof THREE.InstancedMesh) child.dispose(); // frees instanceMatrix buffer
          if (child instanceof THREE.Mesh) child.geometry.dispose();
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

    // Cancel any not-yet-built spawn tasks for this chunk.
    if (this.spawnTasks.length > 0) {
      this.spawnTasks = this.spawnTasks.filter((t) => t.key !== key);
    }
  }

  /** Call once per frame from the game loop. */
  update(playerX: number, playerZ: number): void {
    if (!this.scene) return;

    // ── Plan up to CHUNKS_PER_FRAME chunks (cheap — RNG + height sampling) ──
    if (this.queue.length > 0) {
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
          this._planChunk(next, key);
          done++;
        }
      }
    }

    // ── Drain expensive spawn builds under a frame-time budget ──
    if (this.spawnTasks.length > 0) {
      const start = performance.now();
      while (this.spawnTasks.length > 0 && performance.now() - start < this.SPAWN_BUDGET_MS) {
        this.spawnTasks.shift()!.run();
      }
    }
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private readonly _distSort = (a: PendingChunk, b: PendingChunk): number => {
    const px = this._sortPX, pz = this._sortPZ;
    return ((a.cx - px) ** 2 + (a.cz - pz) ** 2) - ((b.cx - px) ** 2 + (b.cz - pz) ** 2);
  };

  /**
   * Plan a chunk's procedural content. ALL RNG decisions + height sampling happen
   * here (cheap), and the expensive parts — `buildMesh` / NPC mesh construction /
   * collision registration — are pushed as tasks drained under a frame budget in
   * `update()`. Build variation uses a per-object derived seed so the result stays
   * deterministic regardless of when the task drains.
   */
  private _planChunk(chunk: PendingChunk, key: string): void {
    const { worldX, worldZ, chunkX, chunkZ, cx, cz } = chunk;
    const SIZE = 64;
    const dist = Math.sqrt(cx * cx + cz * cz);
    const biome = getDominantBiome(cx, cz);
    const rng = new SeededRng(chunkX, chunkZ, 0xdeadbeef);
    const registryEntry = getBiomeEntry(biome);
    const zone = BiomeType[biome];

    // NOTE: Only natural content (monsters, vegetation, ambient props) and biome
    // buildings/encounters are generated here — authored structures come from the
    // world manifest.

    // ── Monsters (density scales with distance from origin) ────────────
    // Hard cap on total NPCs: prevents the EntityManager loop growing unbounded.
    const MAX_NPCS = 80;
    const monsterChance = Math.min(0.45, 0.08 + dist * 0.0006);
    if (rng.chance(monsterChance) && this.entityManager &&
        this.entityManager.npcs.size < MAX_NPCS) {
      const defs = registryEntry?.monsters
        ?? BIOME_MONSTERS[biome]
        ?? BIOME_MONSTERS[BiomeType.Teldrassil]!;
      const count = rng.nextInt(3) + 1;
      for (let i = 0; i < count; i++) {
        const mx = worldX + rng.nextRange(6, SIZE - 6);
        const mz = worldZ + rng.nextRange(6, SIZE - 6);
        if (this.isUnderwater(mx, mz)) continue;
        const my = this.terrain.getHeightAt(mx, mz);
        const def = rng.pick(defs);
        // Deterministic id — derived purely from the seeded spawn slot so every
        // client names this NPC identically. A per-client counter here broke
        // cross-player sync (death broadcasts referenced ids nobody else had).
        const npcId = `proc_${def.id}_${chunkX}_${chunkZ}_${i}`;
        this.spawnTasks.push({ key, run: () => {
          if (!this.entityManager || this.entityManager.npcs.size >= MAX_NPCS) return;
          this.entityManager.addNPC({
            id: npcId, name: def.name,
            personalityKey: def.id,
            position: new THREE.Vector3(mx, my, mz),
            hp: def.maxHp, maxHp: def.maxHp,
            personality: 'Hostile creature — attack on sight.',
            scale: def.scale,
            behavior: 'hostile',
            // Cool biome-themed skin if one is registered for this monster id;
            // the resolver falls back to the inferred placeholder otherwise.
            appearance: { mesh: `npc_creature_${def.id}` },
          });
          this._trackNpc(key, npcId);
        } });
      }
    }

    // ── Biome buildings (1 per chunk, ~10% chance) ────────────────────
    if (rng.chance(0.10)) {
      const bx = worldX + rng.nextRange(8, SIZE - 8);
      const bz = worldZ + rng.nextRange(8, SIZE - 8);
      if (!this.isUnderwater(bx, bz)) {
        const by = this.terrain.getHeightAt(bx, bz);
        const bPos = new THREE.Vector3(bx, by, bz);
        const rotationY = rng.nextRange(0, Math.PI * 2);
        let buildingType = 'biome_building';
        let buildFn: (r: SeededRng) => THREE.Object3D | null;
        if (registryEntry) {
          buildFn = (r) => registryEntry.buildingFn(bPos.clone(), r, dist);
        } else {
          const bType = selectBiomeBuildingType(biome, rng, dist);
          if (bType) buildingType = bType;
          buildFn = (r) => (bType ? buildMesh(bType, { position: bPos.clone(), scale: 1, rng: r }) ?? null : null);
        }
        const seed = rng.nextInt(0x40000000);
        this._pushObjectTask(key, buildFn, seed, rotationY, true, { type: buildingType, category: 'building', zone });
      }
    }

    // ── Rare encounters (1 per chunk, ~8% beyond 100u) ─────────────────
    const ENCOUNTERS = [
      'encounter_campsite', 'encounter_bandit_camp', 'encounter_hermit_dwelling',
      'encounter_mine_entrance', 'encounter_crashed_wagon', 'encounter_battlefield_remnant',
      'encounter_merchant_caravan', 'encounter_fishing_spot', 'encounter_ritual_site',
    ] as const;
    if (rng.chance(0.04) && dist > 100) {
      const ex = worldX + rng.nextRange(10, SIZE - 10);
      const ez = worldZ + rng.nextRange(10, SIZE - 10);
      if (!this.isUnderwater(ex, ez)) {
        const ey = this.terrain.getHeightAt(ex, ez);
        const ePos = new THREE.Vector3(ex, ey, ez);
        const rotationY = rng.nextRange(0, Math.PI * 2);
        const encType = rng.pick(ENCOUNTERS);
        const seed = rng.nextInt(0x40000000);
        this._pushObjectTask(
          key,
          (r) => buildMesh(encType, { position: ePos.clone(), scale: 1, rng: r }) ?? null,
          seed, rotationY, true, { type: encType, category: 'prop', zone },
        );
      }
    }

    // ── Vegetation / Clutter (4–12 items) ────────────────────────────
    if (rng.chance(0.75)) {
      const vegCount = rng.nextInt(8) + 4;
      // Instanceable types (e.g. trees) are batched into one InstancedMesh per
      // material for the whole chunk instead of one object each.
      const batches = new Map<string, VegInstance[]>();
      for (let i = 0; i < vegCount; i++) {
        const px = worldX + rng.nextRange(2, SIZE - 2);
        const pz = worldZ + rng.nextRange(2, SIZE - 2);
        if (this.isUnderwater(px, pz)) continue;
        const py = this.terrain.getHeightAt(px, pz);
        const scale = rng.nextRange(0.6, 1.5);
        const rotationY = rng.nextRange(0, Math.PI * 2);
        const type = selectBiomeVegetationType(biome, rng);
        const seed = rng.nextInt(0x40000000);
        if (!type) continue;
        const pos = new THREE.Vector3(px, py, pz);
        if (isInstanceable(type)) {
          let arr = batches.get(type);
          if (!arr) { arr = []; batches.set(type, arr); }
          arr.push({ pos, scale, rotationY });
          continue;
        }
        this._pushObjectTask(
          key,
          (r) => buildMesh(type, { position: pos.clone(), scale, rng: r }) ?? null,
          seed, rotationY, false, { type, category: 'vegetation', zone },
        );
      }
      for (const [type, list] of batches) {
        this._pushInstancedBatchTask(key, type, list, rng.nextInt(0x40000000), zone);
      }
    }

    // ── Ambient props (1–3) ───────────────────────────────────────────
    if (rng.chance(0.40)) {
      const propCount = rng.nextInt(2) + 1; // 1–3
      for (let i = 0; i < propCount; i++) {
        const px = worldX + rng.nextRange(3, SIZE - 3);
        const pz = worldZ + rng.nextRange(3, SIZE - 3);
        if (this.isUnderwater(px, pz)) continue;
        const py = this.terrain.getHeightAt(px, pz);
        const scale = rng.nextRange(0.7, 1.35);
        const rotationY = rng.nextRange(0, Math.PI * 2);
        const pos = new THREE.Vector3(px, py, pz);
        let propType = zone + '_prop';
        let buildFn: (r: SeededRng) => THREE.Object3D | null;
        if (registryEntry) {
          buildFn = (r) => registryEntry.propFn(pos.clone(), scale, r);
        } else {
          const pType = selectBiomePropType(biome, rng);
          if (pType) propType = pType;
          buildFn = (r) => (pType ? buildMesh(pType, { position: pos.clone(), scale, rng: r }) ?? null : null);
        }
        const seed = rng.nextInt(0x40000000);
        this._pushObjectTask(key, buildFn, seed, rotationY, false, { type: propType, category: 'prop', zone });
      }
    }
  }

  /** Enqueue an object build. `collideAlways` forces collision registration;
   *  otherwise it's registered only if the built object declares a collider. */
  private _pushObjectTask(
    key: string,
    buildFn: (rng: SeededRng) => THREE.Object3D | null,
    seed: number,
    rotationY: number,
    collideAlways: boolean,
    debug: DebugInfo,
  ): void {
    this.spawnTasks.push({ key, run: () => {
      if (!this.scene) return;
      const obj = buildFn(new SeededRng(seed, 0));
      if (!obj) return;
      obj.rotation.y = rotationY;
      this.scene.add(obj);
      const collide = collideAlways || obj.userData.isCollider ||
        obj.children.some((c) => c.userData.isCollider);
      if (collide) void this.collisionSystem?.addCollidableFiltered(obj);
      tagDebugInfo(obj, debug);
      this._trackObj(key, obj);
    } });
  }

  /** Enqueue a batched-instancing build: all placements of one instanceable
   *  type in a chunk collapse to one InstancedMesh per material + per-instance
   *  colliders. */
  private _pushInstancedBatchTask(
    key: string,
    type: string,
    instances: VegInstance[],
    seed: number,
    zone: string,
  ): void {
    this.spawnTasks.push({ key, run: () => {
      if (!this.scene) return;
      const batch = buildInstancedBatch(type, instances, new SeededRng(seed, 0));
      if (!batch) return;
      for (const obj of batch.objects) {
        this.scene.add(obj);
        tagDebugInfo(obj, { type, category: 'vegetation', zone });
        this._trackObj(key, obj);
      }
      if (batch.colliders) {
        this.scene.add(batch.colliders);
        void this.collisionSystem?.addCollidableFiltered(batch.colliders);
        this._trackObj(key, batch.colliders);
      }
    } });
  }

  private _trackObj(key: string, obj: THREE.Object3D): void {
    let arr = this.spawnedObjects.get(key);
    if (!arr) { arr = []; this.spawnedObjects.set(key, arr); }
    arr.push(obj);
  }

  private _trackNpc(key: string, id: string): void {
    let arr = this.spawnedNpcs.get(key);
    if (!arr) { arr = []; this.spawnedNpcs.set(key, arr); }
    arr.push(id);
  }
}
