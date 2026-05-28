import * as THREE from 'three';
import { NPC, NPCConfig } from './NPC';
import { RemotePlayer } from './RemotePlayer';
import type { RemotePlayerData } from '../network/MessageProtocol';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { AssetLoader } from '../utils/asset/AssetLoader';

/**
 * Central registry for all NPC entities and remote players.
 * Manages their lifecycle and exposes helpers for the interaction system.
 */
export class EntityManager {
  public readonly npcs: Map<string, NPC> = new Map();
  private readonly remotePlayers: Map<string, RemotePlayer> = new Map();

  private scene: THREE.Scene;
  private assetLoader?: AssetLoader;

  constructor(scene: THREE.Scene, assetLoader?: AssetLoader) {
    this.scene = scene;
    this.assetLoader = assetLoader;
  }

  // ── NPC management ──────────────────────────────────────────────────────────

  /**
   * Create and register an NPC, adding it to the scene immediately.
   * Background-loads a GLTF model if an AssetLoader was provided.
   */
  addNPC(config: NPCConfig): NPC {
    const npc = NPC.create(config, this.assetLoader);
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
      npc.dispose?.();
      this.npcs.delete(id);
    }
  }

  // ── Remote player management ────────────────────────────────────────────────

  /** Add a remote player to the scene. */
  addRemotePlayer(data: RemotePlayerData): RemotePlayer {
    // Remove existing if present (reconnect case)
    if (this.remotePlayers.has(data.playerId)) {
      this.removeRemotePlayer(data.playerId);
    }
    const remote = new RemotePlayer(data, this.scene, this.assetLoader);
    this.remotePlayers.set(data.playerId, remote);
    return remote;
  }

  /** Remove a remote player by ID. */
  removeRemotePlayer(playerId: string): void {
    const remote = this.remotePlayers.get(playerId);
    if (remote) {
      remote.dispose(this.scene);
      this.remotePlayers.delete(playerId);
    }
  }

  /** Get a remote player by ID. */
  getRemotePlayer(playerId: string): RemotePlayer | undefined {
    return this.remotePlayers.get(playerId);
  }

  /** Update or add remote players from a world update. */
  updateRemotePlayers(players: RemotePlayerData[]): void {
    for (const p of players) {
      const existing = this.remotePlayers.get(p.playerId);
      if (existing) {
        existing.setTarget(p.position, p.yaw);
      } else {
        this.addRemotePlayer(p);
      }
    }
  }

  // ── Distance culling ────────────────────────────────────────────────────────

  // Player position for distance-based culling
  private playerX = 0;
  private playerZ = 0;
  private readonly UPDATE_RADIUS_SQ = 400 * 400;   // full update within 400 units (covers Fort Malaka ~273u from spawn)
  private readonly VISIBLE_RADIUS_SQ = 450 * 450;  // hide beyond 450 units

  /** Set the player position so NPCs can be distance-culled. */
  setPlayerPosition(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
  }

  /** Tick NPC animations and wandering AI, culling distant NPCs. Also update remote players. */
  update(delta: number, getHeightAt?: (x: number, z: number) => number, _collisionSystem?: CollisionSystem): void {
    for (const npc of this.npcs.values()) {
      // Distance check FIRST — skip all work for distant NPCs immediately.
      const dx = npc.position.x - this.playerX;
      const dz = npc.position.z - this.playerZ;
      const distSq = dx * dx + dz * dz;

      if (distSq > this.VISIBLE_RADIUS_SQ) {
        if (npc.mesh.visible) npc.mesh.visible = false;
        // Do NOT snap distant NPCs — snapToGround calls getHeightAt (terrain query) and is expensive.
        continue;
      }
      if (!npc.mesh.visible) npc.mesh.visible = true;

      // Snap to ground only for visible NPCs that need it
      if (getHeightAt && !npc.isGrounded) {
        npc.snapToGround(getHeightAt);
        npc.isGrounded = true;
      }

      // Full AI + animation only within the closer update radius
      if (distSq < this.UPDATE_RADIUS_SQ) {
        npc.update(delta);
        if (getHeightAt) {
          npc.updateWander(delta, getHeightAt);
        }
      }
    }

    // Update remote players
    for (const remote of this.remotePlayers.values()) {
      remote.update(delta);
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
