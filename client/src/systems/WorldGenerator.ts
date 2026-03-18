import * as THREE from 'three';
import type { EntityManager } from '../entities/EntityManager';
import type { WebSocketClient } from '../network/WebSocketClient';

// ── Chunk size must match Terrain.ts ───────────────────────────────────────
const CHUNK_SIZE = 64;

// ── Water level — skip trees below this height ─────────────────────────────
const WATER_LEVEL = -4;

// ── NPC name pools ─────────────────────────────────────────────────────────
const FRIENDLY_NAMES = [
  "Wandering Traveler", "Forest Spirit", "Lost Explorer", "Moonwell Guardian",
  "Herb Gatherer", "Starlight Weaver", "Dusk Watcher", "Grove Tender",
];

const HOSTILE_NAMES = [
  "Forest Spider", "Shadow Wolf", "Corrupted Treant", "Feral Nightsaber",
  "Withered Ancient", "Plague Bat", "Nightmare Stalker",
];

const SENTINEL_NAMES = [
  "Sentinel Scout", "Druid Wanderer", "Priestess of Elune", "Moonguard",
  "Keeper of the Grove", "Nightsaber Rider", "Warden Initiate",
];

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Spawns trees and occasional NPCs when new terrain chunks are loaded,
 * creating the feeling of an infinite, living world.
 */
export class WorldGenerator {
  private generatedChunks: Set<string> = new Set();
  private scene: THREE.Scene;
  private terrain: { getHeightAt(x: number, z: number): number };
  private entityManager: EntityManager;
  private ws: WebSocketClient;

  // Shared materials for trees (created once, reused)
  private trunkMaterial: THREE.MeshStandardMaterial;
  private canopyMaterials: THREE.MeshStandardMaterial[];
  private trunkGeometry: THREE.CylinderGeometry;
  private canopyGeometry: THREE.ConeGeometry;

  constructor(
    scene: THREE.Scene,
    terrain: { getHeightAt(x: number, z: number): number },
    entityManager: EntityManager,
    ws: WebSocketClient,
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.entityManager = entityManager;
    this.ws = ws;

    // Shared trunk material
    this.trunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3520,
      roughness: 0.9,
    });

    // A few canopy color variations
    this.canopyMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x1a4a1a, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x224422, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x1a3a2a, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x2a4a2e, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x183818, roughness: 0.85 }),
    ];

    // Shared geometries
    this.trunkGeometry = new THREE.CylinderGeometry(0.15, 0.25, 2, 6);
    this.canopyGeometry = new THREE.ConeGeometry(1.2, 3, 7);
  }

  /** Called when a new terrain chunk is loaded. */
  onChunkLoaded(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.generatedChunks.has(key)) return;
    this.generatedChunks.add(key);

    this.spawnTrees(chunkX, chunkZ, worldX, worldZ);
    this.maybeSpawnNPC(chunkX, chunkZ, worldX, worldZ);
  }

  // ── Tree spawning ──────────────────────────────────────────────────────────

  private spawnTrees(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const treeCount = 3 + Math.floor(Math.random() * 6); // 3-8 trees

    for (let i = 0; i < treeCount; i++) {
      const tx = worldX + Math.random() * CHUNK_SIZE;
      const tz = worldZ + Math.random() * CHUNK_SIZE;
      const ty = this.terrain.getHeightAt(tx, tz);

      // Skip trees below water level
      if (ty < WATER_LEVEL) continue;

      // Random scale variation 0.5-1.5
      const scale = 0.5 + Math.random();

      const tree = new THREE.Group();

      // Trunk
      const trunk = new THREE.Mesh(this.trunkGeometry, this.trunkMaterial);
      trunk.position.y = scale;
      trunk.scale.set(scale, scale, scale);
      trunk.castShadow = true;
      tree.add(trunk);

      // Canopy
      const canopyMat = pick(this.canopyMaterials);
      const canopy = new THREE.Mesh(this.canopyGeometry, canopyMat);
      canopy.position.y = scale * 2 + scale * 1.5;
      canopy.scale.set(scale, scale, scale);
      canopy.castShadow = true;
      canopy.receiveShadow = true;
      tree.add(canopy);

      tree.position.set(tx, ty, tz);

      // Slight random rotation for variety
      tree.rotation.y = Math.random() * Math.PI * 2;

      this.scene.add(tree);
    }
  }

  // ── NPC spawning ───────────────────────────────────────────────────────────

  private maybeSpawnNPC(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    // Only spawn if chunk center is > 100 units from origin
    const centerX = worldX + CHUNK_SIZE * 0.5;
    const centerZ = worldZ + CHUNK_SIZE * 0.5;
    const distFromOrigin = Math.sqrt(centerX * centerX + centerZ * centerZ);
    if (distFromOrigin <= 100) return;

    // 20% chance per chunk
    if (Math.random() > 0.2) return;

    // Pick NPC position within chunk
    const nx = worldX + 10 + Math.random() * (CHUNK_SIZE - 20);
    const nz = worldZ + 10 + Math.random() * (CHUNK_SIZE - 20);
    const ny = this.terrain.getHeightAt(nx, nz);

    // Skip below water level
    if (ny < WATER_LEVEL) return;

    // Pick archetype
    const roll = Math.random();
    let name: string;
    let color: number;
    let behavior: string;

    if (roll < 0.4) {
      // Friendly
      name = pick(FRIENDLY_NAMES);
      color = 0x44cc44;
      behavior = "friendly";
    } else if (roll < 0.7) {
      // Hostile
      name = pick(HOSTILE_NAMES);
      color = 0xcc3300;
      behavior = "hostile";
    } else {
      // Night Elf Sentinel
      name = pick(SENTINEL_NAMES);
      color = 0x8844cc;
      behavior = "neutral";
    }

    const npcId = `gen_${chunkX}_${chunkZ}`;

    // Don't spawn if this ID already exists (shouldn't happen since we check generatedChunks)
    if (this.entityManager.getNPC(npcId)) return;

    const position = new THREE.Vector3(nx, ny, nz);
    this.entityManager.addNPC({
      id: npcId,
      name,
      position,
      color,
    });

    // Notify server to create an agent for this NPC
    this.ws.send({
      type: 'explore_area',
      npcs: [{
        id: npcId,
        name,
        behavior,
        position: [nx, ny, nz],
      }],
    });
  }
}
