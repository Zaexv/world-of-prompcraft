/**
 * ProceduralPopulator — deferred, proximity-gated world population.
 */

import * as THREE from 'three';
import { BiomeType, getDominantBiome } from '../scene/Biomes';
import type { Terrain } from '../scene/Terrain';
import type { CollisionSystem } from './CollisionSystem';
import type { EntityManager } from '../entities/EntityManager';
import { buildBiomeBuilding, buildBiomeProp } from './worldbuilder/objects/biomeProps';
import { getBiomeEntry } from './BiomeRegistry';
import { getEncountersFor } from './EncounterRegistry';
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
  nextRange(min: number, max: number): number { return min + this.next() * (max - min); }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: T[]): T { return arr[this.nextInt(arr.length)]; }
}

// ── Biome Monsters ────────────────────────────────────────────────────────────

interface MonsterDef {
  id: string;
  name: string;
  maxHp: number;
  scale: number;
}

const BIOME_MONSTERS: Partial<Record<BiomeType, MonsterDef[]>> = {
  [BiomeType.Teldrassil]: [
    { id: 'wraith', name: 'Teldrassil Wraith', maxHp: 60, scale: 1.2 },
    { id: 'spider', name: 'Forest Spider', maxHp: 40, scale: 0.8 },
  ],
  [BiomeType.EmberWastes]: [
    { id: 'elemental', name: 'Fire Elemental', maxHp: 120, scale: 1.5 },
    { id: 'drake', name: 'Ember Drake', maxHp: 200, scale: 2.2 },
  ],
  [BiomeType.CrystalTundra]: [
    { id: 'naga', name: 'Lake Naga', maxHp: 80, scale: 1.1 },
    { id: 'murloc', name: 'Crystal Murloc', maxHp: 30, scale: 0.7 },
  ],
};

// ── ProceduralPopulator ───────────────────────────────────────────────────────

interface PendingChunk {
  worldX: number;
  worldZ: number;
  chunkX: number;
  chunkZ: number;
  cx: number;
  cz: number;
}

export class ProceduralPopulator {
  private static readonly _v = new THREE.Vector3();

  private readonly CHUNKS_PER_FRAME = 1;
  private readonly SPAWN_RADIUS = 320; // Only spawn if within ~5 chunks
  // Hard cap on concurrent NPCs (procedural + server roster). Keeps the world
  // populated without overwhelming the scene.
  private static readonly MAX_NPCS = 22;

  private terrain: Terrain;
  private scene: THREE.Scene | null = null;
  private collisionSystem: CollisionSystem | null = null;
  private entityManager: EntityManager | null = null;

  private queue: PendingChunk[] = [];
  private _queueDirty = false;
  private populated = new Set<string>();
  private _inQueue = new Set<string>();

  private spawnedObjects = new Map<string, THREE.Object3D[]>();
  private spawnedColliders = new Map<string, THREE.Object3D[]>();
  private spawnedNpcs = new Map<string, string[]>();

  private _chunkCenters = new Map<string, [number, number]>();

  constructor(terrain: Terrain) {
    this.terrain = terrain;
  }

  setScene(scene: THREE.Scene): void { this.scene = scene; }
  setCollisionSystem(cs: CollisionSystem): void { this.collisionSystem = cs; }
  setEntityManager(em: EntityManager): void { this.entityManager = em; }

  queueChunk(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.populated.has(key) || this._inQueue.has(key)) return;

    this.queue.push({
      worldX, worldZ, chunkX, chunkZ,
      cx: worldX + 32,
      cz: worldZ + 32,
    });
    this._inQueue.add(key);
    this._queueDirty = true;
  }

  releaseChunk(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    this.populated.delete(key);
    this._inQueue.delete(key);
    this._chunkCenters.delete(key);

    const objs = this.spawnedObjects.get(key);
    if (objs && this.scene) {
      for (const obj of objs) this.scene.remove(obj);
      this.spawnedObjects.delete(key);
    }

    const colliders = this.spawnedColliders.get(key);
    if (colliders && this.collisionSystem) {
      for (const obj of colliders) this.collisionSystem.removeCollidable(obj);
      this.spawnedColliders.delete(key);
    }

    const npcIds = this.spawnedNpcs.get(key);
    if (npcIds && this.entityManager) {
      for (const id of npcIds) this.entityManager.removeNPC(id);
      this.spawnedNpcs.delete(key);
    }
  }

  /** Call with player world coordinates. Drains 1 chunk per frame. */
  update(playerX: number, playerZ: number): void {
    const pPos = ProceduralPopulator._v.set(playerX, 0, playerZ);
    
    if (this._queueDirty) {
      this.queue.sort((a, b) => {
        const da = pPos.distanceToSquared(ProceduralPopulator._v.set(a.cx, 0, a.cz));
        const db = pPos.distanceToSquared(ProceduralPopulator._v.set(b.cx, 0, b.cz));
        return da - db;
      });
      this._queueDirty = false;
    }

    let done = 0;
    while (done < this.CHUNKS_PER_FRAME && this.queue.length > 0) {
      const next = this.queue.shift()!;
      const key = `${next.chunkX},${next.chunkZ}`;
      this._inQueue.delete(key);

      const dSq = pPos.distanceToSquared(ProceduralPopulator._v.set(next.cx, 0, next.cz));
      if (dSq > this.SPAWN_RADIUS * this.SPAWN_RADIUS) {
        continue;
      }

      if (!this.populated.has(key)) {
        this.populated.add(key);
        this._populate(next, key);
        done++;
      }
    }
  }

  private _populate(chunk: PendingChunk, key: string): void {
    const { worldX, worldZ, chunkX, chunkZ, cx, cz } = chunk;
    const SIZE = 64;
    const dist = Math.sqrt(cx * cx + cz * cz);
    const biome = getDominantBiome(cx, cz);
    const rng = new SeededRng(chunkX, chunkZ, 0xdeadbeef);
    const registryEntry = getBiomeEntry(biome);

    const objs: THREE.Object3D[] = [];
    const colliders: THREE.Object3D[] = [];
    const npcIds: string[] = [];

    this._chunkCenters.set(key, [cx, cz]);

    const eligibleEncounters = getEncountersFor(biome, dist);
    if (eligibleEncounters.length > 0) {
      for (const enc of eligibleEncounters) {
        if (!rng.chance(enc.chance)) continue;

        const ex = worldX + rng.nextRange(8, SIZE - 8);
        const ez = worldZ + rng.nextRange(8, SIZE - 8);
        const ey = this.terrain.getHeightAt(ex, ez);
        const anchor = ProceduralPopulator._v.set(ex, ey, ez);

        const group = enc.buildFn(anchor, rng);
        if (this.scene) {
          group.rotation.y = rng.nextRange(0, Math.PI * 2);
          this.scene.add(group);
          objs.push(group);
          colliders.push(group);
        }

        const underNpcCap = this.entityManager
          ? this.entityManager.npcs.size < ProceduralPopulator.MAX_NPCS
          : false;
        if (enc.npcs && this.entityManager && underNpcCap) {
          let npcIdx = 0;
          for (const npcDef of enc.npcs) {
            const localX = npcDef.offsetX, localZ = npcDef.offsetZ;
            const gy = group.rotation.y;
            const nx = ex + Math.cos(gy) * localX - Math.sin(gy) * localZ;
            const nz = ez + Math.sin(gy) * localX + Math.cos(gy) * localZ;
            const ny = this.terrain.getHeightAt(nx, nz);
            const npcId = `enc_${enc.id}_${npcDef.idPrefix}_${chunkX}_${chunkZ}_${npcIdx++}`;
            this.entityManager.addNPC({
              id: npcId,
              name: npcDef.name,
              personalityKey: npcDef.hostile ? 'road_bandit' : 'wandering_knight',
              position: new THREE.Vector3(nx, ny, nz),
              hp: npcDef.maxHp, maxHp: npcDef.maxHp,
              personality: npcDef.hostile
                ? `Hostile — attack on sight.`
                : `Friendly wanderer — peaceful, will converse.`,
              scale: npcDef.scale,
            });
            npcIds.push(npcId);
          }
        }
        break;
      }
    }

    if (rng.chance(0.20)) {
      const bx = worldX + rng.nextRange(8, SIZE - 8);
      const bz = worldZ + rng.nextRange(8, SIZE - 8);
      const by = this.terrain.getHeightAt(bx, bz);
      const pos = ProceduralPopulator._v.set(bx, by, bz);

      const building = registryEntry
        ? registryEntry.buildingFn(pos, rng, dist)
        : buildBiomeBuilding(biome, pos, rng, dist);

      if (building && this.scene) {
        building.rotation.y = rng.nextRange(0, Math.PI * 2);
        this.scene.add(building);
        objs.push(building);
        colliders.push(building);
      }
    }

    const monsterChance = Math.min(0.22, 0.04 + dist * 0.0004);
    if (rng.chance(monsterChance) && this.entityManager &&
        this.entityManager.npcs.size < ProceduralPopulator.MAX_NPCS) {
      const defs: MonsterDef[] = (registryEntry?.monsters
        ?? BIOME_MONSTERS[biome]
        ?? BIOME_MONSTERS[BiomeType.Teldrassil]!) as MonsterDef[];
      const count = 1;
      for (let i = 0; i < count; i++) {
        const mx = worldX + rng.nextRange(6, SIZE - 6);
        const mz = worldZ + rng.nextRange(6, SIZE - 6);
        const my = this.terrain.getHeightAt(mx, mz);
        const def = rng.pick(defs);
        const npcId = `proc_${def.id}_${chunkX}_${chunkZ}_${i}`;
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

    if (rng.chance(0.60)) {
      const propCount = rng.nextInt(4) + 3;
      for (let i = 0; i < propCount; i++) {
        const px = worldX + rng.nextRange(3, SIZE - 3);
        const pz = worldZ + rng.nextRange(3, SIZE - 3);
        const py = this.terrain.getHeightAt(px, pz);
        const pos = ProceduralPopulator._v.set(px, py, pz);
        const scale = rng.nextRange(0.7, 1.35);

        const prop = registryEntry
          ? registryEntry.propFn(pos, scale, rng)
          : buildBiomeProp(biome, pos, scale, rng);

        if (prop && this.scene) {
          prop.rotation.y = rng.nextRange(0, Math.PI * 2);
          this.scene.add(prop);
          objs.push(prop);
        }
      }
    }

    if (objs.length > 0) this.spawnedObjects.set(key, objs);
    if (colliders.length > 0) this.spawnedColliders.set(key, colliders);
    if (npcIds.length > 0) this.spawnedNpcs.set(key, npcIds);
  }
}
