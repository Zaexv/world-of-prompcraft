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
  /** True when this NPC owns (offers) a curated quest — drives the '!' marker. */
  isQuestGiver?: boolean;
  /** Curated quest ids this NPC owns — used to hide '!' once taken/completed. */
  questIds?: string[];
  identity: {
    name: string;
    role: string;
  };
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale?: number;
  };
  stats: {
    max_hp: number;
    level: number;
  };
  ai: {
    personality_key: string;
    wander_radius: number;
    style?: string;
  };
}

export interface PathDefinition {
  start: [number, number];
  end: [number, number];
  width: number;
}

/** A single additive terrain-sculpt deposit (RAISE/LOWER brush). */
export interface SculptStroke {
  x: number;
  z: number;
  radius: number;
  delta: number;
  flatten?: boolean;
  /** Water-carve stroke — flattens a lakebed below sea level; no sculpt gizmo. */
  water?: boolean;
}

/** A single ground-type paint deposit (grass/sand/mud/… tint brush). */
export interface GroundPaintStroke {
  x: number;
  z: number;
  radius: number;
  type: string;
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
      sculpt?: SculptStroke[];
      paint?: GroundPaintStroke[];
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
  private version = '2.1.0';
  private landmarks: Map<string, LandmarkDefinition> = new Map();
  private terrainFeatures: VerticalPlace[] = [];
  private sculpt: SculptStroke[] = [];
  private paint: GroundPaintStroke[] = [];
  private environment: EnvironmentConfig | null = null;
  private dungeons: Record<string, DungeonConfig> = {};
  private npcs: NPCDefinition[] = [];
  private paths: PathDefinition[] = [];
  private zones: Map<string, ZoneDefinition> = new Map();

  constructor() {
    this.hydrate(manifestData as unknown as WorldManifestData);
  }

  /**
   * Fetches the latest manifest from the server and hydrates local state.
   */
  public async fetchAsync(): Promise<void> {
    try {
      const response = await fetch('/world/manifest');
      if (response.ok) {
        const data = await response.json();
        this.hydrate(data);
      }
    } catch (err) {
      console.warn('Failed to fetch latest manifest from server, using local import:', err);
    }
  }

  /**
   * Hydrate the manifest with data.
   */
  public hydrate(data: WorldManifestData): void {
    // 1. World-level systems
    this.version = data.version ?? this.version;
    this.environment = data.world.environment;
    this.terrainFeatures = data.world.topology.features;
    this.sculpt = data.world.topology.sculpt ?? [];
    this.paint = data.world.topology.paint ?? [];

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

  public getSculpt(): SculptStroke[] {
    return this.sculpt;
  }

  /**
   * Deposit an additive sculpt stroke. Strokes at (nearly) the same spot and
   * radius are merged so holding the brush deepens one stroke instead of
   * appending hundreds of near-duplicates to the manifest.
   */
  public addSculptStroke(x: number, z: number, radius: number, delta: number, flatten?: boolean, water?: boolean): void {
    const MERGE_DIST = 1.5;
    for (const s of this.sculpt) {
      if (s.flatten === flatten && !!s.water === !!water && Math.abs(s.radius - radius) < 0.01 && Math.hypot(s.x - x, s.z - z) < MERGE_DIST) {
        if (flatten) {
           s.delta = delta; // target height
        } else {
           s.delta += delta;
        }
        return;
      }
    }
    this.sculpt.push({ x, z, radius, delta, flatten, water });
  }

  public getPaint(): GroundPaintStroke[] {
    return this.paint;
  }

  /**
   * Deposit a ground-paint stroke. Strokes at (nearly) the same spot/radius/type
   * are merged so dragging the brush doesn't append hundreds of duplicates. A
   * stroke of a different type at the same spot overwrites (last paint wins).
   */
  public addPaintStroke(x: number, z: number, radius: number, type: string): void {
    const MERGE_DIST = 1.5;
    for (const s of this.paint) {
      if (Math.abs(s.radius - radius) < 0.01 && Math.hypot(s.x - x, s.z - z) < MERGE_DIST) {
        s.type = type;
        return;
      }
    }
    this.paint.push({ x, z, radius, type });
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

  /**
   * Serialize the current in-memory state back into the raw manifest data shape.
   * This is the canonical shape consumed by Terrain.setManifest() (which reads
   * `world.topology.features` and `zones` to build terrain pads) and by the
   * server's `world_manifest_update` save handler. Zones hold the authoritative
   * architecture/population; environment + topology are world-level.
   */
  public toData(): WorldManifestData {
    return {
      version: this.version,
      world: {
        environment: this.environment as EnvironmentConfig,
        topology: { features: this.terrainFeatures, sculpt: this.sculpt, paint: this.paint },
      },
      zones: Object.fromEntries(this.zones),
    };
  }
}
