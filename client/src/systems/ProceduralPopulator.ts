/**
 * ProceduralPopulator — deferred, proximity-gated world population.
 */

import * as THREE from 'three';
import { BiomeType, getDominantBiome } from '../scene/Biomes';
import { Water } from '../scene/Water';
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

  /** Update world population based on camera position. */
  update(cameraPos: THREE.Vector3): void {
    const chunkX = Math.floor(cameraPos.x / this.terrain.CHUNK_SIZE);
    const chunkZ = Math.floor(cameraPos.z / this.terrain.CHUNK_SIZE);

    // 1. Identify chunks to populate (5x5 grid around player)
    const RANGE = 2;
    for (let dx = -RANGE; dx <= RANGE; dx++) {
      for (let dz = -RANGE; dz <= RANGE; dz++) {
        const cx = chunkX + dx;
        const cz = chunkZ + dz;
        const key = `${cx},${cz}`;

        if (!this.populated.has(key) && !this._inQueue.has(key)) {
          this.queue.push({
            worldX: cx * this.terrain.CHUNK_SIZE,
            worldZ: cz * this.terrain.CHUNK_SIZE,
            chunkX,
            chunkZ,
            cx,
            cz,
          });
          this._inQueue.add(key);
          this._queueDirty = true;
        }
      }
    }

    // 2. Sort queue by proximity so near chunks spawn first
    if (this._queueDirty) {
      this.queue.sort((a, b) => {
        const da = Math.hypot(a.cx - chunkX, a.cz - chunkZ);
        const db = Math.hypot(b.cx - chunkX, b.cz - chunkZ);
        return da - db;
      });
      this._queueDirty = false;
    }

    // 3. Process limited number of chunks per frame to avoid lag spikes
    for (let i = 0; i < this.CHUNKS_PER_FRAME && this.queue.length > 0; i++) {
      const chunk = this.queue.shift()!;
      const key = `${chunk.cx},${chunk.cz}`;
      this._inQueue.delete(key);
      this._populateChunk(chunk);
      this.populated.add(key);
    }

    // 4. Release chunks that are too far away
    this._releaseDistantChunks(cameraPos);
  }

  private _populateChunk(chunk: PendingChunk): void {
    if (!this.scene || !this.collisionSystem || !this.entityManager) return;

    const rng = new SeededRng(chunk.cx, chunk.cz);
    const biome = getDominantBiome(chunk.worldX + this.terrain.CHUNK_SIZE / 2, chunk.worldZ + this.terrain.CHUNK_SIZE / 2);
    const key = `${chunk.cx},${chunk.cz}`;

    const objects: THREE.Object3D[] = [];
    const colliders: THREE.Object3D[] = [];
    const npcIds: string[] = [];

    // --- Biome Props (Trees, Rocks) ---
    const biomeData = getBiomeEntry(biome);
    const propDensity = biomeData.propDensity || 4;

    for (let i = 0; i < propDensity; i++) {
      const x = chunk.worldX + rng.next() * this.terrain.CHUNK_SIZE;
      const z = chunk.worldZ + rng.next() * this.terrain.CHUNK_SIZE;
      
      if (this.isUnderwater(x, z)) continue;

      const prop = buildBiomeProp(biome, rng);
      if (prop) {
        prop.position.set(x, this.terrain.getHeightAt(x, z), z);
        prop.rotation.y = rng.next() * Math.PI * 2;
        this.scene.add(prop);
        objects.push(prop);
        
        // Add to collision system if it has a collider
        prop.traverse((node) => {
          if (node.userData.isCollider) {
            this.collisionSystem?.addCollider(node as THREE.Mesh);
            colliders.push(node);
          }
        });
      }
    }

    // --- Biome Buildings (Rare) ---
    if (rng.chance(0.08)) {
      const x = chunk.worldX + rng.next() * this.terrain.CHUNK_SIZE;
      const z = chunk.worldZ + rng.next() * this.terrain.CHUNK_SIZE;
      
      if (!this.isUnderwater(x, z)) {
        const building = buildBiomeBuilding(biome, rng);
        if (building) {
          building.position.set(x, this.terrain.getHeightAt(x, z), z);
          building.rotation.y = rng.next() * Math.PI * 2;
          this.scene.add(building);
          objects.push(building);

          building.traverse((node) => {
            if (node.userData.isCollider) {
              this.collisionSystem?.addCollider(node as THREE.Mesh);
              colliders.push(node);
            }
          });
        }
      }
    }

    // --- Encounters ---
    const encounters = getEncountersFor(biome);
    if (encounters.length > 0 && rng.chance(0.15)) {
      const def = rng.pick(encounters);
      const x = chunk.worldX + rng.next() * this.terrain.CHUNK_SIZE;
      const z = chunk.worldZ + rng.next() * this.terrain.CHUNK_SIZE;

      if (!this.isUnderwater(x, z)) {
        const encounter = def.build(rng);
        encounter.position.set(x, this.terrain.getHeightAt(x, z), z);
        encounter.rotation.y = rng.next() * Math.PI * 2;
        this.scene.add(encounter);
        objects.push(encounter);

        encounter.traverse((node) => {
          if (node.userData.isCollider) {
            this.collisionSystem?.addCollider(node as THREE.Mesh);
            colliders.push(node);
          }
        });
      }
    }

    // --- Biome Monsters (Procedural NPCs) ---
    const monsterDefs = BIOME_MONSTERS[biome];
    if (monsterDefs && rng.chance(0.4) && this.entityManager.npcs.size < ProceduralPopulator.MAX_NPCS) {
      const def = rng.pick(monsterDefs);
      const x = chunk.worldX + rng.next() * this.terrain.CHUNK_SIZE;
      const z = chunk.worldZ + rng.next() * this.terrain.CHUNK_SIZE;

      if (!this.isUnderwater(x, z)) {
        // Deterministic ID derived from chunk and index
        const id = `proc_${key}_${npcIds.length}`;
        this.entityManager.addNPC({
          id,
          name: def.name,
          personality: `A feral ${def.name} from the ${biome} biome.`,
          position: [x, this.terrain.getHeightAt(x, z), z],
          scale: def.scale,
          hp: def.maxHp,
          maxHp: def.maxHp,
        });
        npcIds.push(id);
      }
    }

    this.spawnedObjects.set(key, objects);
    this.spawnedColliders.set(key, colliders);
    this.spawnedNpcs.set(key, npcIds);
    this._chunkCenters.set(key, [chunk.worldX + this.terrain.CHUNK_SIZE / 2, chunk.worldZ + this.terrain.CHUNK_SIZE / 2]);
  }

  private _releaseDistantChunks(cameraPos: THREE.Vector3): void {
    const RELEASE_RADIUS_SQ = (this.SPAWN_RADIUS + 100) ** 2;

    for (const [key, center] of this._chunkCenters.entries()) {
      const dx = center[0] - cameraPos.x;
      const dz = center[1] - cameraPos.z;
      if (dx * dx + dz * dz > RELEASE_RADIUS_SQ) {
        this._releaseChunk(key);
      }
    }
  }

  private _releaseChunk(key: string): void {
    // Release objects
    const objects = this.spawnedObjects.get(key);
    if (objects) {
      objects.forEach((obj) => this.scene?.remove(obj));
      this.spawnedObjects.delete(key);
    }

    // Release colliders
    const colliders = this.spawnedColliders.get(key);
    if (colliders) {
      colliders.forEach((node) => this.collisionSystem?.removeCollider(node as THREE.Mesh));
      this.spawnedColliders.delete(key);
    }

    // Release NPCs
    const npcIds = this.spawnedNpcs.get(key);
    if (npcIds) {
      npcIds.forEach((id) => this.entityManager?.removeNPC(id));
      this.spawnedNpcs.delete(key);
    }

    this.populated.delete(key);
    this._chunkCenters.delete(key);
  }
}
