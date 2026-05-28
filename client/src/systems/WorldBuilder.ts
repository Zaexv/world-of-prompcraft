import * as THREE from 'three';
import type { Terrain } from '../scene/Terrain';
import type { CollisionSystem } from './CollisionSystem';
import { buildObject } from './worldbuilder/objects';
import { WorldBuilderPersistence, PersistedObject } from './worldbuilder/WorldBuilderPersistence';

/** A world object placed by the WorldBuilder agent */
export interface PlacedObject {
  id: string;
  type: string;
  group: THREE.Object3D;
  label?: string;
}

export class WorldBuilder {
  private scene: THREE.Scene;
  private terrain: Terrain;
  private collisionSystem: CollisionSystem | null = null;
  private objects: Map<string, PlacedObject> = new Map();
  private persistence: WorldBuilderPersistence;
  
  // Undo/Redo stack
  private undoStack: PersistedObject[][] = [];
  private redoStack: PersistedObject[][] = [];

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.persistence = new WorldBuilderPersistence();
    
    // Load persisted objects
    this.loadFromStorage();
  }

  setCollisionSystem(cs: CollisionSystem): void {
    this.collisionSystem = cs;
    // Register existing objects for collision
    for (const obj of this.objects.values()) {
      this.collisionSystem.addCollidableFiltered(obj.group);
    }
  }

  private loadFromStorage(): void {
    const saved = this.persistence.load();
    for (const obj of saved) {
      this.spawnObject({
        objectId: obj.id,
        objectType: obj.type,
        position: obj.position,
        scale: obj.scale,
        label: obj.label,
      }, false); // don't push to undo stack when loading
    }
  }

  spawnObject(params: {
    objectId: string;
    objectType: string;
    position: [number, number, number];
    rotation?: [number, number, number];
    scale?: number;
    label?: string;
  }, pushToUndo = true): THREE.Object3D | undefined {
    let placed = this.objects.get(params.objectId);
    let group: THREE.Object3D;

    if (placed) {
      group = placed.group;
    } else {
      if (pushToUndo) {
        this.pushUndoState();
      }

      const y = this.terrain.getHeightAt(params.position[0], params.position[2]);
      const pos = new THREE.Vector3(params.position[0], y, params.position[2]);
      const scale = params.scale ?? 1;

      group = buildObject(params.objectType, pos, scale, params.label);

      if (params.rotation) {
        group.rotation.set(params.rotation[0], params.rotation[1], params.rotation[2]);
      }

      placed = {
        id: params.objectId,
        type: params.objectType,
        group,
        label: params.label,
      };
      this.objects.set(params.objectId, placed);
      this.persistence.save(this.objects);
    }

    // Ensure it's in the scene (it might have been removed by chunk unloading)
    if (group.parent !== this.scene) {
      this.scene.add(group);
    }

    // Ensure it's in the collision system (might have been removed by chunk unloading)
    if (this.collisionSystem) {
      // addCollidableFiltered is async; it's okay not to await here as it will
      // be ready in a few frames.
      this.collisionSystem.addCollidableFiltered(group);
    }

    return group;
  }

  removeObject(objectId: string, pushToUndo = true): void {
    const placed = this.objects.get(objectId);
    if (!placed) return;

    if (pushToUndo) {
      this.pushUndoState();
    }

    this.scene.remove(placed.group);
    this.collisionSystem?.removeCollidable(placed.group);
    placed.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.objects.delete(objectId);
    this.persistence.save(this.objects);
  }

  getPlacedObjectIds(): string[] {
    return Array.from(this.objects.keys());
  }

  getNearbyObjects(pos: THREE.Vector3, radius: number): { id: string, type: string, label: string, position: [number, number, number] }[] {
    const nearby: { id: string, type: string, label: string, position: [number, number, number] }[] = [];
    for (const obj of this.objects.values()) {
      if (obj.group.position.distanceTo(pos) <= radius) {
        nearby.push({
          id: obj.id,
          type: obj.type,
          label: obj.label ?? obj.type,
          position: [obj.group.position.x, obj.group.position.y, obj.group.position.z]
        });
      }
    }
    return nearby;
  }

  // ── Undo / Redo Logic ────────────────────────────────────────────────

  private getCurrentStateAsPersisted(): PersistedObject[] {
    return Array.from(this.objects.values()).map(obj => ({
      id: obj.id,
      type: obj.type,
      position: [obj.group.position.x, obj.group.position.y, obj.group.position.z],
      scale: obj.group.scale.x,
      label: obj.label,
    }));
  }

  private pushUndoState(): void {
    this.undoStack.push(this.getCurrentStateAsPersisted());
    this.redoStack = []; // Clear redo stack on new action
    if (this.undoStack.length > 50) this.undoStack.shift();
  }

  public undo(): void {
    if (this.undoStack.length === 0) return;
    
    this.redoStack.push(this.getCurrentStateAsPersisted());
    const prevState = this.undoStack.pop()!;
    this.applyState(prevState);
  }

  public redo(): void {
    if (this.redoStack.length === 0) return;
    
    this.undoStack.push(this.getCurrentStateAsPersisted());
    const nextState = this.redoStack.pop()!;
    this.applyState(nextState);
  }

  // ── Distance Culling ──────────────────────────────────────────────────

  private readonly VISIBLE_RADIUS_SQ = 350 * 350;

  /** Update object visibility based on distance to player. */
  update(playerX: number, playerZ: number): void {
    for (const obj of this.objects.values()) {
      const dx = obj.group.position.x - playerX;
      const dz = obj.group.position.z - playerZ;
      const distSq = dx * dx + dz * dz;

      // Hide objects beyond visible range
      const visible = distSq <= this.VISIBLE_RADIUS_SQ;
      if (obj.group.visible !== visible) {
        obj.group.visible = visible;
      }
    }
  }

  private applyState(targetState: PersistedObject[]): void {
    // Clear current objects
    for (const id of Array.from(this.objects.keys())) {
      this.removeObject(id, false);
    }

    // Spawn target objects
    for (const obj of targetState) {
      this.spawnObject({
        objectId: obj.id,
        objectType: obj.type,
        position: obj.position,
        scale: obj.scale,
        label: obj.label,
      }, false);
    }
  }
}
