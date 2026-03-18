import * as THREE from 'three';
import type { EntityManager } from '../entities/EntityManager';
import type { WebSocketClient } from '../network/WebSocketClient';
import { BiomeType, getDominantBiome } from '../scene/Biomes';
import { createCaveEntrance } from '../scene/Caves';
import { createTown } from '../scene/Towns';
import type { Terrain } from '../scene/Terrain';
import type { Minimap } from '../ui/Minimap';

// ── Chunk size must match Terrain.ts ───────────────────────────────────────
const CHUNK_SIZE = 64;

// ── Water level — skip objects below this height ───────────────────────────
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

// ── Biome-specific NPC pools ────────────────────────────────────────────────
const EMBER_HOSTILE_NAMES = [
  "Lava Elemental", "Ash Crawler", "Fire Spirit", "Molten Golem",
  "Cinder Wyrm", "Magma Stalker", "Scorched Revenant",
];
const EMBER_FRIENDLY_NAMES = [
  "Flamecaller Hermit", "Obsidian Smith", "Ember Watcher", "Forge Keeper",
];

const TUNDRA_HOSTILE_NAMES = [
  "Frost Wraith", "Ice Shard Golem", "Frozen Stalker", "Blizzard Hound",
];
const TUNDRA_FRIENDLY_NAMES = [
  "Crystal Sage", "Frostweaver", "Tundra Nomad", "Ice Scholar",
  "Aurora Watcher", "Glacier Hermit",
];

const MARSH_HOSTILE_NAMES = [
  "Bog Lurker", "Swamp Hydra", "Mire Crawler", "Rotting Treant",
  "Venomous Toad", "Marsh Wraith",
];
const MARSH_FRIENDLY_NAMES = [
  "Swamp Herbalist", "Marsh Druid", "Bog Witch", "Wetland Sage",
];

const MEADOW_FRIENDLY_NAMES = [
  "Shepherd", "Meadow Sprite", "Sunweaver", "Harvest Guardian",
  "Wildflower Druid", "Beekeeper", "Golden Hart",
];

// ── Town citizen names per biome ────────────────────────────────────────────
const CITIZEN_NAMES: Record<BiomeType, string[]> = {
  [BiomeType.Teldrassil]: [
    "Village Elder", "Moonweaver", "Night Elf Artisan", "Herb Tender",
    "Starlight Bard", "Elven Baker", "Runekeeper Apprentice",
  ],
  [BiomeType.EmberWastes]: [
    "Ashen Smith", "Ember Merchant", "Lava Miner", "Firesworn Healer",
    "Obsidian Carver", "Cinder Cook",
  ],
  [BiomeType.CrystalTundra]: [
    "Frost Artisan", "Ice Fisher", "Tundra Weaver", "Crystal Polisher",
    "Northern Healer", "Glacier Guide",
  ],
  [BiomeType.TwilightMarsh]: [
    "Marsh Fisher", "Bog Farmer", "Moss Gatherer", "Swamp Brewer",
    "Reed Weaver", "Toad Keeper",
  ],
  [BiomeType.SunlitMeadows]: [
    "Farmer", "Miller", "Meadow Healer", "Shepherd's Wife",
    "Beekeeper", "Harvest Dancer", "Sunflower Gardener",
  ],
};

// ── Town citizen colors per biome ───────────────────────────────────────────
const CITIZEN_COLORS: Record<BiomeType, number> = {
  [BiomeType.Teldrassil]: 0x88aaff,
  [BiomeType.EmberWastes]: 0xcc8844,
  [BiomeType.CrystalTundra]: 0xaaccee,
  [BiomeType.TwilightMarsh]: 0x66aa66,
  [BiomeType.SunlitMeadows]: 0xbbaa44,
};

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Deterministic hash for chunk position — used for cave/town placement. */
function chunkHash(cx: number, cz: number): number {
  let h = (cx * 374761393 + cz * 668265263) ^ 0x55555555;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return Math.abs(h);
}

// ── Tree shape types ────────────────────────────────────────────────────────
enum TreeShape {
  Cone,       // standard conical (pine-like)
  Round,      // spherical canopy (oak-like)
  Tall,       // tall thin pine
  Weeping,    // drooping canopy
  Dead,       // bare branches (ember wastes)
  Crystal,    // crystal spire (tundra)
  Mushroom,   // flat cap (marsh)
}

// Which shapes are allowed per biome
const BIOME_TREES: Record<BiomeType, TreeShape[]> = {
  [BiomeType.Teldrassil]: [TreeShape.Cone, TreeShape.Round, TreeShape.Tall, TreeShape.Weeping],
  [BiomeType.EmberWastes]: [TreeShape.Dead, TreeShape.Cone],
  [BiomeType.CrystalTundra]: [TreeShape.Crystal, TreeShape.Tall, TreeShape.Cone],
  [BiomeType.TwilightMarsh]: [TreeShape.Mushroom, TreeShape.Weeping, TreeShape.Round],
  [BiomeType.SunlitMeadows]: [TreeShape.Round, TreeShape.Cone, TreeShape.Tall],
};

/**
 * Spawns trees, caves, towns, and NPCs when new terrain chunks are loaded,
 * creating the feeling of an infinite, living world.
 */
export class WorldGenerator {
  private generatedChunks: Set<string> = new Set();
  private scene: THREE.Scene;
  private terrain: Terrain;
  private entityManager: EntityManager;
  private ws: WebSocketClient;
  private minimap: Minimap | null = null;

  // Shared materials for trees (created once, reused)
  private trunkMaterial: THREE.MeshStandardMaterial;
  private canopyMaterials: THREE.MeshStandardMaterial[];

  // Shared geometries for different tree shapes
  private trunkGeometry: THREE.CylinderGeometry;
  private coneCanopyGeo: THREE.ConeGeometry;
  private roundCanopyGeo: THREE.SphereGeometry;
  private tallCanopyGeo: THREE.ConeGeometry;
  private weepingCanopyGeo: THREE.SphereGeometry;
  private deadBranchGeo: THREE.CylinderGeometry;
  private crystalGeo: THREE.ConeGeometry;
  private mushroomCapGeo: THREE.CylinderGeometry;
  private vineGeo: THREE.CylinderGeometry;
  private vineMat: THREE.MeshStandardMaterial;
  private charMat: THREE.MeshStandardMaterial;
  private crystalMat: THREE.MeshStandardMaterial;

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

    // Shared geometries — different tree shapes
    this.trunkGeometry = new THREE.CylinderGeometry(0.15, 0.25, 2, 6);
    this.coneCanopyGeo = new THREE.ConeGeometry(1.2, 3, 7);
    this.roundCanopyGeo = new THREE.SphereGeometry(1.5, 7, 5);
    this.tallCanopyGeo = new THREE.ConeGeometry(0.8, 4.5, 7);
    this.weepingCanopyGeo = new THREE.SphereGeometry(1.8, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.7);
    this.deadBranchGeo = new THREE.CylinderGeometry(0.04, 0.08, 1.5, 4);
    this.crystalGeo = new THREE.ConeGeometry(0.5, 3, 5);
    this.mushroomCapGeo = new THREE.CylinderGeometry(1.5, 0.3, 0.5, 8);
    this.vineGeo = new THREE.CylinderGeometry(0.02, 0.015, 2, 3);
    this.vineMat = new THREE.MeshStandardMaterial({ color: 0x1a3a15, roughness: 0.9 });
    this.charMat = new THREE.MeshStandardMaterial({ color: 0x1a0a05, roughness: 1.0 });
    this.crystalMat = new THREE.MeshStandardMaterial({
      color: 0x6a9abb,
      emissive: 0x223344,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.2,
    });
  }

  /** Set minimap reference for registering markers. */
  setMinimap(minimap: Minimap): void {
    this.minimap = minimap;
  }

  // ── Biome-specific materials (lazy-created) ────────────────────────────────
  private biomeMaterials: Map<BiomeType, { trunk: THREE.MeshStandardMaterial; canopy: THREE.MeshStandardMaterial[] }> = new Map();

  private getBiomeMaterials(biome: BiomeType) {
    if (this.biomeMaterials.has(biome)) return this.biomeMaterials.get(biome)!;

    let trunk: THREE.MeshStandardMaterial;
    let canopy: THREE.MeshStandardMaterial[];

    switch (biome) {
      case BiomeType.EmberWastes:
        trunk = new THREE.MeshStandardMaterial({ color: 0x2a1a0a, roughness: 0.95 });
        canopy = [
          new THREE.MeshStandardMaterial({ color: 0x3a1a0a, roughness: 0.8 }),
          new THREE.MeshStandardMaterial({ color: 0x4a2010, roughness: 0.8 }),
          new THREE.MeshStandardMaterial({ color: 0x2a0a0a, roughness: 0.85 }),
        ];
        break;
      case BiomeType.CrystalTundra:
        trunk = new THREE.MeshStandardMaterial({ color: 0x5a6a7a, roughness: 0.7 });
        canopy = [
          new THREE.MeshStandardMaterial({ color: 0x6a8aaa, roughness: 0.6, emissive: 0x112233, emissiveIntensity: 0.3 }),
          new THREE.MeshStandardMaterial({ color: 0x8aaabb, roughness: 0.55 }),
          new THREE.MeshStandardMaterial({ color: 0x5a7a9a, roughness: 0.65 }),
        ];
        break;
      case BiomeType.TwilightMarsh:
        trunk = new THREE.MeshStandardMaterial({ color: 0x1a2a10, roughness: 0.95 });
        canopy = [
          new THREE.MeshStandardMaterial({ color: 0x1a3a15, roughness: 0.9 }),
          new THREE.MeshStandardMaterial({ color: 0x0a2a0a, roughness: 0.9 }),
          new THREE.MeshStandardMaterial({ color: 0x2a3a20, roughness: 0.85, emissive: 0x112a11, emissiveIntensity: 0.2 }),
        ];
        break;
      case BiomeType.SunlitMeadows:
        trunk = new THREE.MeshStandardMaterial({ color: 0x5a4a2a, roughness: 0.85 });
        canopy = [
          new THREE.MeshStandardMaterial({ color: 0x4a6a2a, roughness: 0.75 }),
          new THREE.MeshStandardMaterial({ color: 0x5a7a3a, roughness: 0.7 }),
          new THREE.MeshStandardMaterial({ color: 0x6a8a4a, roughness: 0.75 }),
        ];
        break;
      default: // Teldrassil
        return { trunk: this.trunkMaterial, canopy: this.canopyMaterials };
    }

    const entry = { trunk, canopy };
    this.biomeMaterials.set(biome, entry);
    return entry;
  }

  /** Called when a new terrain chunk is loaded. */
  onChunkLoaded(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.generatedChunks.has(key)) return;
    this.generatedChunks.add(key);

    this.spawnTrees(chunkX, chunkZ, worldX, worldZ);
    this.maybeSpawnCave(chunkX, chunkZ, worldX, worldZ);
    this.maybeSpawnTown(chunkX, chunkZ, worldX, worldZ);
    this.maybeSpawnNPC(chunkX, chunkZ, worldX, worldZ);
  }

  // ── Tree spawning (varied shapes) ────────────────────────────────────────

  private spawnTrees(_chunkX: number, _chunkZ: number, worldX: number, worldZ: number): void {
    const centerX = worldX + CHUNK_SIZE * 0.5;
    const centerZ = worldZ + CHUNK_SIZE * 0.5;
    const biome = getDominantBiome(centerX, centerZ);

    // Biome-specific tree density
    let treeCount: number;
    switch (biome) {
      case BiomeType.EmberWastes:
        treeCount = 1 + Math.floor(Math.random() * 3);
        break;
      case BiomeType.CrystalTundra:
        treeCount = 1 + Math.floor(Math.random() * 4);
        break;
      case BiomeType.TwilightMarsh:
        treeCount = 4 + Math.floor(Math.random() * 5);
        break;
      case BiomeType.SunlitMeadows:
        treeCount = 2 + Math.floor(Math.random() * 3);
        break;
      default:
        treeCount = 3 + Math.floor(Math.random() * 6);
    }

    const mats = this.getBiomeMaterials(biome);
    const allowedShapes = BIOME_TREES[biome];

    for (let i = 0; i < treeCount; i++) {
      const tx = worldX + Math.random() * CHUNK_SIZE;
      const tz = worldZ + Math.random() * CHUNK_SIZE;
      const ty = this.terrain.getHeightAt(tx, tz);

      if (ty < WATER_LEVEL) continue;

      const scale = 0.5 + Math.random();
      const shape = pick(allowedShapes);
      const tree = this.buildTree(shape, scale, mats);

      tree.position.set(tx, ty, tz);
      tree.rotation.y = Math.random() * Math.PI * 2;
      this.scene.add(tree);
    }
  }

  /** Build a tree group from a shape type. */
  private buildTree(
    shape: TreeShape,
    scale: number,
    mats: { trunk: THREE.MeshStandardMaterial; canopy: THREE.MeshStandardMaterial[] },
  ): THREE.Group {
    const tree = new THREE.Group();

    // Trunk (shared by most shapes)
    const trunk = new THREE.Mesh(this.trunkGeometry, mats.trunk);
    trunk.position.y = scale;
    trunk.scale.set(scale, scale, scale);
    trunk.castShadow = true;

    switch (shape) {
      case TreeShape.Cone: {
        tree.add(trunk);
        const canopy = new THREE.Mesh(this.coneCanopyGeo, pick(mats.canopy));
        canopy.position.y = scale * 2 + scale * 1.5;
        canopy.scale.set(scale, scale, scale);
        canopy.castShadow = true;
        canopy.receiveShadow = true;
        tree.add(canopy);
        break;
      }
      case TreeShape.Round: {
        tree.add(trunk);
        const canopy = new THREE.Mesh(this.roundCanopyGeo, pick(mats.canopy));
        canopy.position.y = scale * 2 + scale * 1.5;
        canopy.scale.set(scale * 1.2, scale * 0.9, scale * 1.2);
        canopy.castShadow = true;
        canopy.receiveShadow = true;
        tree.add(canopy);
        break;
      }
      case TreeShape.Tall: {
        // Taller trunk
        trunk.scale.set(scale * 0.7, scale * 1.5, scale * 0.7);
        trunk.position.y = scale * 1.5;
        tree.add(trunk);
        const canopy = new THREE.Mesh(this.tallCanopyGeo, pick(mats.canopy));
        canopy.position.y = scale * 3 + scale * 1.5;
        canopy.scale.set(scale, scale, scale);
        canopy.castShadow = true;
        canopy.receiveShadow = true;
        tree.add(canopy);
        break;
      }
      case TreeShape.Weeping: {
        tree.add(trunk);
        // Round canopy
        const canopy = new THREE.Mesh(this.weepingCanopyGeo, pick(mats.canopy));
        canopy.position.y = scale * 2 + scale * 1.0;
        canopy.scale.set(scale * 1.3, scale, scale * 1.3);
        canopy.castShadow = true;
        tree.add(canopy);
        // Hanging vine strands (reuse shared geo+mat)
        for (let v = 0; v < 5; v++) {
          const angle = (v / 5) * Math.PI * 2 + Math.random() * 0.5;
          const vine = new THREE.Mesh(this.vineGeo, this.vineMat);
          vine.position.set(
            Math.cos(angle) * scale * 1.0,
            scale * 1.5,
            Math.sin(angle) * scale * 1.0,
          );
          vine.scale.set(1, scale, 1);
          tree.add(vine);
        }
        break;
      }
      case TreeShape.Dead: {
        // Charred trunk, no canopy — just bare branches
        const charTrunk = new THREE.Mesh(this.trunkGeometry, this.charMat);
        charTrunk.position.y = scale;
        charTrunk.scale.set(scale, scale * 1.2, scale);
        charTrunk.castShadow = true;
        tree.add(charTrunk);
        // Bare branches
        for (let b = 0; b < 4; b++) {
          const branch = new THREE.Mesh(this.deadBranchGeo, this.charMat);
          const angle = (b / 4) * Math.PI * 2 + Math.random() * 0.5;
          branch.position.set(
            Math.cos(angle) * scale * 0.3,
            scale * 1.5 + b * scale * 0.3,
            Math.sin(angle) * scale * 0.3,
          );
          branch.rotation.set(
            Math.sin(angle) * 0.6,
            0,
            -Math.cos(angle) * 0.6,
          );
          branch.scale.set(scale, scale, scale);
          branch.castShadow = true;
          tree.add(branch);
        }
        break;
      }
      case TreeShape.Crystal: {
        // Icy crystal spire — no trunk, just crystal formations
        const mainCrystal = new THREE.Mesh(this.crystalGeo, this.crystalMat);
        mainCrystal.position.y = scale * 1.5;
        mainCrystal.scale.set(scale, scale, scale);
        mainCrystal.castShadow = true;
        tree.add(mainCrystal);
        // Smaller satellite crystals
        for (let c = 0; c < 3; c++) {
          const small = new THREE.Mesh(this.crystalGeo, this.crystalMat);
          const angle = (c / 3) * Math.PI * 2 + Math.random() * 0.5;
          small.position.set(
            Math.cos(angle) * scale * 0.5,
            scale * 0.8 + Math.random() * scale * 0.5,
            Math.sin(angle) * scale * 0.5,
          );
          small.scale.set(scale * 0.4, scale * 0.6, scale * 0.4);
          small.rotation.z = (Math.random() - 0.5) * 0.5;
          small.castShadow = true;
          tree.add(small);
        }
        break;
      }
      case TreeShape.Mushroom: {
        // Short thick trunk + flat cap
        const mushTrunk = new THREE.Mesh(this.trunkGeometry, mats.trunk);
        mushTrunk.position.y = scale * 0.5;
        mushTrunk.scale.set(scale * 1.3, scale * 0.6, scale * 1.3);
        mushTrunk.castShadow = true;
        tree.add(mushTrunk);
        const cap = new THREE.Mesh(this.mushroomCapGeo, pick(mats.canopy));
        cap.position.y = scale * 1.2;
        cap.scale.set(scale, scale * 0.5, scale);
        cap.castShadow = true;
        cap.receiveShadow = true;
        tree.add(cap);
        break;
      }
    }

    return tree;
  }

  // ── Cave spawning ────────────────────────────────────────────────────────

  private maybeSpawnCave(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const centerX = worldX + CHUNK_SIZE * 0.5;
    const centerZ = worldZ + CHUNK_SIZE * 0.5;
    const dist = Math.sqrt(centerX * centerX + centerZ * centerZ);
    if (dist < 80) return; // no caves near spawn

    // Deterministic: ~5% of chunks get a cave
    const hash = chunkHash(chunkX, chunkZ);
    if (hash % 20 !== 0) return;

    const cx = worldX + 10 + (hash % 44);
    const cz = worldZ + 10 + ((hash >> 8) % 44);
    const cy = this.terrain.getHeightAt(cx, cz);
    if (cy < WATER_LEVEL) return;

    createCaveEntrance(this.scene, this.terrain, cx, cz);
    if (this.minimap) this.minimap.addCave(cx, cz);
  }

  // ── Town spawning ────────────────────────────────────────────────────────

  private maybeSpawnTown(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const centerX = worldX + CHUNK_SIZE * 0.5;
    const centerZ = worldZ + CHUNK_SIZE * 0.5;
    const dist = Math.sqrt(centerX * centerX + centerZ * centerZ);
    if (dist < 150) return; // no towns near spawn

    // Deterministic: ~3% of chunks get a town
    const hash = chunkHash(chunkX + 999, chunkZ + 777);
    if (hash % 33 !== 0) return;

    const tx = worldX + CHUNK_SIZE * 0.3 + (hash % 20);
    const tz = worldZ + CHUNK_SIZE * 0.3 + ((hash >> 8) % 20);
    const ty = this.terrain.getHeightAt(tx, tz);
    if (ty < WATER_LEVEL + 2) return;

    const townData = createTown(this.scene, this.terrain, tx, tz);
    if (this.minimap) this.minimap.addTown(tx, tz);

    // Spawn peaceful citizens at the town
    const biome = getDominantBiome(tx, tz);
    const names = CITIZEN_NAMES[biome];
    const color = CITIZEN_COLORS[biome];

    for (let i = 0; i < townData.citizenSpots.length && i < 4; i++) {
      const spot = townData.citizenSpots[i];
      const ny = this.terrain.getHeightAt(spot.x, spot.z);
      if (ny < WATER_LEVEL) continue;

      const npcId = `citizen_${chunkX}_${chunkZ}_${i}`;
      if (this.entityManager.getNPC(npcId)) continue;

      const name = pick(names);
      const position = new THREE.Vector3(spot.x, ny, spot.z);

      this.entityManager.addNPC({
        id: npcId,
        name,
        position,
        color,
      });

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

    // Biome-aware NPC archetype selection
    const biome = getDominantBiome(nx, nz);
    const roll = Math.random();
    let name: string;
    let color: number;
    let behavior: string;

    switch (biome) {
      case BiomeType.EmberWastes:
        if (roll < 0.6) {
          name = pick(EMBER_HOSTILE_NAMES);
          color = 0xff4400;
          behavior = "hostile";
        } else {
          name = pick(EMBER_FRIENDLY_NAMES);
          color = 0xcc8833;
          behavior = "friendly";
        }
        break;
      case BiomeType.CrystalTundra:
        if (roll < 0.3) {
          name = pick(TUNDRA_HOSTILE_NAMES);
          color = 0x4488cc;
          behavior = "hostile";
        } else {
          name = pick(TUNDRA_FRIENDLY_NAMES);
          color = 0x88bbdd;
          behavior = "friendly";
        }
        break;
      case BiomeType.TwilightMarsh:
        if (roll < 0.5) {
          name = pick(MARSH_HOSTILE_NAMES);
          color = 0x338833;
          behavior = "hostile";
        } else {
          name = pick(MARSH_FRIENDLY_NAMES);
          color = 0x55aa55;
          behavior = "neutral";
        }
        break;
      case BiomeType.SunlitMeadows:
        if (roll < 0.2) {
          name = pick(HOSTILE_NAMES);
          color = 0xcc3300;
          behavior = "hostile";
        } else {
          name = pick(MEADOW_FRIENDLY_NAMES);
          color = 0x88aa44;
          behavior = "friendly";
        }
        break;
      default: // Teldrassil
        if (roll < 0.4) {
          name = pick(FRIENDLY_NAMES);
          color = 0x44cc44;
          behavior = "friendly";
        } else if (roll < 0.7) {
          name = pick(HOSTILE_NAMES);
          color = 0xcc3300;
          behavior = "hostile";
        } else {
          name = pick(SENTINEL_NAMES);
          color = 0x8844cc;
          behavior = "neutral";
        }
    }

    const npcId = `gen_${chunkX}_${chunkZ}`;

    // Don't spawn if this ID already exists
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
