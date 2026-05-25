/**
 * ChunkManager — Helper for WorldGenerator chunk lifecycle.
 *
 * Tracks chunk state, generation, and cleanup.
 */

import * as THREE from 'three';

/**
 * Manage chunk lifecycle and object tracking.
 */
export class ChunkManager {
  private generatedChunks = new Set<string>();
  private chunkObjects: Map<string, THREE.Object3D[]> = new Map();
  private chunkNPCs: Map<string, string[]> = new Map();
  private chunkEntrances: Map<string, string[]> = new Map();

  /**
   * Check if chunk was already generated.
   */
  isGenerated(chunkX: number, chunkZ: number): boolean {
    return this.generatedChunks.has(`${chunkX},${chunkZ}`);
  }

  /**
   * Mark chunk as generated.
   */
  markGenerated(chunkX: number, chunkZ: number): void {
    this.generatedChunks.add(`${chunkX},${chunkZ}`);
  }

  /**
   * Register objects for a chunk.
   */
  addChunkObjects(chunkX: number, chunkZ: number, objects: THREE.Object3D[]): void {
    const key = `${chunkX},${chunkZ}`;
    this.chunkObjects.set(key, objects);
  }

  /**
   * Get objects for a chunk.
   */
  getChunkObjects(chunkX: number, chunkZ: number): THREE.Object3D[] {
    return this.chunkObjects.get(`${chunkX},${chunkZ}`) ?? [];
  }

  /**
   * Register NPCs for a chunk.
   */
  addChunkNPCs(chunkX: number, chunkZ: number, npcIds: string[]): void {
    const key = `${chunkX},${chunkZ}`;
    this.chunkNPCs.set(key, npcIds);
  }

  /**
   * Register dungeon entrances for a chunk.
   */
  addChunkEntrances(chunkX: number, chunkZ: number, entranceIds: string[]): void {
    const key = `${chunkX},${chunkZ}`;
    this.chunkEntrances.set(key, entranceIds);
  }

  /**
   * Clean up chunk resources.
   */
  unloadChunk(chunkX: number, chunkZ: number, parent: THREE.Object3D): void {
    const key = `${chunkX},${chunkZ}`;

    // Remove objects from scene
    const objects = this.chunkObjects.get(key) ?? [];
    for (const obj of objects) {
      parent.remove(obj);
      // Dispose geometries and materials
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => mat.dispose());
          } else if (child.material) {
            child.material.dispose();
          }
        }
      });
    }

    // Clear tracking
    this.chunkObjects.delete(key);
    this.chunkNPCs.delete(key);
    this.chunkEntrances.delete(key);
  }
}
