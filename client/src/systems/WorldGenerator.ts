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
import type { DungeonSystem } from './DungeonSystem';
import type { CollisionSystem } from './CollisionSystem';

type ExclusionFootprint = { x: number; z: number; radius: number };

/**
 * Spawns trees, caves, towns, and NPCs when new terrain chunks are loaded,
 * creating the feeling of an infinite, living world.
 *
 * This class is pure orchestrator — it delegates all content generation to specialized helpers.
 */
export class WorldGenerator {
  private generatedChunks: Set<string> = new Set();
  private scene: THREE.Scene;
  private entityManager: EntityManager;
  private dungeonSystem: DungeonSystem | null = null;
  private collisionSystem: CollisionSystem | null = null;

  private chunkObjects: Map<string, THREE.Object3D[]> = new Map();
  private chunkNPCs: Map<string, string[]> = new Map();
  private chunkEntrances: Map<string, string[]> = new Map();

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

  /** Set dungeon system reference for registering entrances. */
  setDungeonSystem(ds: DungeonSystem): void {
    this.dungeonSystem = ds;
  }

  /** Set collision system so spawned trees become collidable. */
  setCollisionSystem(cs: CollisionSystem): void {
    this.collisionSystem = cs;
  }

  /** Prevent procedural spawns inside authored city/structure footprints. */
  setExclusionFootprints(_footprints: ExclusionFootprint[]): void {}

  /** Clean up all spawned objects and NPCs for a chunk. */
  onChunkUnloaded(chunkX: number, chunkZ: number): void {
    const key = `${chunkX},${chunkZ}`;

    // Remove scene objects (trees, caves, towns, portals)
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

    // Remove dungeon entrance registrations
    const entrances = this.chunkEntrances.get(key);
    if (entrances && this.dungeonSystem) {
      for (const entranceId of entrances) {
        this.dungeonSystem.unregisterEntrance(entranceId);
      }
      this.chunkEntrances.delete(key);
    }

    this.generatedChunks.delete(key);
  }

  /** Main entry point: called when a new terrain chunk loads. */
  onChunkLoaded(chunkX: number, chunkZ: number, _worldX: number, _worldZ: number): void {
    const key = `${chunkX},${chunkZ}`;
    if (this.generatedChunks.has(key)) return;
    this.generatedChunks.add(key);

    // Procedural spawners are temporarily disabled for the Tabula Rasa phase.
    // They will be replaced by Manifest-driven spawning.
  }
}
