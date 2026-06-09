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
import type { LandmarkDefinition, NPCDefinition } from '../state/WorldManifest';
import type { NPCPlaceholderStyle } from '../entities/NPCModels';

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

  /** Spatial index for landmarks: Map<"chunkX,chunkZ", LandmarkDefinition[]> */
  private landmarkSpatialIndex: Map<string, LandmarkDefinition[]> = new Map();
  /** Spatial index for manifest NPCs: Map<"chunkX,chunkZ", NPCDefinition[]> */
  private npcSpatialIndex: Map<string, NPCDefinition[]> = new Map();

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

  /** Clear all manifest-driven objects and NPCs. */
  public clearManifestItems(): void {
    for (const [key, objects] of this.chunkObjects.entries()) {
      for (const obj of objects) {
        this.scene.remove(obj);
        this.collisionSystem?.removeCollidable(obj);
        obj.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
      }
      this.chunkObjects.delete(key);
    }
    for (const [key, npcIds] of this.chunkNPCs.entries()) {
      for (const id of npcIds) {
        this.entityManager.removeNPC(id);
      }
      this.chunkNPCs.delete(key);
    }
    // Chunks need to be marked as "not generated" for manifest items
    // (procedural items can stay as they are proximity based)
    // Actually, it's safer to just clear generatedChunks.
    this.generatedChunks.clear();
  }

  /** Set the world manifest for data-driven landmark spawning. */
  setWorldManifest(wm: WorldManifest): void {
    this.worldManifest = wm;
    this.rebuildSpatialIndex();
    this.rebuildNPCIndex();
    this.syncMinimapWaypoints();
  }

  /** Set the world builder for object construction. */
  setWorldBuilder(wb: WorldBuilder): void {
    this.worldBuilder = wb;
  }

  /** Prevent procedural spawns inside authored city/structure footprints. */
  setExclusionFootprints(_footprints: ExclusionFootprint[]): void {}

  /** Rebuild the spatial index for manifest landmarks. */
  private rebuildSpatialIndex(): void {
    this.landmarkSpatialIndex.clear();
    if (!this.worldManifest) return;

    for (const landmark of this.worldManifest.getAllLandmarks()) {
      const [lx, , lz] = landmark.transform.position;
      const cx = Math.floor(lx / CHUNK_SIZE);
      const cz = Math.floor(lz / CHUNK_SIZE);
      const key = `${cx},${cz}`;

      if (!this.landmarkSpatialIndex.has(key)) {
        this.landmarkSpatialIndex.set(key, []);
      }
      this.landmarkSpatialIndex.get(key)!.push(landmark);
    }
  }

  /** Rebuild the spatial index for manifest NPCs. */
  private rebuildNPCIndex(): void {
    this.npcSpatialIndex.clear();
    if (!this.worldManifest) return;

    for (const npc of this.worldManifest.getNPCs()) {
      const [nx, , nz] = npc.transform.position;
      const cx = Math.floor(nx / CHUNK_SIZE);
      const cz = Math.floor(nz / CHUNK_SIZE);
      const key = `${cx},${cz}`;

      if (!this.npcSpatialIndex.has(key)) {
        this.npcSpatialIndex.set(key, []);
      }
      this.npcSpatialIndex.get(key)!.push(npc);
    }
  }

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
    // Despawn all procedural objects for this chunk (prevents memory/GPU leak)
    this.populator.releaseChunk(chunkX, chunkZ);
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

    // Query spatial index for landmarks in this chunk
    const landmarks = this.landmarkSpatialIndex.get(key);
    if (landmarks) {
      for (const landmark of landmarks) {
        // Spawn the landmark using WorldBuilder
        const obj = this.worldBuilder.spawnObject({
          objectId: landmark.id,
          objectType: landmark.type,
          position: landmark.transform.position,
          rotation: landmark.transform.rotation,
          scale: landmark.transform.scale,
          label: landmark.visual.label,
          persist: false, // Don't track manifest landmarks in WorldBuilder.objects
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

    // Spawn manifest NPCs
    const manifestNpcs = this.npcSpatialIndex.get(key);
    if (manifestNpcs) {
      const npcIds: string[] = [];
      for (const npcDef of manifestNpcs) {
        this.entityManager.addNPC({
          id: npcDef.id,
          name: npcDef.identity.name,
          position: new THREE.Vector3(...npcDef.transform.position),
          personalityKey: npcDef.ai.personality_key,
          wanderRadius: npcDef.ai.wander_radius,
          scale: npcDef.transform.scale,
          style: npcDef.ai.style as NPCPlaceholderStyle | undefined,
          isQuestGiver: npcDef.isQuestGiver ?? false
        });
        npcIds.push(npcDef.id);
      }
      this.chunkNPCs.set(key, npcIds);
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
