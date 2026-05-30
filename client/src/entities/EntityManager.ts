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

  // Server-authoritative NPC ids currently synced, so we can prune ones that
  // drop out of the streamed nearby set instead of accumulating them forever.
  private serverNpcIds: Set<string> = new Set();

  // Cached arrays rebuilt only when NPCs are added/removed — avoids per-call allocations.
  private _meshesCache: THREE.Object3D[] = [];
  private _npcArrayCache: NPC[] = [];
  private _cachesDirty = true;

  private scene: THREE.Scene;
  private assetLoader?: AssetLoader;

  constructor(scene: THREE.Scene, assetLoader?: AssetLoader) {
    this.scene = scene;
    this.assetLoader = assetLoader;
  }

  // ── NPC management ──────────────────────────────────────────────────────────

  /**
   * Create and register an NPC, adding it to the scene immediately.
   *
   * Idempotent by id: if an NPC with the same id already exists (e.g. the
   * client re-joined after a WebSocket reconnect and the server re-sent the
   * full NPC list), the previous instance is disposed and removed from the
   * scene first. Without this, re-joins leak the old mesh and NPCs visibly
   * multiply.
   */
  addNPC(config: NPCConfig): NPC {
    if (this.npcs.has(config.id)) {
      this.removeNPC(config.id);
    }
    const npc = NPC.create(config, this.assetLoader);
    this.npcs.set(npc.id, npc);
    this.scene.add(npc.mesh);
    this._cachesDirty = true;
    return npc;
  }

  /**
   * Apply the server's authoritative nearby-NPC snapshot.
   *
   * - Existing entities are updated in place (no churn).
   * - `proc_*` / `enc_*` NPCs are owned by the client ProceduralPopulator
   *   (spawned/released per terrain chunk), so server echoes of them are
   *   ignored here — otherwise they get re-added after the chunk released them
   *   and leak, since the populator no longer tracks them.
   * - Previously-synced server NPCs that are absent from this snapshot are
   *   removed, so roaming doesn't accumulate every NPC ever streamed.
   */
  syncServerNPCs(configs: NPCConfig[]): void {
    const incoming = new Set<string>();

    for (const config of configs) {
      if (config.id.startsWith('proc_') || config.id.startsWith('enc_')) continue;
      incoming.add(config.id);

      const existing = this.npcs.get(config.id);
      if (!existing) {
        this.addNPC(config);
        continue;
      }

      if (config.scale !== undefined) {
        existing.mesh.scale.setScalar(config.scale);
      }
      if (config.hp !== undefined && config.maxHp !== undefined) {
        existing.nameplate.updateHP(config.hp, config.maxHp);
      }
    }

    // Prune server NPCs that are no longer in the nearby snapshot.
    for (const id of this.serverNpcIds) {
      if (!incoming.has(id)) this.removeNPC(id);
    }
    this.serverNpcIds = incoming;
  }

  /** Retrieve an NPC by id. */
  getNPC(id: string): NPC | undefined {
    return this.npcs.get(id);
  }

  /** Return all registered NPCs. Cached — no allocation unless the roster changed. */
  getAllNPCs(): NPC[] {
    if (this._cachesDirty) this._rebuildCaches();
    return this._npcArrayCache;
  }

  /** Remove an NPC from the registry and the scene. */
  removeNPC(id: string): void {
    const npc = this.npcs.get(id);
    if (npc) {
      this.scene.remove(npc.mesh);
      npc.dispose?.();
      this.npcs.delete(id);
      this._cachesDirty = true;
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

  /** Return all NPC mesh groups for raycaster intersection tests. Cached — no allocation unless the roster changed. */
  getMeshes(): THREE.Object3D[] {
    if (this._cachesDirty) this._rebuildCaches();
    return this._meshesCache;
  }

  private _rebuildCaches(): void {
    this._meshesCache.length = 0;
    this._npcArrayCache.length = 0;
    for (const npc of this.npcs.values()) {
      this._meshesCache.push(npc.mesh);
      this._npcArrayCache.push(npc);
    }
    this._cachesDirty = false;
  }
}
