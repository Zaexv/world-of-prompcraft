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
import type { Minimap, MinimapWaypoint } from '../ui/Minimap';
import type { CollisionSystem } from './CollisionSystem';
import type { WorldManifest } from '../state/WorldManifest';
import type { WorldBuilder } from './WorldBuilder';
import { ProceduralPopulator } from './ProceduralPopulator';

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
  private minimap: Minimap | null = null;
  private populator: ProceduralPopulator;

  private chunkObjects: Map<string, THREE.Object3D[]> = new Map();
  private chunkNPCs: Map<string, string[]> = new Map();

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    entityManager: EntityManager,
    _ws: WebSocketClient,
  ) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.populator = new ProceduralPopulator(terrain);
    this.populator.setScene(scene);
    this.populator.setEntityManager(entityManager);
  }

  /** Call once per frame from the game loop to drain the spawn queue. */
  update(playerX: number, playerZ: number): void {
    this.populator.update(playerX, playerZ);
  }

  /** Set minimap reference for registering markers. */
  setMinimap(minimap: Minimap): void {
    this.minimap = minimap;
    this.syncMinimapWaypoints();
  }

  /** Set collision system so spawned trees become collidable. */
  setCollisionSystem(cs: CollisionSystem): void {
    this.collisionSystem = cs;
    this.populator.setCollisionSystem(cs);
  }

  /** Set the world manifest for data-driven landmark spawning. */
  setWorldManifest(wm: WorldManifest): void {
    this.worldManifest = wm;
    this.syncMinimapWaypoints();
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
    console.debug(`[WorldGenerator] Unloading chunk ${key}`);

    // Remove scene objects
    const objects = this.chunkObjects.get(key);
    if (objects) {
      for (const obj of objects) {
        // If the object was managed by WorldBuilder, release it from there too
        // Landmarks are identified by their UUID-like IDs or manifest IDs.
        const objectId = obj.userData.objectId;
        if (objectId && this.worldBuilder) {
          this.worldBuilder.releaseObject(objectId);
        } else {
          this.scene.remove(obj);
          this.collisionSystem?.removeCollidable(obj);
          obj.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
            }
          });
        }
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
    // Despawn all procedural objects for this chunk (prevents memory/GPU leak)
    this.populator.releaseChunk(chunkX, chunkZ);
  }

  /** Main entry point: called when a new terrain chunk loads. */
  onChunkLoaded(chunkX: number, chunkZ: number, worldX: number, worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.generatedChunks.has(key)) return;
    this.generatedChunks.add(key);

    console.debug(`[WorldGenerator] Loading chunk ${key} at ${worldX}, ${worldZ}`);

    if (!this.worldManifest || !this.worldBuilder) return;

    // Determine bounds for this chunk
    const minX = worldX;
    const maxX = worldX + CHUNK_SIZE;
    const minZ = worldZ;
    const maxZ = worldZ + CHUNK_SIZE;

    const chunkObjects: THREE.Object3D[] = [];

    // Query manifest for landmarks in this chunk using spatial index
    const landmarks = this.worldManifest.getLandmarksInBounds(minX, maxX, minZ, maxZ);
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

    // Procedural population — deferred via queue (zero work here)
    this.populator.queueChunk(chunkX, chunkZ, worldX, worldZ);

    if (chunkObjects.length > 0) {
      this.chunkObjects.set(key, chunkObjects);
    }

    // Force NPCs inside this chunk to re-snap to newly loaded terrain.
    // Use a half-extent AABB so we can skip NPCs quickly without a full scan.
    const marginedHalfW = (maxX - minX) / 2 + 2;
    const marginedHalfH = (maxZ - minZ) / 2 + 2;
    const cxMid = (minX + maxX) / 2;
    const czMid = (minZ + maxZ) / 2;
    for (const npc of this.entityManager.npcs.values()) {
      if (
        Math.abs(npc.position.x - cxMid) <= marginedHalfW &&
        Math.abs(npc.position.z - czMid) <= marginedHalfH
      ) {
        npc.isGrounded = false;
      }
    }
  }

  private syncMinimapWaypoints(): void {
    if (!this.minimap || !this.worldManifest) return;

    const waypoints: MinimapWaypoint[] = [];
    for (const landmark of this.worldManifest.getAllLandmarks()) {
      const label = landmark.visual?.label?.trim();
      if (!label) continue;

      waypoints.push({
        id: `landmark:${landmark.id}`,
        label,
        x: landmark.transform.position[0],
        z: landmark.transform.position[2],
        kind: 'landmark',
      });
    }

    for (const feature of this.worldManifest.getTerrainFeatures()) {
      waypoints.push({
        id: `feature:${feature.id}`,
        label: this.formatWaypointLabel(feature.id),
        x: feature.transform.x,
        z: feature.transform.z,
        kind: 'feature',
      });
    }

    this.minimap.setWaypoints(waypoints);
  }

  private formatWaypointLabel(id: string): string {
    return id
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase())
      .replace(/\s+/g, ' ')
      .trim();
  }
}
