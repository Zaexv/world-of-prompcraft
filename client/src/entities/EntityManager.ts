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

  // Player position for distance-based culling
  private playerX = 0;
  private playerZ = 0;
  private readonly UPDATE_RADIUS_SQ = 200 * 200;   // full update within 200 units
  private readonly VISIBLE_RADIUS_SQ = 350 * 350;  // hide beyond 350 units

  /** Set the player position so NPCs can be distance-culled. */
  setPlayerPosition(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
  }

  /** Tick NPC animations and wandering AI, culling distant NPCs. */
  update(delta: number, getHeightAt?: (x: number, z: number) => number): void {
    for (const npc of this.npcs.values()) {
      const dx = npc.position.x - this.playerX;
      const dz = npc.position.z - this.playerZ;
      const distSq = dx * dx + dz * dz;

      // Hide NPCs beyond visible range
      if (distSq > this.VISIBLE_RADIUS_SQ) {
        if (npc.mesh.visible) npc.mesh.visible = false;
        continue;
      }
      if (!npc.mesh.visible) npc.mesh.visible = true;

      // Only run full AI + animation for NPCs within update radius
      if (distSq < this.UPDATE_RADIUS_SQ) {
        npc.update(delta);
        if (getHeightAt) {
          npc.updateWander(delta, getHeightAt);
        }
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
