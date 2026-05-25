/**
 * BiomeManager — Encapsulates all biome-specific data and lookup logic.
 *
 * Replaces scattered biome constants in WorldGenerator with organized biome definitions,
 * material management, and configuration lookup.
 */

import * as THREE from 'three';
import { BiomeType, getDominantBiome } from '../../scene/Biomes';

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

// ── Tree shape types ────────────────────────────────────────────────────────
export enum TreeShape {
  Cone,       // standard conical (pine-like)
  Round,      // spherical canopy (oak-like)
  Tall,       // tall thin pine
  Weeping,    // drooping canopy
  Dead,       // bare branches (ember wastes)
  Crystal,    // crystal spire (tundra)
  Mushroom,   // flat cap (marsh)
}

// ── Which shapes are allowed per biome ─────────────────────────────────────
const BIOME_TREES: Record<BiomeType, TreeShape[]> = {
  [BiomeType.Teldrassil]: [TreeShape.Cone, TreeShape.Round, TreeShape.Tall, TreeShape.Weeping],
  [BiomeType.EmberWastes]: [TreeShape.Dead, TreeShape.Cone],
  [BiomeType.CrystalTundra]: [TreeShape.Crystal, TreeShape.Tall, TreeShape.Cone],
  [BiomeType.TwilightMarsh]: [TreeShape.Mushroom, TreeShape.Weeping, TreeShape.Round],
  [BiomeType.SunlitMeadows]: [TreeShape.Round, TreeShape.Cone, TreeShape.Tall],
};

export interface BiomeMaterials {
  trunk: THREE.MeshStandardMaterial;
  canopy: THREE.MeshStandardMaterial[];
}

export interface BiomeSettings {
  treeCount: number;
  allowedShapes: TreeShape[];
  materials: BiomeMaterials;
  citizenNames: string[];
  citizenColor: number;
  npcSpawnChance: number;
}

/**
 * BiomeManager — Centralized biome logic.
 */
export class BiomeManager {
  private biomeMaterials: Map<BiomeType, BiomeMaterials> = new Map();
  private defaultCanopyMaterials: THREE.MeshStandardMaterial[];
  private defaultTrunkMaterial: THREE.MeshStandardMaterial;

  constructor() {
    // Default Teldrassil materials
    this.defaultTrunkMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a3520,
      roughness: 0.9,
    });

    this.defaultCanopyMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x1a4a1a, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x224422, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x1a3a2a, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x2a4a2e, roughness: 0.85 }),
      new THREE.MeshStandardMaterial({ color: 0x183818, roughness: 0.85 }),
    ];
  }

  /** Get biome at world position. */
  getBiomeAt(x: number, z: number): BiomeType {
    return getDominantBiome(x, z);
  }

  /** Get complete biome configuration (tree count, shapes, materials, etc). */
  getBiomeSettings(biome: BiomeType): BiomeSettings {
    const materials = this.getBiomeMaterials(biome);
    const allowedShapes = BIOME_TREES[biome];
    const citizenNames = CITIZEN_NAMES[biome];
    const citizenColor = CITIZEN_COLORS[biome];

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

    return {
      treeCount,
      allowedShapes,
      materials,
      citizenNames,
      citizenColor,
      npcSpawnChance: 0.2, // 20%
    };
  }

  /** Get NPC display properties for a biome. */
  getNPCPool(biome: BiomeType) {
    const roll = Math.random();

    switch (biome) {
      case BiomeType.EmberWastes:
        if (roll < 0.6) {
          return { names: EMBER_HOSTILE_NAMES, color: 0xff4400, behavior: "hostile" as const };
        } else {
          return { names: EMBER_FRIENDLY_NAMES, color: 0xcc8833, behavior: "friendly" as const };
        }
      case BiomeType.CrystalTundra:
        if (roll < 0.3) {
          return { names: TUNDRA_HOSTILE_NAMES, color: 0x4488cc, behavior: "hostile" as const };
        } else {
          return { names: TUNDRA_FRIENDLY_NAMES, color: 0x88bbdd, behavior: "friendly" as const };
        }
      case BiomeType.TwilightMarsh:
        if (roll < 0.5) {
          return { names: MARSH_HOSTILE_NAMES, color: 0x338833, behavior: "hostile" as const };
        } else {
          return { names: MARSH_FRIENDLY_NAMES, color: 0x55aa55, behavior: "neutral" as const };
        }
      case BiomeType.SunlitMeadows:
        if (roll < 0.2) {
          return { names: HOSTILE_NAMES, color: 0xcc3300, behavior: "hostile" as const };
        } else {
          return { names: MEADOW_FRIENDLY_NAMES, color: 0x88aa44, behavior: "friendly" as const };
        }
      default: // Teldrassil
        if (roll < 0.4) {
          return { names: FRIENDLY_NAMES, color: 0x44cc44, behavior: "friendly" as const };
        } else if (roll < 0.7) {
          return { names: HOSTILE_NAMES, color: 0xcc3300, behavior: "hostile" as const };
        } else {
          return { names: SENTINEL_NAMES, color: 0x8844cc, behavior: "neutral" as const };
        }
    }
  }

  /** Get biome-specific materials (cached). */
  private getBiomeMaterials(biome: BiomeType): BiomeMaterials {
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
        return { trunk: this.defaultTrunkMaterial, canopy: this.defaultCanopyMaterials };
    }

    const entry = { trunk, canopy };
    this.biomeMaterials.set(biome, entry);
    return entry;
  }
}
