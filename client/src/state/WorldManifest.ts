import manifestData from '../../../shared/data/world_manifest.json';
import type { DungeonConfig } from '../scene/DungeonConfig';

export interface BiomeColorData {
  low: [number, number, number];
  mid: [number, number, number];
  high: [number, number, number];
  peak: [number, number, number];
}

export interface BiomeConfig {
  colors?: BiomeColorData;
  height_modifier_amplitude?: number;
}

export interface EnvironmentConfig {
  biome_start: number;
  transition_width: number;
  biomes: Record<string, BiomeConfig>;
}

export interface VerticalPlace {
  id: string;
  type?: string;
  transform: { x: number; z: number; rotation?: number };
  radii: { inner: number; outer: number };
  height: number;
  shape?: 'circle' | 'rect';
  width?: number;
  depth?: number;
}

export interface LandmarkDefinition {
  id: string;
  type: string;
  transform: {
    position: [number, number, number];
    scale: number;
    rotation?: [number, number, number];
  };
  visual: {
    label?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface NPCDefinition {
  id: string;
  identity: {
    name: string;
    role: string;
  };
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
  };
  stats: {
    max_hp: number;
    level: number;
  };
  ai: {
    personality_key: string;
    wander_radius: number;
  };
}

export interface PathDefinition {
  start: [number, number];
  end: [number, number];
  width: number;
}

export interface ZoneDefinition {
  name: string;
  bounds: { min: [number, number]; max: [number, number] };
  population: {
    npcs: NPCDefinition[];
  };
  architecture: {
    landmarks: LandmarkDefinition[];
    dungeons: Record<string, DungeonConfig>;
    paths?: PathDefinition[];
  };
}

export interface WorldManifestData {
  version: string;
  world: {
    environment: EnvironmentConfig;
    topology: {
      features: VerticalPlace[];
    };
  };
  zones: Record<string, ZoneDefinition>;
}

/**
 * WorldManifest manages data-driven world definitions.
 * It provides the source of truth for landmarks, terrain features, biomes, and NPCs.
 * Loads directly from the shared manifest file on disk.
 */
export class WorldManifest {
  private landmarks: Map<string, LandmarkDefinition> = new Map();
  private terrainFeatures: VerticalPlace[] = [];
  private environment: EnvironmentConfig | null = null;
  private dungeons: Record<string, DungeonConfig> = {};
  private npcs: NPCDefinition[] = [];
  private paths: PathDefinition[] = [];
  private zones: Map<string, ZoneDefinition> = new Map();

  constructor() {
    this.hydrate(manifestData as unknown as WorldManifestData);
  }

  /**
   * Hydrate the manifest with data.
   */
  public hydrate(data: WorldManifestData): void {
    // 1. World-level systems
    this.environment = data.world.environment;
    this.terrainFeatures = data.world.topology.features;
    
    // 2. Clear caches
    this.landmarks.clear();
    this.dungeons = {};
    this.npcs = [];
    this.paths = [];
    this.zones.clear();

    // 3. Process Zones
    for (const [zoneId, zone] of Object.entries(data.zones)) {
      this.zones.set(zoneId, zone);

      // Collect NPCs
      if (zone.population?.npcs) {
        this.npcs.push(...zone.population.npcs);
      }

      // Collect Landmarks
      if (zone.architecture?.landmarks) {
        zone.architecture.landmarks.forEach(l => {
          this.landmarks.set(l.id, l);
        });
      }

      // Collect Dungeons
      if (zone.architecture?.dungeons) {
        this.dungeons = { ...this.dungeons, ...zone.architecture.dungeons };
      }

      // Collect Paths
      if (zone.architecture?.paths) {
        this.paths.push(...zone.architecture.paths);
      }
    }
  }

  public getEnvironment(): EnvironmentConfig | null {
    return this.environment;
  }

  public getTerrainFeatures(): VerticalPlace[] {
    return this.terrainFeatures;
  }

  public getPaths(): PathDefinition[] {
    return this.paths;
  }

  public getDungeons(): Record<string, DungeonConfig> {
    return this.dungeons;
  }

  public getDungeon(id: string): DungeonConfig | undefined {
    return this.dungeons[id];
  }

  public getNPCs(): NPCDefinition[] {
    return this.npcs;
  }

  public addLandmark(landmark: LandmarkDefinition): void {
    this.landmarks.set(landmark.id, landmark);
  }

  public getLandmark(id: string): LandmarkDefinition | undefined {
    return this.landmarks.get(id);
  }

  public getAllLandmarks(): LandmarkDefinition[] {
    return Array.from(this.landmarks.values());
  }

  public removeLandmark(id: string): boolean {
    return this.landmarks.delete(id);
  }

  public clear(): void {
    this.landmarks.clear();
    this.npcs = [];
    this.dungeons = {};
    this.zones.clear();
  }

  public getZones(): Map<string, ZoneDefinition> {
    return this.zones;
  }
}
