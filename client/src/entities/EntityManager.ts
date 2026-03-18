import * as THREE from 'three';
import { NPC, NPCConfig } from './NPC';

/**
 * Central registry for all NPC entities.
 * Manages their lifecycle and exposes helpers for the interaction system.
 */
export class EntityManager {
  public readonly npcs: Map<string, NPC> = new Map();

  private scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  /** Create and register an NPC, adding it to the scene. */
  addNPC(config: NPCConfig): NPC {
    const npc = new NPC(config);
    this.npcs.set(npc.id, npc);
    this.scene.add(npc.mesh);
    return npc;
  }

  /** Retrieve an NPC by id. */
  getNPC(id: string): NPC | undefined {
    return this.npcs.get(id);
  }

  /** Return all registered NPCs. */
  getAllNPCs(): NPC[] {
    return Array.from(this.npcs.values());
  }

  /** Remove an NPC from the registry and the scene. */
  removeNPC(id: string): void {
    const npc = this.npcs.get(id);
    if (npc) {
      this.scene.remove(npc.mesh);
      this.npcs.delete(id);
    }
  }

  /** Tick all NPC animations and wandering AI. */
  update(delta: number, getHeightAt?: (x: number, z: number) => number): void {
    for (const npc of this.npcs.values()) {
      npc.update(delta);
      if (getHeightAt) {
        npc.updateWander(delta, getHeightAt);
      }
    }
  }

  /** Return all NPC mesh groups for raycaster intersection tests. */
  getMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const npc of this.npcs.values()) {
      meshes.push(npc.mesh);
    }
    return meshes;
  }
}
