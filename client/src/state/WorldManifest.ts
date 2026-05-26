export interface LandmarkDefinition {
  id: string;
  type: string;
  position: [number, number, number];
  scale: number;
  rotation?: [number, number, number];
  label?: string;
  metadata?: Record<string, any>;
}

export interface WorldManifestData {
  version: string;
  landmarks: LandmarkDefinition[];
}

/**
 * WorldManifest manages data-driven landmark definitions.
 * It replaces hardcoded landmark spawns with a centralized registry.
 */
export class WorldManifest {
  private landmarks: Map<string, LandmarkDefinition> = new Map();

  constructor() {
    this.loadDefaults();
  }

  private loadDefaults(): void {
    // These will eventually be loaded from a JSON file or API
    const defaults: LandmarkDefinition[] = [
      {
        id: 'fort_malaka',
        type: 'fortress',
        position: [50, 0, 50],
        scale: 1.0,
        label: 'Fort Malaka',
      },
      {
        id: 'ancient_grove',
        type: 'ancient_tree_cluster',
        position: [-40, 0, -60],
        scale: 1.2,
        label: 'Ancient Grove',
      },
      {
        id: 'mystic_ruins',
        type: 'ruins',
        position: [120, 0, -30],
        scale: 1.5,
        label: 'Mystic Ruins',
      }
    ];

    defaults.forEach(l => this.addLandmark(l));
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
  }
}
