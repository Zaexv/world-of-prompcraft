/**
 * WorldGenerator — Pure orchestrator for world chunk generation.
 *
 * Delegates terrain/vegetation/building/cave/NPC spawning to specialized helpers.
 * Manages chunk lifecycle, cleanup, and WebSocket communication.
 */

import * as THREE from 'three';
import type { EntityManager } from '../entities/EntityManager';
import type { WebSocketClient } from '../network/WebSocketClient';
import { createCaveEntrance } from '../scene/Caves';
import { createTown } from '../scene/Towns';
import type { Terrain } from '../scene/Terrain';
import type { Minimap } from '../ui/Minimap';
import { DUNGEONS } from '../scene/DungeonConfig';
import type { DungeonSystem } from './DungeonSystem';
import type { CollisionSystem } from './CollisionSystem';
import { BiomeManager } from './world/BiomeManager';
import { TerrainGenerator } from './world/TerrainGenerator';

const CHUNK_SIZE = 64;
const WATER_LEVEL = -4;

type ExclusionFootprint = { x: number; z: number; radius: number };

/** Deterministic hash for chunk position — used for cave/town placement. */
function chunkHash(cx: number, cz: number): number {
  let h = (cx * 374761393 + cz * 668265263) ^ 0x55555555;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return Math.abs(h);
}

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Spawns trees, caves, towns, and NPCs when new terrain chunks are loaded,
 * creating the feeling of an infinite, living world.
 *
 * This class is pure orchestrator — it delegates all content generation to specialized helpers.
 */
export class WorldGenerator {
  private generatedChunks: Set<string> = new Set();
  private scene: THREE.Scene;
  private terrain: Terrain;
  private entityManager: EntityManager;
  private ws: WebSocketClient;
  private minimap: Minimap | null = null;
  private dungeonSystem: DungeonSystem | null = null;
  private collisionSystem: CollisionSystem | null = null;
  private exclusionFootprints: ExclusionFootprint[] = [];

  private chunkObjects: Map<string, THREE.Object3D[]> = new Map();
  private chunkNPCs: Map<string, string[]> = new Map();
  private chunkEntrances: Map<string, string[]> = new Map();

  private biomeManager: BiomeManager;
  private terrainGenerator: TerrainGenerator;

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    entityManager: EntityManager,
    ws: WebSocketClient,
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.entityManager = entityManager;
    this.ws = ws;
    this.biomeManager = new BiomeManager();
    this.terrainGenerator = new TerrainGenerator();
  }

  /** Set minimap reference for registering markers. */
  setMinimap(minimap: Minimap): void {
    this.minimap = minimap;
  }

  /** Set dungeon system reference for registering entrances. */
  setDungeonSystem(ds: DungeonSystem): void {
    this.dungeonSystem = ds;
  }

  /** Set collision system so spawned trees become collidable. */
  setCollisionSystem(cs: CollisionSystem): void {
    this.collisionSystem = cs;
  }

  /** Prevent procedural spawns inside authored city/structure footprints. */
  setExclusionFootprints(footprints: ExclusionFootprint[]): void {
    this.exclusionFootprints = [...footprints];
  }

  /** Track a scene object for cleanup when its chunk unloads. */
  private trackObject(key: string, obj: THREE.Object3D): void {
    let arr = this.chunkObjects.get(key);
    if (!arr) { arr = []; this.chunkObjects.set(key, arr); }
    arr.push(obj);
  }

  /** Track an NPC ID for cleanup when its chunk unloads. */
  private trackNPC(key: string, npcId: string): void {
    let arr = this.chunkNPCs.get(key);
    if (!arr) { arr = []; this.chunkNPCs.set(key, arr); }
    arr.push(npcId);
  }

  /** Clean up all spawned objects and NPCs for a chunk. */
  onChunkUnloaded(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;

    // Remove scene objects (trees, caves, towns, portals)
    const objects = this.chunkObjects.get(key);
    if (objects) {
      for (const obj of objects) {
        this.scene.remove(obj);
        this.collisionSystem?.removeCollidable(obj);
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });
      }
      this.chunkObjects.delete(key);
    }

    // Remove NPCs
    const npcs = this.chunkNPCs.get(key);
    if (npcs) {
      for (const npcId of npcs) {
        this.entityManager.removeNPC(npcId);
      }
      this.chunkNPCs.delete(key);
    }

    // Remove dungeon entrance registrations
    const entrances = this.chunkEntrances.get(key);
    if (entrances && this.dungeonSystem) {
      for (const entranceId of entrances) {
        this.dungeonSystem.unregisterEntrance(entranceId);
      }
      this.chunkEntrances.delete(key);
    }

    this.generatedChunks.delete(key);
  }

  private isInExclusionFootprint(x: number, z: number, padding = 2.5): boolean {
    for (const fp of this.exclusionFootprints) {
      const dx = x - fp.x;
      const dz = z - fp.z;
      const r = fp.radius + padding;
      if (dx * dx + dz * dz <= r * r) return true;
    }
    return false;
  }

  /** Main entry point: called when a new terrain chunk loads. */
  onChunkLoaded(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.generatedChunks.has(key)) return;
    this.generatedChunks.add(key);

    // Orchestrate spawners
    this.spawnVegetation(chunkX, chunkZ, worldX, worldZ);
    this.spawnCaves(chunkX, chunkZ, worldX, worldZ);
    this.spawnTowns(chunkX, chunkZ, worldX, worldZ);
    this.spawnNPCs(chunkX, chunkZ, worldX, worldZ);
  }

  /**
   * Spawn trees for a chunk using TerrainGenerator.
   */
  private spawnVegetation(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const chunkKey = `${chunkX},${chunkZ}`;
    const centerX = worldX + CHUNK_SIZE * 0.5;
    const centerZ = worldZ + CHUNK_SIZE * 0.5;
    const biome = this.biomeManager.getBiomeAt(centerX, centerZ);
    const settings = this.biomeManager.getBiomeSettings(biome);

    for (let i = 0; i < settings.treeCount; i++) {
      const tx = worldX + Math.random() * CHUNK_SIZE;
      const tz = worldZ + Math.random() * CHUNK_SIZE;
      const ty = this.terrain.getHeightAt(tx, tz);

      if (ty < WATER_LEVEL) continue;
      if (this.isInExclusionFootprint(tx, tz)) continue;

      const scale = 0.5 + Math.random();
      const shape = pick(settings.allowedShapes);
      const tree = this.terrainGenerator.buildTree(shape, scale, settings.materials);

      tree.position.set(tx, ty, tz);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(tree);
      this.trackObject(chunkKey, tree);
      this.collisionSystem?.addCollidableFiltered(tree);
    }
  }

  /**
   * Spawn cave entrances and dungeon portals.
   */
  private spawnCaves(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const centerX = worldX + CHUNK_SIZE * 0.5;
    const centerZ = worldZ + CHUNK_SIZE * 0.5;
    const dist = Math.sqrt(centerX * centerX + centerZ * centerZ);
    if (dist < 80) return;

    const hash = chunkHash(chunkX, chunkZ);
    if (hash % 20 !== 0) return;

    const cx = worldX + 10 + (hash % 44);
    const cz = worldZ + 10 + ((hash >> 8) % 44);
    const cy = this.terrain.getHeightAt(cx, cz);
    if (cy < WATER_LEVEL) return;

    const caveKey = `${chunkX},${chunkZ}`;
    const caveGroup = createCaveEntrance(this.scene, this.terrain, cx, cz);
    if (caveGroup) {
      this.trackObject(caveKey, caveGroup);
      this.collisionSystem?.addCollidableFiltered(caveGroup);
    }
    if (this.minimap) this.minimap.addCave(cx, cz);

    const dungeonId = this.getDungeonForPosition(cx, cz);
    if (dungeonId && this.dungeonSystem) {
      const portalGroup = this.createDungeonPortal(cx, cy, cz, DUNGEONS[dungeonId].name);
      this.scene.add(portalGroup);
      this.trackObject(caveKey, portalGroup);
      const entranceId = `dungeon_${chunkX}_${chunkZ}`;
      this.dungeonSystem.registerEntrance(
        entranceId,
        new THREE.Vector3(cx, cy + 1, cz),
        dungeonId,
      );
      let entranceArr = this.chunkEntrances.get(caveKey);
      if (!entranceArr) { entranceArr = []; this.chunkEntrances.set(caveKey, entranceArr); }
      entranceArr.push(entranceId);
    }
  }

  /**
   * Spawn towns and citizens.
   */
  private spawnTowns(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const centerX = worldX + CHUNK_SIZE * 0.5;
    const centerZ = worldZ + CHUNK_SIZE * 0.5;
    const dist = Math.sqrt(centerX * centerX + centerZ * centerZ);
    if (dist < 150) return;

    const hash = chunkHash(chunkX + 999, chunkZ + 777);
    if (hash % 33 !== 0) return;

    const tx = worldX + CHUNK_SIZE * 0.3 + (hash % 20);
    const tz = worldZ + CHUNK_SIZE * 0.3 + ((hash >> 8) % 20);
    const ty = this.terrain.getHeightAt(tx, tz);
    if (ty < WATER_LEVEL + 2) return;

    const townKey = `${chunkX},${chunkZ}`;
    const townData = createTown(this.scene, this.terrain, tx, tz);
    if (townData.group) {
      this.trackObject(townKey, townData.group);
      this.collisionSystem?.addCollidableFiltered(townData.group);
    }
    if (this.minimap) this.minimap.addTown(tx, tz);

    const biome = this.biomeManager.getBiomeAt(tx, tz);
    const settings = this.biomeManager.getBiomeSettings(biome);

    for (let i = 0; i < townData.citizenSpots.length && i < 4; i++) {
      const spot = townData.citizenSpots[i];
      const ny = this.terrain.getHeightAt(spot.x, spot.z);
      if (ny < WATER_LEVEL) continue;

      const npcId = `citizen_${chunkX}_${chunkZ}_${i}`;
      if (this.entityManager.getNPC(npcId)) continue;

      const name = pick(settings.citizenNames);
      const position = new THREE.Vector3(spot.x, ny, spot.z);

      this.entityManager.addNPC({
        id: npcId,
        name,
        position,
        color: settings.citizenColor,
        behavior: 'friendly',
      });
      this.trackNPC(townKey, npcId);

      this.ws.send({
        type: 'explore_area',
        npcs: [{
          id: npcId,
          name,
          behavior: 'friendly',
          position: [spot.x, ny, spot.z],
        }],
      });
    }
  }

  /**
   * Spawn wilderness NPCs.
   */
  private spawnNPCs(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const centerX = worldX + CHUNK_SIZE * 0.5;
    const centerZ = worldZ + CHUNK_SIZE * 0.5;
    const distFromOrigin = Math.sqrt(centerX * centerX + centerZ * centerZ);
    if (distFromOrigin <= 100) return;

    const biome = this.biomeManager.getBiomeAt(centerX, centerZ);
    const settings = this.biomeManager.getBiomeSettings(biome);

    if (Math.random() > settings.npcSpawnChance) return;

    const nx = worldX + 10 + Math.random() * (CHUNK_SIZE - 20);
    const nz = worldZ + 10 + Math.random() * (CHUNK_SIZE - 20);
    const ny = this.terrain.getHeightAt(nx, nz);
    if (ny < WATER_LEVEL) return;

    const npcPool = this.biomeManager.getNPCPool(biome);
    const npcId = `gen_${chunkX}_${chunkZ}`;

    if (this.entityManager.getNPC(npcId)) return;

    const npcKey = `${chunkX},${chunkZ}`;
    const position = new THREE.Vector3(nx, ny, nz);
    const name = pick(npcPool.names);

    this.entityManager.addNPC({
      id: npcId,
      name,
      position,
      color: npcPool.color,
      behavior: npcPool.behavior,
    });
    this.trackNPC(npcKey, npcId);

    this.ws.send({
      type: 'explore_area',
      npcs: [{
        id: npcId,
        name,
        behavior: npcPool.behavior,
        position: [nx, ny, nz],
      }],
    });
  }

  /** Map world position to a dungeon ID based on the surrounding zone. */
  private getDungeonForPosition(x: number, z: number): string | null {
    if (z < -80) return "arcane_catacombs";
    if (x > 80) return "ember_depths";
    if (z > 80) return "crystal_caverns";
    if (x < -80) return "twilight_hollow";
    if (x > 0 && z < 0) return "arcane_catacombs";
    if (x > 0) return "ember_depths";
    if (z > 0) return "crystal_caverns";
    return "twilight_hollow";
  }

  /** Create a glowing portal torus with a name label above it. */
  private createDungeonPortal(x: number, y: number, z: number, _name: string): THREE.Group {
    const group = new THREE.Group();

    const torusGeo = new THREE.TorusGeometry(2, 0.2, 8, 24);
    const torusMat = new THREE.MeshStandardMaterial({
      color: 0x8844cc,
      emissive: 0x4422aa,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.rotation.x = Math.PI * 0.3;
    torus.position.y = 1;
    group.add(torus);

    const innerTorusGeo = new THREE.TorusGeometry(1.7, 0.1, 8, 24);
    const innerTorus = new THREE.Mesh(innerTorusGeo, torusMat);
    innerTorus.rotation.x = Math.PI * 0.5;
    innerTorus.position.y = 1.2;
    group.add(innerTorus);

    const light = new THREE.PointLight(0x8844cc, 1.5, 20);
    light.position.y = 1;
    group.add(light);

    group.position.set(x, y, z);
    return group;
  }
}
