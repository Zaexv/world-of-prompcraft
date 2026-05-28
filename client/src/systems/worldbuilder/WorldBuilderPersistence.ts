import { PlacedObject } from '../WorldBuilder';

export interface PersistedObject {
  id: string;
  type: string;
  position: [number, number, number];
  scale: number;
  label?: string;
}

/**
 * WorldBuilderPersistence handles saving and loading world modifications
 * using localStorage.
 */
export class WorldBuilderPersistence {
  private readonly STORAGE_KEY = 'wop_world_modifications';

  public save(objects: Map<string, PlacedObject>): void {
    const data: PersistedObject[] = Array.from(objects.values()).map(obj => ({
      id: obj.id,
      type: obj.type,
      position: obj.position,
      scale: obj.scale,
      label: obj.label,
    }));

    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save world modifications to localStorage:', e);
    }
  }

  public load(): PersistedObject[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored) as PersistedObject[];
      }
    } catch (e) {
      console.error('Failed to load world modifications from localStorage:', e);
    }
    return [];
  }

  public clear(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
}
