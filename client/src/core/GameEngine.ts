import * as THREE from 'three';
import { AudioSystem } from '../audio/AudioSystem';
import type { SceneManager } from '../scene/SceneManager';
import type { PlayerController } from '../entities/PlayerController';
import type { Player } from '../entities/Player';
import type { EntityManager } from '../entities/EntityManager';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { InteractionSystem } from '../systems/InteractionSystem';
import type { ReactionSystem } from '../systems/ReactionSystem';
import type { WorldGenerator } from '../systems/WorldGenerator';
import type { WorldBuilder } from '../systems/WorldBuilder';
import type { ZoneTracker } from '../systems/ZoneTracker';
import type { ZoneAtmosphere } from '../systems/ZoneAtmosphere';
import type { DungeonSystem } from '../systems/DungeonSystem';
import type { BoatSystem } from '../systems/BoatSystem';
import type { UIManager } from '../ui/UIManager';
import type { WebSocketClient } from '../network/WebSocketClient';
import type { PlayerState } from '../state/PlayerState';
import { getWorldHeightAt } from '../scene/VerticalTerrain';
import type { RuntimeState } from './RuntimeState';
import type { NPCStateStore } from '../state/NPCState';
import { WorldDebugOverlay } from '../debug/WorldDebugOverlay';
import { PerfHUD } from '../debug/PerfHUD';

const MOVE_SEND_INTERVAL = 1 / 10;
const INTRO_DURATION_SEC = 8;

export interface GameEngineDeps {
  sceneManager: SceneManager;
  playerController: PlayerController;
  player: Player;
  entityManager: EntityManager;
  collisionSystem: CollisionSystem;
  interactionSystem: InteractionSystem;
  reactionSystem: ReactionSystem;
  worldGenerator: WorldGenerator;
  worldBuilder: WorldBuilder;
  zoneTracker: ZoneTracker;
  zoneAtmosphere: ZoneAtmosphere;
  dungeonSystem: DungeonSystem;
  boatSystem: BoatSystem;
  uiManager: UIManager;
  ws: WebSocketClient;
  playerState: PlayerState;
  npcStateStore: NPCStateStore;
  runtime: RuntimeState;
}

export class GameEngine {
  private running = false;
  private moveSendTimer = 0;
  private lastInteractedNpcName = '';
  private activeDialogNpcId: string | null = null;

  // Minimap NPC dot throttle — rebuild at most once every 10 frames
  private _npcDotTick = 0;

  // Intro cinematic
  private introCinematicActive = false;
  private introCinematicHasPlayed = false;
  private introCinematicStartMs = 0;
  private introOverlay: HTMLDivElement | null = null;
  private removeIntroSkipHandlers: (() => void) | null = null;
  private readonly introStart = new THREE.Vector3();
  private readonly introEnd   = new THREE.Vector3();
  private readonly introCamPos = new THREE.Vector3();
  private readonly introLookAt = new THREE.Vector3();

  // Dialog focus
  private readonly dialogFocusTarget   = new THREE.Vector3();
  private readonly dialogFocusLookAt   = new THREE.Vector3();
  private readonly dialogFocusForward  = new THREE.Vector3();
  private readonly dialogFocusSide     = new THREE.Vector3();
  private readonly dialogFocusUp       = new THREE.Vector3(0, 1, 0);

  // Reusable per-frame vectors
  private readonly _camDir       = new THREE.Vector3();
  private readonly _idleVelocity = new THREE.Vector3();

  private debugOverlay: WorldDebugOverlay | null = null;
  private perfHUD: PerfHUD | null = null;

  constructor(private readonly d: GameEngineDeps) {
    this.wireCallbacks();
    const appContainer = d.sceneManager.renderer.domElement.parentElement;
    if (appContainer) {
      this.debugOverlay = new WorldDebugOverlay(
        appContainer,
        d.sceneManager.scene,
        d.sceneManager.camera,
      );
      this.perfHUD = new PerfHUD(
        appContainer,
        d.sceneManager.renderer,
        () => ({
          collidables: d.collisionSystem.getCollidableCount(),
          npcs: d.entityManager.npcs.size,
          sceneChildren: d.sceneManager.scene.children.length,
          x: d.playerController.position.x,
          z: d.playerController.position.z,
          zone: d.zoneTracker.getCurrentZone() || 'Wilderness',
        }),
      );
    }
  }

  start(): void {
    this.running = true;
    this.animate();
  }

  stop(): void {
    this.running = false;
  }

  startIntroCinematic(): void {
    if (this.introCinematicHasPlayed) return;
    this.introCinematicHasPlayed = true;
    this.introCinematicActive = true;
    this.introCinematicStartMs = performance.now();

    const pos = this.d.playerController.position;
    this.introStart.set(pos.x + 70, pos.y + 38, pos.z + 60);
    this.introEnd.set(pos.x + 16, pos.y + 14, pos.z + 20);

    const appRoot = document.getElementById('app');
    if (appRoot) {
      this.introOverlay = document.createElement('div');
      Object.assign(this.introOverlay.style, {
        position: 'absolute', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
        padding: '8px 14px', borderRadius: '999px',
        fontFamily: "'Cinzel', Georgia, serif", fontSize: '12px', letterSpacing: '0.08em',
        color: '#d6dfef', background: 'rgba(8, 12, 22, 0.62)',
        border: '1px solid rgba(133, 163, 227, 0.45)',
        textShadow: '0 0 8px rgba(120,160,255,0.35)', zIndex: '10001', pointerEvents: 'none',
      } as CSSStyleDeclaration);
      this.introOverlay.textContent = 'Cinematic intro • click or press Space to skip';
      appRoot.appendChild(this.introOverlay);
    }

    const skip = () => this.stopIntroCinematic();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') skip();
    };
    const { renderer } = this.d.sceneManager;
    const onPointerDown = () => skip();
    window.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    this.removeIntroSkipHandlers = () => {
      window.removeEventListener('keydown', onKeyDown);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    };
  }

  private stopIntroCinematic(): void {
    this.introCinematicActive = false;
    if (this.removeIntroSkipHandlers) {
      this.removeIntroSkipHandlers();
      this.removeIntroSkipHandlers = null;
    }
    this.introOverlay?.remove();
    this.introOverlay = null;
  }

  private updateIntroCinematic(): void {
    if (!this.introCinematicActive) return;
    const { camera } = this.d.sceneManager;
    const elapsed = (performance.now() - this.introCinematicStartMs) / 1000;
    const t = Math.min(elapsed / INTRO_DURATION_SEC, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const orbitRadius = THREE.MathUtils.lerp(18, 4, eased);
    const orbitAngle  = eased * Math.PI * 1.5;
    const baseX = THREE.MathUtils.lerp(this.introStart.x, this.introEnd.x, eased);
    const baseY = THREE.MathUtils.lerp(this.introStart.y, this.introEnd.y, eased);
    const baseZ = THREE.MathUtils.lerp(this.introStart.z, this.introEnd.z, eased);
    this.introCamPos.set(
      baseX + Math.cos(orbitAngle) * orbitRadius,
      baseY + Math.sin(eased * Math.PI) * 4,
      baseZ + Math.sin(orbitAngle) * orbitRadius,
    );
    camera.position.copy(this.introCamPos);
    const pos = this.d.playerController.position;
    this.introLookAt.set(pos.x, pos.y + 2, pos.z);
    camera.lookAt(this.introLookAt);
    if (t >= 1) this.stopIntroCinematic();
  }

  private updateDialogFocus(delta: number): boolean {
    const npcId = this.d.runtime.activeNpcId;
    if (!npcId || this.introCinematicActive) return false;
    const npc = this.d.entityManager.getNPC(npcId);
    if (!npc) return false;
    const { camera } = this.d.sceneManager;
    this.dialogFocusForward.subVectors(npc.mesh.position, this.d.playerController.position);
    this.dialogFocusForward.y = 0;
    const horiz = this.dialogFocusForward.length();
    if (horiz < 0.001) return false;
    this.dialogFocusForward.divideScalar(horiz);
    this.dialogFocusSide.crossVectors(this.dialogFocusUp, this.dialogFocusForward).normalize();
    this.dialogFocusTarget.set(
      this.d.playerController.position.x - this.dialogFocusForward.x * 2.2 + this.dialogFocusSide.x * 0.85,
      this.d.playerController.position.y + 1.9,
      this.d.playerController.position.z - this.dialogFocusForward.z * 2.2 + this.dialogFocusSide.z * 0.85,
    );
    camera.position.lerp(this.dialogFocusTarget, 1 - Math.exp(-10 * delta));
    this.dialogFocusLookAt.set(npc.mesh.position.x, npc.mesh.position.y + 1.55, npc.mesh.position.z);
    camera.lookAt(this.dialogFocusLookAt);
    this.d.playerController.facingYawOverride =
      Math.atan2(this.dialogFocusForward.x, this.dialogFocusForward.z);
    return true;
  }

  /** Clear active NPC dialog focus and release any locked camera state. */
  private clearNpcFocus(): void {
    const { d } = this;
    d.runtime.activeNpcId = null;
    d.playerController.facingYawOverride = null;
    d.playerController.releaseCameraControl();
  }

  private wireCallbacks(): void {
    const { d } = this;

    // Interaction
    d.interactionSystem.onNPCClick = (npcId: string, npcName: string) => {
      if (d.playerState.isDead) return;
      d.runtime.activeNpcId = npcId;
      this.lastInteractedNpcName = npcName;

      const npc = d.entityManager.getNPC(npcId);
      if (npc) {
        const targetPos = d.playerController.position.clone();
        npc.walkToPlayer(targetPos);
        d.ws.sendNPCMove(npcId, [targetPos.x, targetPos.y, targetPos.z]);
      }

      d.uiManager.showInteractionPanel(npcId, npcName);
      const npcState = d.npcStateStore.getState(npcId);
      // Seed the panel with the persisted relationship/mood so a returning
      // player sees their real standing before saying a word.
      d.uiManager.interactionPanel.updateMoodStatus(
        npcState?.mood ?? "neutral",
        npcState?.relationship_score ?? 0,
      );
      const isHostile = npcState?.archetype?.includes("hostile") || npcState?.mood === "angry";
      if (isHostile) {
        d.uiManager.showCombatHUD(npcId, npcName, npcState?.hp ?? 100, npcState?.maxHp ?? 100);
        d.uiManager.combatHUD.updatePlayerHP(d.playerState.hp, d.playerState.maxHp);
        d.uiManager.combatHUD.updatePlayerMana(d.playerState.mana, d.playerState.maxMana);
      }
    };

    d.uiManager.interactionPanel.onClose = () => {
      const previousNpcId = d.runtime.activeNpcId;
      d.runtime.activeNpcId = null;
      d.playerController.facingYawOverride = null;
      d.uiManager.hideInteractionPanel();
      d.uiManager.hideCombatHUD();
      if (previousNpcId) {
        const npc = d.entityManager.getNPC(previousNpcId);
        npc?.resumeWander();
      }
    };

    // Death
    d.playerState.onDeath = () => {
      AudioSystem.getInstance().playSfx("death");
      // Release NPC dialog focus — death usually happens mid-combat, so
      // activeNpcId is set and would keep the camera locked after respawn.
      this.clearNpcFocus();
      d.uiManager.showDeathScreen(this.lastInteractedNpcName || undefined);
      d.uiManager.hideInteractionPanel();
      d.uiManager.hideCombatHUD();
    };
    d.uiManager.deathScreen.onRespawn = () => {
      AudioSystem.getInstance().playSfx("respawn");
      // Defensive: ensure dialog focus + camera control are fully released so
      // the player regains movement and free-look after respawn.
      this.clearNpcFocus();
      d.playerState.respawn();
      const { terrain } = d.sceneManager;
      d.playerController.position.set(0, terrain.getHeightAt(0, 0), 0);
      d.uiManager.hideDeathScreen();
    };

    // Dungeon
    d.dungeonSystem.onEnterDungeon = (_id: string, name: string) => {
      this.d.runtime.inDungeonOverride = true;
      d.zoneTracker.forceZone(name, `Dungeon: ${name}`);
      d.playerController.position.set(0, 0, 5);
    };
    d.dungeonSystem.onExitDungeon = () => {
      this.d.runtime.inDungeonOverride = false;
      const saved = d.dungeonSystem.getSavedPlayerPosition();
      if (saved) {
        d.playerController.position.copy(saved);
        d.playerController.position.y = getWorldHeightAt(d.sceneManager.terrain, saved.x, saved.z);
      }
    };

    // Quest
    d.playerState.onQuestChange = () => { d.uiManager.updateQuestUI(d.playerState); };

    // Zone atmosphere
    d.zoneTracker.onZoneChange = (name: string, desc: string) => {
      d.uiManager.showZoneTransition(name, desc);
      d.zoneAtmosphere.enterZone(name);
    };

    // Debug overlay toggle
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'F3') {
        e.preventDefault();
        this.debugOverlay?.toggle();
      } else if (e.key === 'F4') {
        e.preventDefault();
        this.perfHUD?.toggle();
      }
    });
  }

  private animate(): void {
    if (!this.running) return;
    requestAnimationFrame(() => this.animate());

    const { d } = this;
    // Clamp delta so a chunk-generation stall (which can spike delta to 500ms+)
    // doesn't snap ZoneAtmosphere or animations to their targets in one step.
    const delta = Math.min(d.sceneManager.tick(), 0.1);
    const dialogFocusActive = this.updateDialogFocus(delta);

    if (!d.playerState.isDead) {
      if (!this.introCinematicActive && !dialogFocusActive) {
        d.playerController.update(delta);
      }
      d.player.group.position.copy(d.playerController.position);
      d.player.update(
        delta,
        !this.introCinematicActive && !dialogFocusActive && d.playerController.isMoving,
        (this.introCinematicActive || dialogFocusActive) ? this._idleVelocity : d.playerController.velocity,
        // In a boat the player holds a sailing pose, not the swim pose.
        d.playerController.isSwimming && !d.playerController.inBoat,
        d.playerController.facingYawOverride,
        d.playerController.isGrounded,
        d.playerController.inBoat,
        d.playerController.boardJumpT,
      );
      // Board / leave the boat on entering / leaving water; bob, rock, hop.
      d.boatSystem.update(d.playerController, d.player.group, delta);
      d.playerState.position = [
        d.playerController.position.x,
        d.playerController.position.y,
        d.playerController.position.z,
      ];
    }

    if (dialogFocusActive && d.runtime.activeNpcId) {
      if (this.activeDialogNpcId !== d.runtime.activeNpcId) {
        this.activeDialogNpcId = d.runtime.activeNpcId;
        const npc = d.entityManager.getNPC(d.runtime.activeNpcId);
        if (npc) {
          const dx = npc.position.x - d.playerController.position.x;
          const dz = npc.position.z - d.playerController.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist > 1.5) {
            const nx = d.playerController.position.x + (dx / dist) * 1.5;
            const nz = d.playerController.position.z + (dz / dist) * 1.5;
            const targetPos = new THREE.Vector3(nx, npc.position.y, nz);
            npc.walkToServerPosition(targetPos);
            d.ws.send({
              type: 'npc_move',
              npcId: npc.id,
              position: [nx, npc.position.y, nz],
            });
          }
        }
      }
    } else {
      this.activeDialogNpcId = null;
    }

    if (this.introCinematicActive) {
      this.updateIntroCinematic();
    } else if (!dialogFocusActive) {
      d.playerController.facingYawOverride = null;
    }

    const px = d.playerController.position.x;
    const pz = d.playerController.position.z;

    d.sceneManager.terrain.update(px, pz);
    d.sceneManager.setPlayerPosition(px, pz);
    d.worldBuilder.update(px, pz);
    d.worldGenerator.update(px, pz); // drain procedural spawn queue
    d.entityManager.setPlayerPosition(px, pz);
    d.entityManager.update(delta, (x, z) => this.getTerrainHeight(x, z), d.collisionSystem);
    d.collisionSystem.update();
    d.reactionSystem.tick(delta);
    d.zoneTracker.update(px, pz);
    d.zoneAtmosphere.update(delta);
    d.dungeonSystem.setPlayerPosition(d.playerController.position);
    d.dungeonSystem.update(d.player.group.position);

    d.sceneManager.camera.getWorldDirection(this._camDir);
    d.uiManager.updateMinimap(px, pz, Math.atan2(this._camDir.x, this._camDir.z));
    if (d.uiManager.minimap.getIsVisible()) {
      // Throttle NPC dot rebuild to once per 10 frames — getAllNPCs() allocates
      // a new array every call; at 60fps this is 60 allocations/s with 100+ NPCs.
      this._npcDotTick++;
      if (this._npcDotTick % 10 === 0) {
        d.uiManager.minimap.setNPCDots(
          d.entityManager.getAllNPCs().map(npc => {
            const npcDotState = d.npcStateStore.getState(npc.id);
            const hostile = npcDotState?.archetype?.includes("hostile") || npcDotState?.mood === "angry";
            return {
              x: npc.position.x,
              z: npc.position.z,
              name: npc.name,
              hostile: hostile ?? false,
            };
          })
        );
      }
    }
    d.uiManager.bubbleSystem?.update();

    if (d.runtime.joinedServer) {
      this.moveSendTimer += delta;
      if (this.moveSendTimer >= MOVE_SEND_INTERVAL) {
        this.moveSendTimer = 0;
        d.ws.send({
          type: 'player_move',
          position: [d.playerController.position.x, d.playerController.position.y, d.playerController.position.z],
          // The avatar's visual facing — NOT the camera orbit yaw. Remote clients
          // apply this directly to the model, so sending camera yaw made other
          // players' avatars face wherever the camera pointed.
          yaw: d.player.facingYaw,
          hp: d.playerState.hp,
        });
      }
    }

    this.debugOverlay?.update(d.playerController.position);
    this.perfHUD?.update(delta);
  }

  private getTerrainHeight(x: number, z: number): number {
    if (this.d.runtime.inDungeonOverride) return 0;
    return getWorldHeightAt(this.d.sceneManager.terrain, x, z);
  }
}
