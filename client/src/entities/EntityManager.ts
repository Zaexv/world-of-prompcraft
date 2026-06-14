import * as THREE from 'three';
import { NPC, NPCConfig } from './NPC';
import { resolveAppearance } from './npc/NPCAppearanceResolver';
import { buildNPCMesh } from './npc/NPCMeshFactory';
import { RemotePlayer } from './RemotePlayer';
import type { RemotePlayerData } from '../network/MessageProtocol';
import type { CollisionSystem } from '../systems/CollisionSystem';

/**
 * Central registry for all NPC entities and remote players.
 * Manages their lifecycle and exposes helpers for the interaction system.
 */
export class EntityManager {
  public readonly npcs: Map<string, NPC> = new Map();
  private readonly remotePlayers: Map<string, RemotePlayer> = new Map();

  /** Ids of NPCs known to be dead (server-authoritative). Spawning these is
   *  refused so a corpse can't reappear via chunk reload or a re-join. */
  private readonly deadNpcIds = new Set<string>();

  /** Online mode: the server owns NPC positions — local random wander is off
   *  and positions pushed by the server are applied in update(). */
  private serverAuthoritativeNPCs = false;
  /** Server NPC positions waiting to be applied (needs getHeightAt). */
  private pendingNPCPositions: Array<{ npcId: string; position: [number, number, number] }> = [];

  private scene: THREE.Scene;

  // Interleaving & Performance
  private frameCount = 0;
  private readonly INTERLEAVE_FACTOR = 4; // Spread expensive work over 4 frames
  private npcList: NPC[] = [];
  private npcIndex = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
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
  addNPC(config: NPCConfig): NPC | undefined {
    if (this.deadNpcIds.has(config.id)) return undefined;
    if (this.npcs.has(config.id)) {
      this.removeNPC(config.id);
    }
    const spec = resolveAppearance(config);
    const scale = spec.scale ?? config.scale ?? 1;
    const built = buildNPCMesh({ ...spec, scale }, config.position, config.id);
    const npc = new NPC(config, built);

    // Tag for editor selection
    npc.mesh.userData.editorId = npc.id;
    npc.mesh.userData.editorType = 'npc';
    
    this.npcs.set(npc.id, npc);
    this.scene.add(npc.mesh);
    this.npcList = Array.from(this.npcs.values());
    // Online mode: the server owns NPC positions (it runs the wander loop), so
    // local random wander is suppressed and the NPC only walks to server-pushed
    // targets. Fixed NPCs never move regardless (see NPC.fixed).
    if (this.serverAuthoritativeNPCs) npc.setServerDriven(true);
    return npc;
  }

  /** Retrieve an NPC by id. */
  getNPC(id: string): NPC | undefined {
    return this.npcs.get(id);
  }

  /** Return all registered NPCs. */
  getAllNPCs(): NPC[] {
    return this.npcList;
  }

  /** Remove an NPC from the registry and the scene. */
  removeNPC(id: string): void {
    const npc = this.npcs.get(id);
    if (npc) {
      this.scene.remove(npc.mesh);
      npc.dispose?.();
      this.npcs.delete(id);
      this.npcList = Array.from(this.npcs.values());
    }
  }

  /** Mark an NPC as permanently dead and despawn it if present.
   *  Future addNPC calls for this id (chunk reload, join_ok replay) are no-ops. */
  markNPCDead(id: string): void {
    this.deadNpcIds.add(id);
    this.removeNPC(id);
  }

  /** Hand NPC position authority to the server (online mode). Applies to all
   *  current and future NPCs; offline play and the presentation backdrop keep
   *  the local wander AI. */
  setServerAuthoritativeNPCs(on: boolean): void {
    this.serverAuthoritativeNPCs = on;
    for (const npc of this.npcList) npc.setServerDriven(on);
  }

  /** Queue server-pushed NPC positions; applied next update() where terrain
   *  height is available (walk when near, teleport when badly diverged). */
  applyServerNPCPositions(updates: Array<{ npcId: string; position: [number, number, number] }>): void {
    this.pendingNPCPositions.push(...updates);
  }

  /** Whether this NPC id is known to be dead. */
  isNPCDead(id: string): boolean {
    return this.deadNpcIds.has(id);
  }

  // ── Remote player management ────────────────────────────────────────────────

  /** Add a remote player to the scene. */
  addRemotePlayer(data: RemotePlayerData): RemotePlayer {
    if (this.remotePlayers.has(data.playerId)) {
      this.removeRemotePlayer(data.playerId);
    }
    const remote = new RemotePlayer(data, this.scene);
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

  /** Update or add remote players from a world update, culling those no longer visible. */
  updateRemotePlayers(players: RemotePlayerData[]): void {
    const updatedIds = new Set<string>();
    
    for (const p of players) {
      updatedIds.add(p.playerId);
      const existing = this.remotePlayers.get(p.playerId);
      if (existing) {
        existing.setTarget(p.position, p.yaw);
        existing.setHP(p.hp, p.maxHp);
      } else {
        this.addRemotePlayer(p);
      }
    }
    
    // Remove any remote players that were not in this update (e.g. walked out of range, or dropped silently)
    for (const [id] of this.remotePlayers) {
      if (!updatedIds.has(id)) {
        this.removeRemotePlayer(id);
      }
    }
  }

  // ── Distance culling & Interleaving ─────────────────────────────────────────

  private playerX = 0;
  private playerZ = 0;
  
  // Tuned radii for performance
  private readonly UPDATE_RADIUS_SQ = 120 * 120;   // full AI/anim within 120m
  private readonly VISIBLE_RADIUS_SQ = 250 * 250;  // hide beyond 250m
  private readonly NAMEPLATE_RADIUS_SQ = 60 * 60;  // hide details beyond 60m

  /** Set the player position so NPCs can be distance-culled. */
  setPlayerPosition(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
  }

  /** Tick NPC animations and wandering AI with aggressive interleaving. */
  update(delta: number, getHeightAt?: (x: number, z: number) => number, collisionSystem?: CollisionSystem): void {
    this.frameCount++;
    const start = performance.now();
    const BUDGET_MS = 2.0;

    // 0. SERVER NPC POSITIONS — the server owns NPC movement (wander loop). Walk
    //    to nearby targets, teleport on a large divergence (rejoin / long cull).
    //    Fixed NPCs hold their authored spot: they ignore small targets and only
    //    teleport-reground on a big jump.
    if (this.pendingNPCPositions.length > 0) {
      for (const u of this.pendingNPCPositions) {
        const npc = this.npcs.get(u.npcId);
        if (!npc) continue;
        const [x, , z] = u.position;
        const dx = x - npc.position.x;
        const dz = z - npc.position.z;
        if (dx * dx + dz * dz > 25 * 25) {
          // Badly diverged (rejoin, long cull) — teleport and re-ground.
          const y = getHeightAt ? getHeightAt(x, z) : npc.position.y;
          npc.mesh.position.set(x, y, z);
          npc.position.copy(npc.mesh.position);
          if (getHeightAt) npc.snapToGround(getHeightAt);
        } else if (!npc.fixed && dx * dx + dz * dz > 0.36) {
          npc.walkToServerPosition(new THREE.Vector3(x, npc.position.y, z));
        }
      }
      this.pendingNPCPositions.length = 0;
    }

    // 1. DISTANCE CULLING & LOD (Interleaved: only check a portion of NPCs per frame)
    const count = this.npcList.length;
    if (count > 0) {
      const batchSize = Math.ceil(count / this.INTERLEAVE_FACTOR);
      for (let i = 0; i < batchSize; i++) {
        const idx = (this.npcIndex + i) % count;
        const npc = this.npcList[idx];

        const dx = npc.position.x - this.playerX;
        const dz = npc.position.z - this.playerZ;
        const distSq = dx * dx + dz * dz;

        // --- Visibility (Level 2 LOD) ---
        const isVisible = distSq < this.VISIBLE_RADIUS_SQ;
        if (npc.mesh.visible !== isVisible) {
          npc.mesh.visible = isVisible;
        }

        if (isVisible) {
          // --- Nameplate/UI (Level 1 LOD) ---
          const showDetails = distSq < this.NAMEPLATE_RADIUS_SQ;
          if (npc.nameplate.sprite.visible !== showDetails) {
            npc.nameplate.sprite.visible = showDetails;
            npc.actionIcon.sprite.visible = showDetails;
          }

          // --- Animation Throttling ---
          if (distSq < 40 * 40) {
            npc.animator.throttleFactor = 1; // full rate
          } else if (distSq < 80 * 80) {
            npc.animator.throttleFactor = 2; // half rate
          } else {
            npc.animator.throttleFactor = 4; // quarter rate
          }

          // --- Snap to ground only if needed ---
          if (getHeightAt && !npc.isGrounded) {
            npc.snapToGround(getHeightAt);
            npc.isGrounded = true;
          }
        }
      }
      this.npcIndex = (this.npcIndex + batchSize) % count;
    }

    // 2. ACTIVE UPDATES (Within update radius and frame budget)
    for (const npc of this.npcList) {
      if (!npc.mesh.visible) continue;

      const dx = npc.position.x - this.playerX;
      const dz = npc.position.z - this.playerZ;
      const distSq = dx * dx + dz * dz;

      if (distSq < this.UPDATE_RADIUS_SQ) {
        // Stop if we hit the CPU budget for this frame
        if (performance.now() - start > BUDGET_MS) break;

        npc.update(delta);
        if (getHeightAt) {
          // AI updates are even more expensive, so we interleave them too
          if ((this.frameCount + npc.id.length) % 2 === 0) {
            npc.updateWander(delta * 2, getHeightAt, collisionSystem);
          }
        }
      }
    }

    // 3. REMOTE PLAYERS (Always update, usually few)
    for (const remote of this.remotePlayers.values()) {
      remote.update(delta);
    }
  }

  /** Return all NPC mesh groups for raycaster intersection tests. */
  getMeshes(): THREE.Object3D[] {
    const meshes: THREE.Object3D[] = [];
    for (const npc of this.npcList) {
      if (npc.mesh.visible) {
        meshes.push(npc.mesh);
      }
    }
    return meshes;
  }
}
