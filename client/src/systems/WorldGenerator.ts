/**
 * WorldGenerator — Pure orchestrator for world chunk generation.
 *
 * Delegates terrain/vegetation/building/cave/NPC spawning to specialized helpers.
 * Manages chunk lifecycle, cleanup, and WebSocket communication.
 */

import * as THREE from 'three';
import type { EntityManager } from '../entities/EntityManager';
import type { WebSocketClient } from '../network/WebSocketClient';
import type { Terrain } from '../scene/Terrain';
import type { Minimap } from '../ui/Minimap';
import type { CollisionSystem } from './CollisionSystem';
import type { WorldManifest } from '../state/WorldManifest';
import type { WorldBuilder } from './WorldBuilder';

const CHUNK_SIZE = 64; // Match Terrain.ts

type ExclusionFootprint = { x: number; z: number; radius: number };

/**
 * Spawns trees, caves, towns, and NPCs when new terrain chunks are loaded,
 * creating the feeling of an infinite, living world.
 */
export class WorldGenerator {
  private generatedChunks: Set<string> = new Set();
  private scene: THREE.Scene;
  private entityManager: EntityManager;
  private collisionSystem: CollisionSystem | null = null;
  private worldManifest: WorldManifest | null = null;
  private worldBuilder: WorldBuilder | null = null;

  private chunkObjects: Map<string, THREE.Object3D[]> = new Map();
  private chunkNPCs: Map<string, string[]> = new Map();

  constructor(
    scene: THREE.Scene,
    _terrain: Terrain,
    entityManager: EntityManager,
    _ws: WebSocketClient,
  ) {
    this.scene = scene;
    this.entityManager = entityManager;
  }

  /** Set minimap reference for registering markers. */
  setMinimap(_minimap: Minimap): void {}

  /** Set collision system so spawned trees become collidable. */
  setCollisionSystem(cs: CollisionSystem): void {
    this.collisionSystem = cs;
  }

  /** Set the world manifest for data-driven landmark spawning. */
  setWorldManifest(wm: WorldManifest): void {
    this.worldManifest = wm;
  }

  /** Set the world builder for object construction. */
  setWorldBuilder(wb: WorldBuilder): void {
    this.worldBuilder = wb;
  }

  /** Prevent procedural spawns inside authored city/structure footprints. */
  setExclusionFootprints(_footprints: ExclusionFootprint[]): void {}

  /** Clean up all spawned objects and NPCs for a chunk. */
  onChunkUnloaded(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;

    // Remove scene objects
    const objects = this.chunkObjects.get(key);
    if (objects) {
      for (const obj of objects) {
        this.scene.remove(obj);
        this.collisionSystem?.removeCollidable(obj);
        obj.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
          }
        });
      }
      this.chunkObjects.delete(key);
    }

    // Remove NPCs
    const npcs = this.chunkNPCs.get(key);
    if (npcs) {
      for (const npcId of npcs) {
        this.entityManager.removeNPC(npcId);
      }
      this.chunkNPCs.delete(key);
    }

    this.generatedChunks.delete(key);
  }

  /** Main entry point: called when a new terrain chunk loads. */
  onChunkLoaded(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.generatedChunks.has(key)) return;
    this.generatedChunks.add(key);

    if (!this.worldManifest || !this.worldBuilder) return;

    // Determine bounds for this chunk
    const minX = worldX;
    const maxX = worldX + CHUNK_SIZE;
    const minZ = worldZ;
    const maxZ = worldZ + CHUNK_SIZE;

    const chunkObjects: THREE.Object3D[] = [];

    // Query manifest for landmarks in this chunk
    const landmarks = this.worldManifest.getAllLandmarks();
    for (const landmark of landmarks) {
      const [lx, , lz] = landmark.transform.position;
      
      if (lx >= minX && lx < maxX && lz >= minZ && lz < maxZ) {
        // Spawn the landmark using WorldBuilder
        const obj = this.worldBuilder.spawnObject({
          objectId: landmark.id,
          objectType: landmark.type,
          position: landmark.transform.position,
          rotation: landmark.transform.rotation,
          scale: landmark.transform.scale,
          label: landmark.visual.label,
        }, false);

        if (obj) {
          chunkObjects.push(obj);
        }
      }
    }

    if (chunkObjects.length > 0) {
      this.chunkObjects.set(key, chunkObjects);
    }

    // Force all NPCs to re-snap to the newly loaded terrain in this chunk
    // Use a small buffer to catch NPCs near the chunk edges
    const margin = 2;
    for (const npc of this.entityManager.npcs.values()) {
      const nx = npc.position.x;
      const nz = npc.position.z;
      if (nx >= minX - margin && nx < maxX + margin && nz >= minZ - margin && nz < maxZ + margin) {
        npc.isGrounded = false; // Re-trigger snap on next EntityManager update
      }
    }
  }
}
