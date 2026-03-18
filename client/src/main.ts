import * as THREE from 'three';
import { SceneManager } from './scene/SceneManager';
import { PlayerController } from './entities/PlayerController';
import { Player } from './entities/Player';
import { EntityManager } from './entities/EntityManager';
import { InteractionSystem } from './systems/InteractionSystem';
import { ReactionSystem } from './systems/ReactionSystem';
import { WebSocketClient } from './network/WebSocketClient';
import { UIManager } from './ui/UIManager';
import { PlayerState } from './state/PlayerState';
import { NPCStateStore } from './state/NPCState';
import { WorldState } from './state/WorldState';
import type { AgentResponse } from './network/MessageProtocol';
import { CollisionSystem } from './systems/CollisionSystem';
import { WorldGenerator } from './systems/WorldGenerator';
import { LoginScreen } from './ui/LoginScreen';
import { DamagePopup } from './ui/DamagePopup';

// ── Hostile NPC set (those that trigger the combat HUD) ──────────────────────
const HOSTILE_NPCS = new Set(['dragon_01', 'guard_01']);

// ── Login / Title screen ────────────────────────────────────────────────────
const loginScreen = new LoginScreen();
loginScreen.show();

loginScreen.onEnterWorld = () => {
  loginScreen.hide();
  initGame();
};

// ── Game initialisation (runs after "Enter World") ──────────────────────────
function initGame() {
  // ── Core scene ────────────────────────────────────────────────────────────
  const app = document.getElementById('app')!;
  const sceneManager = new SceneManager(app);
  const { scene, camera, renderer, terrain } = sceneManager;

  // ── State ─────────────────────────────────────────────────────────────────
  const playerState = PlayerState.getInstance();
  const npcStateStore = new NPCStateStore();
  const worldState = new WorldState(playerState, npcStateStore);

  // ── Player ────────────────────────────────────────────────────────────────
  const playerController = new PlayerController(
    camera,
    renderer.domElement,
    (x: number, z: number) => terrain.getHeightAt(x, z),
  );
  const player = new Player();
  scene.add(player.group);

  // ── NPCs ──────────────────────────────────────────────────────────────────
  const entityManager = new EntityManager(scene);

  // Mirror the backend NPC definitions (positions match server/src/world/npc_definitions.py)
  const NPC_CONFIGS = [
    { id: 'dragon_01', name: 'Ignathar the Ancient', position: new THREE.Vector3(120, 15, -80), color: 0xcc3300 },
    { id: 'merchant_01', name: 'Thornby the Merchant', position: new THREE.Vector3(5, 0, 8), color: 0x88aa44 },
    { id: 'sage_01', name: 'Elyria the Sage', position: new THREE.Vector3(-40, 5, -30), color: 0x6644cc },
    { id: 'guard_01', name: 'Captain Aldric', position: new THREE.Vector3(15, 0, 2), color: 0x888888 },
    { id: 'healer_01', name: 'Sister Mira', position: new THREE.Vector3(-5, 0, 12), color: 0xeedd88 },
    { id: 'eltito_01', name: 'El Tito', position: new THREE.Vector3(18, 0, -35), color: 0x44cc44 },
  ];

  // Build a quick id->name lookup
  const npcNameMap = new Map<string, string>();
  for (const cfg of NPC_CONFIGS) {
    npcNameMap.set(cfg.id, cfg.name);
  }

  for (const cfg of NPC_CONFIGS) {
    // Snap NPC Y to terrain height
    cfg.position.y = terrain.getHeightAt(cfg.position.x, cfg.position.z);
    entityManager.addNPC(cfg);
  }

  // ── Collision (raycaster-based) ──────────────────────────────────────────
  const collisionSystem = new CollisionSystem();

  // Add building groups as collidables (actual meshes — no AABB approximation)
  collisionSystem.addCollidables(sceneManager.buildings.groups);

  // Add massive tree groups as collidables
  if (sceneManager.vegetation.massiveTreeGroups.length > 0) {
    collisionSystem.addCollidables(sceneManager.vegetation.massiveTreeGroups);
  }

  // Add NPC meshes as collidables
  collisionSystem.addCollidables(entityManager.getMeshes());

  playerController.setCollisionSystem(collisionSystem, scene);

  // ── Systems ───────────────────────────────────────────────────────────────
  const interactionSystem = new InteractionSystem(camera, renderer.domElement, entityManager);
  const reactionSystem = new ReactionSystem(scene, playerState, npcStateStore, worldState, entityManager);

  // ── UI ────────────────────────────────────────────────────────────────────
  const uiManager = new UIManager();
  uiManager.updateStatusBars(playerState);
  uiManager.inventoryPanel.update(playerState.inventory);

  playerState.onChange = (state) => {
    uiManager.updateStatusBars(state);
    uiManager.inventoryPanel.update(state.inventory);

    // Keep combat HUD player bars in sync
    if (uiManager.combatHUD.isVisible) {
      uiManager.combatHUD.updatePlayerHP(state.hp, state.maxHp);
      uiManager.combatHUD.updatePlayerMana(state.mana, state.maxMana);
    }
  };

  // ── Death handling ────────────────────────────────────────────────────────
  let lastInteractedNpcName = '';

  playerState.onDeath = () => {
    uiManager.showDeathScreen(lastInteractedNpcName || undefined);
    uiManager.hideInteractionPanel();
    uiManager.hideCombatHUD();
  };

  uiManager.deathScreen.onRespawn = () => {
    playerState.respawn();
    playerController.position.set(0, terrain.getHeightAt(0, 0), 0);
    uiManager.hideDeathScreen();
    renderer.domElement.requestPointerLock();
  };

  // ── Keyboard panel wiring ───────────────────────────────────────────────
  document.addEventListener("keydown", (e: KeyboardEvent) => {
    // Don't handle keys when typing in a text input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;

    if (e.code === "KeyI") {
      uiManager.toggleInventory();

      // Release pointer lock when inventory opens; re-acquire when it closes
      if (uiManager.inventoryPanel.isVisible) {
        if (document.pointerLockElement) {
          document.exitPointerLock();
        }
      } else {
        renderer.domElement.requestPointerLock();
      }
    }

    if (e.code === "KeyM") {
      uiManager.toggleMinimap();
    }
  });

  uiManager.inventoryPanel.onClose = () => {
    renderer.domElement.requestPointerLock();
  };

  // ── Network ───────────────────────────────────────────────────────────────
  const ws = new WebSocketClient('ws://localhost:8000/ws');

  ws.onConnectionChange = (connected) => {
    console.log(`WebSocket ${connected ? 'connected' : 'disconnected'}`);
  };

  // ── Inventory use-item wiring (must be after ws is created) ──────────────
  uiManager.inventoryPanel.onUseItem = (itemName: string) => {
    console.log(`[Inventory] Used item: ${itemName}`);
    ws.send({ type: 'use_item', playerId: 'default', item: itemName });
  };

  // ── World Generator (spawns trees, caves, towns & NPCs on new chunks) ──
  const worldGenerator = new WorldGenerator(scene, terrain, entityManager, ws);
  worldGenerator.setMinimap(uiManager.minimap);
  terrain.onChunkLoaded = (cx, cz, wx, wz) => worldGenerator.onChunkLoaded(cx, cz, wx, wz);

  // ── Interaction wiring ────────────────────────────────────────────────────
  let activeNpcId: string | null = null;

  interactionSystem.onNPCClick = (npcId: string, npcName: string) => {
    if (playerState.isDead) return;
    activeNpcId = npcId;
    lastInteractedNpcName = npcName;
    uiManager.showInteractionPanel(npcId, npcName);

    // Show combat HUD for hostile NPCs
    if (HOSTILE_NPCS.has(npcId)) {
      const npcState = npcStateStore.getState(npcId);
      const hp = npcState?.hp ?? 100;
      const maxHp = npcState?.maxHp ?? 100;
      uiManager.showCombatHUD(npcId, npcName, hp, maxHp);
      uiManager.combatHUD.updatePlayerHP(playerState.hp, playerState.maxHp);
      uiManager.combatHUD.updatePlayerMana(playerState.mana, playerState.maxMana);
    }

    // Exit pointer lock so the player can type
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  };

  uiManager.interactionPanel.onSendMessage = (prompt: string) => {
    if (!activeNpcId) return;

    // Show "thinking" icon above the NPC while waiting for response
    const npc = entityManager.getNPC(activeNpcId);
    if (npc) npc.showAction('thinking', 10);

    // Note: InteractionPanel already adds the player message and shows thinking indicator
    ws.send({
      type: 'interaction',
      npcId: activeNpcId,
      prompt,
      playerState: {
        position: [playerController.position.x, playerController.position.y, playerController.position.z],
        hp: playerState.hp,
        inventory: playerState.inventory,
      },
    });
  };

  uiManager.interactionPanel.onClose = () => {
    activeNpcId = null;
    uiManager.hideInteractionPanel();
    uiManager.hideCombatHUD();
    // Re-enter pointer lock for game controls
    renderer.domElement.requestPointerLock();
  };

  // ── Server response handling ──────────────────────────────────────────────
  ws.onMessage = (data: any) => {
    if (data.type === 'agent_response') {
      const response = data as AgentResponse;

      uiManager.interactionPanel.hideThinking();
      uiManager.interactionPanel.addMessage('npc', response.dialogue);

      // Hide the thinking icon — action icons will be shown per-action by ReactionSystem
      const respondingNpc = entityManager.getNPC(response.npcId);
      if (respondingNpc) respondingNpc.actionIcon.hide();

      reactionSystem.handleResponse(response);

      // ── Combat HUD updates ──────────────────────────────────────────────
      if (uiManager.combatHUD.isVisible) {
        uiManager.combatHUD.updatePlayerHP(playerState.hp, playerState.maxHp);
        uiManager.combatHUD.updatePlayerMana(playerState.mana, playerState.maxMana);

        if (response.npcStateUpdate) {
          uiManager.combatHUD.updateNpcHP(
            response.npcStateUpdate.hp ?? 100,
            response.npcStateUpdate.maxHp ?? 100,
          );
        }
      }

      // ── Combat log entries for each action (always visible) ────────────
      const npcName = npcNameMap.get(response.npcId) ?? entityManager.getNPC(response.npcId)?.name ?? response.npcId;
      for (const action of response.actions) {
        if (action.kind === 'damage') {
          const target = action.params.target ?? 'player';
          const amount = action.params.amount ?? 0;
          const damageType = action.params.damageType ?? 'physical';

          if (target === 'player') {
            const msg = `${npcName} deals ${amount} ${damageType} damage!`;
            uiManager.addCombatLog(msg, '#ff4444');
            if (uiManager.combatHUD.isVisible) {
              uiManager.combatHUD.addLogEntry(msg, '#ff4444');
            }
            // Spawn damage popup on player
            const playerPos = new THREE.Vector3(
              playerController.position.x,
              playerController.position.y + 2.5,
              playerController.position.z,
            );
            const screenPos = DamagePopup.worldToScreen(playerPos, camera, window.innerWidth, window.innerHeight);
            if (screenPos) {
              const isCrit = amount >= 30;
              uiManager.spawnDamagePopup(screenPos.x, screenPos.y, `-${amount}`, '#ff4444', isCrit);
            }
          } else {
            const msg = `You strike ${npcName} for ${amount} damage!`;
            uiManager.addCombatLog(msg, '#ffffff');
            if (uiManager.combatHUD.isVisible) {
              uiManager.combatHUD.addLogEntry(msg, '#ffffff');
            }
            // Spawn damage popup on NPC
            const targetNpc = entityManager.getNPC(target);
            if (targetNpc) {
              const npcPos = targetNpc.mesh.position.clone();
              npcPos.y += 3;
              const screenPos = DamagePopup.worldToScreen(npcPos, camera, window.innerWidth, window.innerHeight);
              if (screenPos) {
                const isCrit = amount >= 30;
                uiManager.spawnDamagePopup(screenPos.x, screenPos.y, `-${amount}`, '#ff6633', isCrit);
              }
            }
          }
        } else if (action.kind === 'heal') {
          const amount = action.params.amount ?? 0;
          const msg = `Healed for ${amount} HP`;
          uiManager.addCombatLog(msg, '#44ff44');
          if (uiManager.combatHUD.isVisible) {
            uiManager.combatHUD.addLogEntry(msg, '#44ff44');
          }
          // Spawn healing popup on player
          const playerPos = new THREE.Vector3(
            playerController.position.x,
            playerController.position.y + 2.5,
            playerController.position.z,
          );
          const screenPos = DamagePopup.worldToScreen(playerPos, camera, window.innerWidth, window.innerHeight);
          if (screenPos) {
            uiManager.spawnDamagePopup(screenPos.x, screenPos.y, `+${amount}`, '#44ff44');
          }
        } else if (action.kind === 'give_item') {
          const item = action.params.item ?? 'Unknown Item';
          uiManager.addCombatLog(`Received: ${item}`, '#c5a55a');
          if (uiManager.combatHUD.isVisible) {
            uiManager.combatHUD.addLogEntry(`Received: ${item}`, '#c5a55a');
          }
        } else if (action.kind === 'start_quest' || action.kind === 'complete_quest') {
          const quest = action.params.quest ?? action.params.name ?? 'Unknown Quest';
          const prefix = action.kind === 'start_quest' ? 'Quest Started' : 'Quest Complete';
          uiManager.addCombatLog(`${prefix}: ${quest}`, '#c5a55a');
          if (uiManager.combatHUD.isVisible) {
            uiManager.combatHUD.addLogEntry(`${prefix}: ${quest}`, '#c5a55a');
          }
        } else if (action.kind === 'emote') {
          const animation = action.params.animation ?? action.params.emote ?? 'gesture';
          uiManager.addCombatLog(`${npcName} performs ${animation}`, '#aaaaaa');
        }
      }
    }

    // ── Item use result handling ─────────────────────────────────────────────
    if (data.type === 'use_item_result' && data.success) {
      reactionSystem.handleResponse({
        type: 'agent_response',
        npcId: '',
        dialogue: '',
        actions: data.actions || [],
        playerStateUpdate: data.playerStateUpdate,
      });

      // Show visual effect for item use
      const itemName: string = data.item ?? '';
      const itemMessage: string = data.message ?? '';
      if (itemName.toLowerCase().includes('health') || itemName.toLowerCase().includes('potion')) {
        uiManager.showItemUseEffect(itemName, 'heal');
        uiManager.addCombatLog(`Used ${itemName}: ${itemMessage}`, '#44ff44');
        if (uiManager.combatHUD.isVisible) {
          uiManager.combatHUD.addLogEntry(`You drink a ${itemName} (+HP)`, '#44ff44');
        }
      } else if (itemName.toLowerCase().includes('mana')) {
        uiManager.showItemUseEffect(itemName, 'mana');
        uiManager.addCombatLog(`Used ${itemName}: ${itemMessage}`, '#44ff44');
        if (uiManager.combatHUD.isVisible) {
          uiManager.combatHUD.addLogEntry(`You drink a ${itemName} (+MP)`, '#4488ff');
        }
      } else if (itemName) {
        uiManager.showItemUseEffect(itemName, 'buff');
        uiManager.addCombatLog(`Used ${itemName}: ${itemMessage}`, '#44ff44');
        if (uiManager.combatHUD.isVisible) {
          uiManager.combatHUD.addLogEntry(`You use ${itemName}`, '#c5a55a');
        }
      }
    }
  };

  // ── Main loop ─────────────────────────────────────────────────────────────
  // Reusable vector for camera direction (avoids per-frame allocation)
  const _camDir = new THREE.Vector3();
  // Cache terrain height callback to avoid creating a closure each frame
  const getTerrainHeight = (x: number, z: number) => terrain.getHeightAt(x, z);

  function animate() {
    requestAnimationFrame(animate);

    const delta = sceneManager.tick();
    const px = playerController.position.x;
    const pz = playerController.position.z;

    // Player (skip movement when dead)
    if (!playerState.isDead) {
      playerController.update(delta);
      player.group.position.copy(playerController.position);
      player.update(delta, playerController.isMoving, playerController.velocity, playerController.isSwimming);
    }

    // Update terrain chunks around the player
    terrain.update(px, pz);

    // Keep effects and water centered on the player
    sceneManager.setPlayerPosition(px, pz);

    // Entities + effects (with distance culling)
    entityManager.setPlayerPosition(px, pz);
    entityManager.update(delta, getTerrainHeight);
    reactionSystem.tick(delta);

    // Update minimap (camera yaw as player direction arrow)
    camera.getWorldDirection(_camDir);
    const playerAngle = Math.atan2(_camDir.x, _camDir.z);
    uiManager.updateMinimap(px, pz, playerAngle);
  }

  animate();

  console.log('World of Promptcraft initialized — WASD to move, click NPCs to interact');
}
