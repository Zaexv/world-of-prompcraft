import * as THREE from "three";
import { DUNGEONS } from "../scene/DungeonConfig";
import {
  createDungeonInterior,
  disposeDungeonInterior,
} from "../scene/DungeonInterior";
import type { DungeonObjects } from "../scene/DungeonInterior";
import type { EntityManager } from "../entities/EntityManager";
import type { WebSocketClient } from "../network/WebSocketClient";
import type { PlayerState } from "../state/PlayerState";
import type { CollisionSystem, PhysicsEntry } from "./CollisionSystem";

/**
 * Manages dungeon enter/exit flow, proximity prompts, and chest interaction.
 *
 * Collision is handled entirely by the shared CollisionSystem (cannon-es).
 * On enter we save the overworld physics bodies, swap in dungeon wall/object
 * bodies, and restore on exit. NPC collision is always handled via the
 * dynamic source — no special dungeon logic needed for that.
 */
export class DungeonSystem {
  private scene: THREE.Scene;
  private entityManager: EntityManager;
  private ws: WebSocketClient;
  private playerState: PlayerState;

  /** Dungeon entrance positions registered by WorldGenerator. */
  private entrances: Map<
    string,
    { position: THREE.Vector3; dungeonId: string }
  > = new Map();

  /** Currently loaded dungeon interior (null when in overworld). */
  private activeDungeon: DungeonObjects | null = null;
  private activeDungeonId: string | null = null;
  private activeDungeonConfig: { lootItem: string; fogColor: number; fogDensity: number } | null = null;

  /** Player position before entering the dungeon. */
  private savedPlayerPosition: THREE.Vector3 | null = null;

  /** NPC IDs spawned for the dungeon (cleaned up on exit). */
  private dungeonEnemyIds: string[] = [];

  /** Overworld objects hidden while in dungeon. */
  private hiddenObjects: THREE.Object3D[] = [];

  /** Objects that must remain visible inside the dungeon (e.g. the player). */
  private excludeFromHide: Set<THREE.Object3D> = new Set();

  /** Loot collected from the dungeon chest. */
  private collectedLoot: string[] = [];

  /** Whether the chest has been opened in the current dungeon. */
  private chestOpened = false;

  // ── Collision ───────────────────────────────────────────────────────────
  private collisionSystem: CollisionSystem | null = null;
  private savedOverworldCollidables: PhysicsEntry[] = [];

  // ── Position tracking ───────────────────────────────────────────────────
  private lastOverworldPos: THREE.Vector3 | null = null;

  // ── Proximity UI ─────────────────────────────────────────────────────────
  private promptElement: HTMLDivElement;
  private nearestEntrance: string | null = null;
  private nearInteraction: "exit" | "chest" | null = null;

  // ── Callbacks ────────────────────────────────────────────────────────────
  onEnterDungeon?: (dungeonId: string, dungeonName: string) => void;
  onExitDungeon?: () => void;

  constructor(
    scene: THREE.Scene,
    entityManager: EntityManager,
    ws: WebSocketClient,
    playerState: PlayerState,
  ) {
    this.scene = scene;
    this.entityManager = entityManager;
    this.ws = ws;
    this.playerState = playerState;

    this.promptElement = document.createElement("div");
    Object.assign(this.promptElement.style, {
      position: "fixed",
      bottom: "120px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "10px 24px",
      background:
        "linear-gradient(180deg, rgba(26,17,8,0.9), rgba(20,12,4,0.95))",
      border: "1px solid #c5a55a",
      borderRadius: "4px",
      color: "#c5a55a",
      fontSize: "16px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontWeight: "700",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)",
      letterSpacing: "1px",
      pointerEvents: "none",
      zIndex: "25",
      opacity: "0",
      transition: "opacity 0.3s ease",
    } as CSSStyleDeclaration);
    document.body.appendChild(this.promptElement);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  setCollisionSystem(cs: CollisionSystem): void {
    this.collisionSystem = cs;
  }

  /**
   * Register an object that must stay visible when entering a dungeon
   * (e.g. the local player model).
   */
  excludeFromDungeonHide(obj: THREE.Object3D): void {
    this.excludeFromHide.add(obj);
  }

  isInDungeon(): boolean {
    return this.activeDungeon !== null;
  }

  registerEntrance(id: string, position: THREE.Vector3, dungeonId: string): void {
    this.entrances.set(id, { position: position.clone(), dungeonId });
  }

  unregisterEntrance(id: string): void {
    this.entrances.delete(id);
    if (this.nearestEntrance === id) {
      this.nearestEntrance = null;
      this.hidePrompt();
    }
  }

  /** Track player position each frame for save-on-enter. */
  setPlayerPosition(pos: THREE.Vector3): void {
    if (!this.activeDungeon) {
      if (!this.lastOverworldPos) this.lastOverworldPos = new THREE.Vector3();
      this.lastOverworldPos.copy(pos);
    }
  }

  /** Called every frame. */
  update(playerPos: THREE.Vector3): void {
    if (this.activeDungeon) {
      this.updateDungeonProximity(playerPos);
      return;
    }
    this.updateOverworldProximity(playerPos);
  }

  tryEnter(): void {
    if (this.activeDungeon) {
      this.tryInteractInDungeon();
    } else if (this.nearestEntrance) {
      this.enterDungeon(this.nearestEntrance);
    }
  }

  getSavedPlayerPosition(): THREE.Vector3 | null {
    return this.savedPlayerPosition;
  }

  // ── Overworld proximity ──────────────────────────────────────────────────

  private updateOverworldProximity(playerPos: THREE.Vector3): void {
    let closestId: string | null = null;
    let closestDist = Infinity;

    for (const [id, entrance] of this.entrances) {
      const dist = playerPos.distanceTo(entrance.position);
      if (dist < 8 && dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }

    if (closestId !== this.nearestEntrance) {
      this.nearestEntrance = closestId;
      if (closestId) {
        const entrance = this.entrances.get(closestId)!;
        const config = DUNGEONS[entrance.dungeonId];
        this.showPrompt(`Press E to enter ${config ? config.name : entrance.dungeonId}`);
      } else {
        this.hidePrompt();
      }
    }
  }

  // ── Dungeon interior proximity ───────────────────────────────────────────

  private updateDungeonProximity(playerPos: THREE.Vector3): void {
    if (!this.activeDungeon) return;

    const exitDist = playerPos.distanceTo(this.activeDungeon.exitPortalPosition);
    const chestDist = playerPos.distanceTo(this.activeDungeon.chestPosition);

    if (exitDist < 4) {
      if (this.nearInteraction !== "exit") {
        this.nearInteraction = "exit";
        this.showPrompt("Press E to exit dungeon");
      }
    } else if (chestDist < 4 && !this.chestOpened) {
      if (this.nearInteraction !== "chest") {
        this.nearInteraction = "chest";
        this.showPrompt("Press E to open chest");
      }
    } else if (this.nearInteraction !== null) {
      this.nearInteraction = null;
      this.hidePrompt();
    }
  }

  private tryInteractInDungeon(): void {
    if (this.nearInteraction === "exit") this.exitDungeon();
    else if (this.nearInteraction === "chest") this.openChest();
  }

  // ── Enter dungeon ────────────────────────────────────────────────────────

  private enterDungeon(entranceId: string): void {
    const entrance = this.entrances.get(entranceId);
    if (!entrance) return;
    const config = DUNGEONS[entrance.dungeonId];
    if (!config) return;

    // 1. Save player position
    this.savedPlayerPosition = this.lastOverworldPos
      ? this.lastOverworldPos.clone()
      : entrance.position.clone();

    // 2. Hide overworld objects (but keep excluded objects like the player visible)
    this.hiddenObjects = [];
    for (const child of this.scene.children) {
      if (child.visible && !this.excludeFromHide.has(child)) {
        this.hiddenObjects.push(child);
        child.visible = false;
      }
    }

    // 3. Create dungeon interior
    this.activeDungeon = createDungeonInterior(config);
    this.activeDungeonId = entrance.dungeonId;
    this.activeDungeonConfig = config;
    this.chestOpened = false;
    this.collectedLoot = [];
    this.scene.add(this.activeDungeon.group);

    // 4. Spawn enemies (wanderRadius 0)
    this.dungeonEnemyIds = [];
    const spawnPoints = this.activeDungeon.enemySpawnPoints;
    for (let i = 0; i < spawnPoints.length && i < config.enemyNames.length; i++) {
      const enemyId = `dungeon_enemy_${entrance.dungeonId}_${i}`;
      const npc = this.entityManager.addNPC({
        id: enemyId,
        name: config.enemyNames[i],
        position: spawnPoints[i].clone(),
        color: config.enemyColor,
      });
      npc.wanderRadius = 0;
      this.dungeonEnemyIds.push(enemyId);
    }

    // 5. Notify server
    this.ws.send({ type: "dungeon_enter", dungeonId: entrance.dungeonId, playerId: "player" });

    // 6. Fire callback
    this.onEnterDungeon?.(entrance.dungeonId, config.name);
    this.nearestEntrance = null;
    this.hidePrompt();

    // 7. Dungeon fog
    this.scene.fog = new THREE.FogExp2(config.fogColor, config.fogDensity);

    // 8. Swap collision: save overworld bodies, register dungeon walls + objects
    if (this.collisionSystem) {
      this.savedOverworldCollidables = this.collisionSystem.saveCollidables();
      // Register every mesh in the dungeon group as a static collidable
      // (walls, floor, ceiling, decorations, chest, portal)
      const dungeonMeshes: THREE.Object3D[] = [];
      this.activeDungeon.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          dungeonMeshes.push(child);
        }
      });
      this.collisionSystem.setCollidables(dungeonMeshes);
    }
  }

  // ── Exit dungeon ─────────────────────────────────────────────────────────

  private exitDungeon(): void {
    if (!this.activeDungeon) return;

    // 1. Dispose dungeon interior
    this.scene.remove(this.activeDungeon.group);
    disposeDungeonInterior(this.activeDungeon);

    // 2. Remove dungeon enemies
    for (const enemyId of this.dungeonEnemyIds) {
      this.entityManager.removeNPC(enemyId);
    }
    this.dungeonEnemyIds = [];

    // 3. Show overworld objects
    for (const obj of this.hiddenObjects) {
      obj.visible = true;
    }
    this.hiddenObjects = [];

    // 4. Notify server
    this.ws.send({
      type: "dungeon_exit",
      dungeonId: this.activeDungeonId ?? "",
      playerId: "player",
      loot: this.collectedLoot,
    });

    // 5. Restore fog
    this.scene.fog = new THREE.FogExp2(0x1a1133, 0.004);

    // 6. Restore overworld collision bodies
    if (this.collisionSystem) {
      this.collisionSystem.restoreCollidables(this.savedOverworldCollidables);
      this.savedOverworldCollidables = [];
    }

    // 7. Fire callback
    this.onExitDungeon?.();

    // 8. Clear state
    this.activeDungeon = null;
    this.activeDungeonId = null;
    this.activeDungeonConfig = null;
    this.nearInteraction = null;
    this.collectedLoot = [];
    this.chestOpened = false;
    this.hidePrompt();
  }

  // ── Chest interaction ────────────────────────────────────────────────────

  private openChest(): void {
    if (this.chestOpened || !this.activeDungeon || !this.activeDungeonConfig) return;

    this.chestOpened = true;

    this.activeDungeon.chestMesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mat = child.material;
        if (mat instanceof THREE.MeshStandardMaterial) {
          mat.emissiveIntensity = 0.05;
          mat.color.setHex(0x665533);
        }
      }
    });

    const lootItem = this.activeDungeonConfig.lootItem;
    this.playerState.addItem(lootItem);
    this.collectedLoot.push(lootItem);
    this.showLootText(`+ ${lootItem}`);
    this.nearInteraction = null;
    this.hidePrompt();
  }

  // ── UI helpers ───────────────────────────────────────────────────────────

  private showPrompt(text: string): void {
    this.promptElement.textContent = text;
    this.promptElement.style.opacity = "1";
  }

  private hidePrompt(): void {
    this.promptElement.style.opacity = "0";
  }

  private showLootText(text: string): void {
    const el = document.createElement("div");
    Object.assign(el.style, {
      position: "fixed",
      bottom: "180px",
      left: "50%",
      transform: "translateX(-50%)",
      color: "#c5a55a",
      fontSize: "22px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontWeight: "700",
      textShadow: "0 1px 4px rgba(0,0,0,0.9)",
      pointerEvents: "none",
      zIndex: "30",
      opacity: "1",
      transition: "opacity 1.5s ease, transform 2s ease",
    } as CSSStyleDeclaration);
    el.textContent = text;
    document.body.appendChild(el);

    requestAnimationFrame(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(-50%) translateY(-60px)";
    });

    setTimeout(() => el.remove(), 2500);
  }
}
