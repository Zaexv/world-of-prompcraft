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
import { ZoneTracker } from './systems/ZoneTracker';
import { DungeonSystem } from './systems/DungeonSystem';

// ── Hostile NPC set (those that trigger the combat HUD) ──────────────────────
const HOSTILE_NPCS = new Set(['dragon_01', 'guard_01']);

// ── Module-level player identity ─────────────────────────────────────────────
let localPlayerId = 'default';
let joinedServer = false;

// ── Login / Title screen ────────────────────────────────────────────────────
const loginScreen = new LoginScreen();
loginScreen.show();

loginScreen.onEnterWorld = (username: string, race: string, faction: string) => {
  initGame(username, race, faction);
};

// ── Game initialisation (runs after "Enter World") ──────────────────────────
function initGame(username: string, race: string, faction: string) {
  // ── Core scene ────────────────────────────────────────────────────────────
  const app = document.getElementById('app')!;
  const sceneManager = new SceneManager(app);
  const { scene, camera, renderer, terrain } = sceneManager;

  // ── State ─────────────────────────────────────────────────────────────────
  const playerState = PlayerState.getInstance();
  playerState.race = race;
  playerState.faction = faction;
  const npcStateStore = new NPCStateStore();
  const worldState = new WorldState(playerState, npcStateStore);

  // ── Player ────────────────────────────────────────────────────────────────
  // Height function — returns dungeon floor when inside a dungeon,
  // otherwise queries the terrain as usual.
  let inDungeonOverride = false;
  const heightFn = (x: number, z: number): number => {
    if (inDungeonOverride) return 0; // Dungeon floor at Y=0 (above water)
    return terrain.getHeightAt(x, z);
  };

  const playerController = new PlayerController(
    camera,
    renderer.domElement,
    heightFn,
  );
  const player = new Player(race);
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
    { id: 'eltito_01', name: 'El Tito', position: new THREE.Vector3(5, 0, -120), color: 0x44cc44 },
    { id: 'mage_01', name: 'Archmage Malakov', position: new THREE.Vector3(-15, 0, -115), color: 0xaa44ff },
    { id: 'mage_02', name: 'Zara the Pyromancer', position: new THREE.Vector3(12, 0, -130), color: 0xff4422 },
    { id: 'mage_03', name: 'Frostweaver Nyx', position: new THREE.Vector3(-10, 0, -105), color: 0x44ccff },
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

  // ── Collision (AABB-based) ───────────────────────────────────────────────
  const collisionSystem = new CollisionSystem();

  // Buildings (static — AABB cached once)
  collisionSystem.addCollidables(sceneManager.buildings.groups);

  // Fort Malaka structures (static)
  collisionSystem.addCollidables(sceneManager.fortMalaka.groups);

  // Massive trees (static)
  if (sceneManager.vegetation.massiveTreeGroups.length > 0) {
    collisionSystem.addCollidables(sceneManager.vegetation.massiveTreeGroups);
  }

  // NPC meshes — dynamic source so newly spawned NPCs are always collidable
  collisionSystem.setDynamicSource(() => entityManager.getMeshes());

  playerController.setCollisionSystem(collisionSystem, scene);

  // ── Systems ───────────────────────────────────────────────────────────────
  const interactionSystem = new InteractionSystem(camera, renderer.domElement, entityManager);
  const reactionSystem = new ReactionSystem(scene, playerState, npcStateStore, worldState, entityManager);

  // ── UI ────────────────────────────────────────────────────────────────────
  const uiManager = new UIManager();
  uiManager.updateStatusBars(playerState);
  uiManager.inventoryPanel.update(playerState.inventory);
  uiManager.updateQuestUI(playerState);

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

  // ── Chat bubbles ──────────────────────────────────────────────────────────
  uiManager.initBubbleSystem(camera);

  function spawnChatBubble(text: string, parent?: THREE.Object3D, style: 'player' | 'npc' | 'system' = 'player', senderName?: string): void {
    if (!uiManager.bubbleSystem) return;
    const pos = parent ? parent.position.clone() : new THREE.Vector3();
    uiManager.bubbleSystem.spawn(text, pos, { parent, style, senderName });
  }

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

    if (e.code === "KeyL") {
      uiManager.toggleQuestLog(playerState);
    }

    if (e.code === "KeyE") {
      dungeonSystem.tryEnter();
    }

    // Enter to focus chat (if not already focused)
    if (e.code === "Enter" && !uiManager.chatPanel.isFocused) {
      e.preventDefault();
      uiManager.chatPanel.focusInput();
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }

    // Escape in chat to blur and re-acquire pointer lock
    if (e.code === "Escape" && uiManager.chatPanel.isFocused) {
      e.preventDefault();
      // The ChatPanel input handles blur internally, but also re-acquire lock
      renderer.domElement.requestPointerLock();
    }
  });

  uiManager.inventoryPanel.onClose = () => {
    renderer.domElement.requestPointerLock();
  };

  // ── Network ───────────────────────────────────────────────────────────────
  const wsHost = window.location.hostname || 'localhost';
  const ws = new WebSocketClient(`ws://${wsHost}:8000/ws`);

  ws.onConnectionChange = (connected) => {
    console.warn(`WebSocket ${connected ? 'connected' : 'disconnected'}`);
    if (connected) {
      // BUG-3: Send initial position in join so other players see correct spawn
      const initPos: [number, number, number] = [
        playerController.position.x,
        playerController.position.y,
        playerController.position.z,
      ];
      ws.send({ type: 'join', username, race, faction, position: initPos });
    } else {
      // Reset join flag on disconnect so player_move is not sent on the new
      // WebSocket before the server re-registers us via a fresh join handshake.
      joinedServer = false;
    }
  };

  // ── Chat wiring ──────────────────────────────────────────────────────────
  uiManager.chatPanel.onSendMessage = (text: string) => {
    if (!joinedServer) return;
    ws.send({ type: 'chat_message', text });
    // Show own message in chat panel
    uiManager.chatPanel.addMessage(username, text);
    // Spawn bubble above local player (follows player group)
    spawnChatBubble(text, player.group, 'player', username);
  };

  // ── Inventory use-item wiring (must be after ws is created) ──────────────
  uiManager.inventoryPanel.onUseItem = (itemName: string) => {
    if (!joinedServer) return;
    console.warn(`[Inventory] Used item: ${itemName}`);

    // Immediately remove the item from client inventory so the UI updates
    playerState.removeItem(itemName);

    // Send current inventory so the server can sync its stale copy
    ws.send({
      type: 'use_item',
      playerId: localPlayerId,
      item: itemName,
      inventory: playerState.inventory,
    });

    // Show immediate visual feedback
    const lower = itemName.toLowerCase();
    if (/health|heal|potion/i.test(lower)) {
      uiManager.showItemUseEffect(itemName, 'heal');
    } else if (/mana|elixir/i.test(lower)) {
      uiManager.showItemUseEffect(itemName, 'mana');
    } else {
      uiManager.showItemUseEffect(itemName, 'buff');
    }
    uiManager.addCombatLog(`Used ${itemName}`, '#c5a55a');
  };

  // ── Equipment wiring ──────────────────────────────────────────────────
  uiManager.inventoryPanel.onEquipItem = (itemName: string) => {
    if (!joinedServer) return;
    const slot = playerState.equip(itemName);
    if (slot) {
      uiManager.showItemUseEffect(itemName, 'buff');
      uiManager.addCombatLog(`Equipped ${itemName} [${slot}]`, '#c5a55a');
      if (uiManager.combatHUD.isVisible) {
        uiManager.combatHUD.addLogEntry(`Equipped ${itemName} [${slot}]`, '#c5a55a');
      }
      // Tell the server about the equipment change
      ws.send({
        type: 'equip_item',
        playerId: localPlayerId,
        item: itemName,
        slot,
        equipped: playerState.equipped,
      });
    }
  };

  // ── World Generator (spawns trees, caves, towns & NPCs on new chunks) ──
  const worldGenerator = new WorldGenerator(scene, terrain, entityManager, ws);
  worldGenerator.setMinimap(uiManager.minimap);
  worldGenerator.setCollisionSystem(collisionSystem);
  terrain.onChunkLoaded = (cx, cz, wx, wz) => worldGenerator.onChunkLoaded(cx, cz, wx, wz);
  terrain.onChunkUnloaded = (cx, cz) => worldGenerator.onChunkUnloaded(cx, cz);

  // ── Zone Tracker & Dungeon System ──────────────────────────────────────
  const zoneTracker = new ZoneTracker();
  const dungeonSystem = new DungeonSystem(scene, entityManager, ws, playerState);
  dungeonSystem.setCollisionSystem(collisionSystem);
  dungeonSystem.excludeFromDungeonHide(player.group);
  worldGenerator.setDungeonSystem(dungeonSystem);

  // Zone display callback
  zoneTracker.onZoneChange = (name, desc) => {
    uiManager.showZoneTransition(name, desc);
  };

  // Dungeon zone override + player teleport
  dungeonSystem.onEnterDungeon = (_id, name) => {
    inDungeonOverride = true;
    zoneTracker.forceZone(name, `Dungeon: ${name}`);
    // Teleport player to dungeon center
    playerController.position.set(0, 0, 5);
  };
  dungeonSystem.onExitDungeon = () => {
    inDungeonOverride = false;
    // Restore player to entrance position
    const saved = dungeonSystem.getSavedPlayerPosition();
    if (saved) {
      playerController.position.copy(saved);
      playerController.position.y = terrain.getHeightAt(saved.x, saved.z);
    }
  };

  // Quest UI reactivity
  playerState.onQuestChange = () => {
    uiManager.updateQuestUI(playerState);
  };

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
    if (!activeNpcId || !joinedServer) return;

    // Show "thinking" icon above the NPC while waiting for response
    const npc = entityManager.getNPC(activeNpcId);
    if (npc) npc.showAction('thinking', 10);

    // Note: InteractionPanel already adds the player message and shows thinking indicator
    ws.send({
      type: 'interaction',
      npcId: activeNpcId,
      prompt,
      playerId: localPlayerId,
      playerState: {
        position: [playerController.position.x, playerController.position.y, playerController.position.z],
        hp: playerState.hp,
        inventory: playerState.inventory,
        equipped: playerState.equipped,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.onMessage = (data: any) => {
    // ── Join OK ────────────────────────────────────────────────────────────
    if (data.type === 'join_ok') {
      localPlayerId = data.playerId;
      joinedServer = true; // BUG-1: Now safe to send player_move
      playerState.playerId = data.playerId;
      loginScreen.hide();
      uiManager.chatPanel.addSystemMessage(`Welcome to World of Promptcraft, ${username}!`);

      // Spawn existing players
      if (data.players) {
        for (const p of data.players) {
          if (p.playerId !== localPlayerId) {
            entityManager.addRemotePlayer(p);
          }
        }
      }
      return;
    }

    // ── Join Error ─────────────────────────────────────────────────────────
    if (data.type === 'join_error') {
      loginScreen.showError(data.message);
      return;
    }

    // ── Player Joined ─────────────────────────────────────────────────────
    if (data.type === 'player_joined') {
      if (data.player.playerId !== localPlayerId) {
        entityManager.addRemotePlayer(data.player);
        uiManager.chatPanel.addSystemMessage(`${data.player.username} has joined the world.`);
      }
      return;
    }

    // ── Player Left ───────────────────────────────────────────────────────
    if (data.type === 'player_left') {
      const remote = entityManager.getRemotePlayer(data.playerId);
      const leftName = remote?.username ?? data.playerId;
      entityManager.removeRemotePlayer(data.playerId);
      uiManager.chatPanel.addSystemMessage(`${leftName} has left the world.`);
      return;
    }

    // ── World Update (position broadcasting) ──────────────────────────────
    if (data.type === 'world_update') {
      // Filter out local player from updates
      const others = data.players.filter(
        (p: { playerId: string }) => p.playerId !== localPlayerId,
      );
      entityManager.updateRemotePlayers(others);
      return;
    }

    // ── Chat Broadcast ────────────────────────────────────────────────────
    if (data.type === 'chat_broadcast') {
      uiManager.chatPanel.addMessage(data.sender, data.text);
      // BUG-5: Use remote player group if available, otherwise fall back
      // to a temporary object at the broadcast position
      const remote = entityManager.getRemotePlayer(data.sender);
      if (remote) {
        spawnChatBubble(data.text, remote.group, 'player', data.sender);
      } else if (data.position) {
        const pos = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
        const tmpObj = new THREE.Object3D();
        tmpObj.position.copy(pos);
        scene.add(tmpObj);
        spawnChatBubble(data.text, tmpObj, 'player', data.sender);
        // Clean up temporary object after bubble lifetime
        setTimeout(() => scene.remove(tmpObj), 8000);
      } else {
        spawnChatBubble(data.text, undefined, 'player', data.sender);
      }
      return;
    }

    // ── NPC Dialogue Broadcasting ─────────────────────────────────────────
    if (data.type === 'npc_dialogue') {
      if (data.npcName) {
        // NPC speaking — follow NPC mesh
        uiManager.chatPanel.addMessage(data.npcName, data.dialogue, '#c5a55a');
        const npc = entityManager.getNPC(data.npcId);
        spawnChatBubble(data.dialogue, npc?.mesh, 'npc', data.npcName);
      } else {
        // Player speaking to NPC — follow remote player
        uiManager.chatPanel.addMessage(data.speakerPlayer, data.dialogue);
        const remote = entityManager.getRemotePlayer(data.speakerPlayer);
        spawnChatBubble(data.dialogue, remote?.group, 'player', data.speakerPlayer);
      }
      return;
    }

    // ── NPC Actions Broadcasting (combat/movement sync for bystanders) ───
    if (data.type === 'npc_actions') {
      reactionSystem.handleResponse({
        type: 'agent_response',
        npcId: data.npcId,
        dialogue: '',
        actions: data.actions ?? [],
        npcStateUpdate: data.npcStateUpdate ?? undefined,
        playerStateUpdate: undefined,
      } as AgentResponse);
      return;
    }

    // ── Server Error ──────────────────────────────────────────────────────
    if (data.type === 'error') {
      const errorMsg: string = data.message ?? 'An unknown error occurred.';
      console.warn(`[Server Error] ${errorMsg}`);

      // If the interaction panel is open, show the error there and clear thinking state
      if (activeNpcId) {
        uiManager.interactionPanel.hideThinking();
        uiManager.interactionPanel.addMessage('system', `Error: ${errorMsg}`);
      }

      // Also surface in the chat panel so the player always sees it
      uiManager.chatPanel.addSystemMessage(`Server error: ${errorMsg}`);
      return;
    }

    // ── Agent Response ────────────────────────────────────────────────────
    if (data.type === 'agent_response') {
      const response = data as AgentResponse;

      // Check if this response is for the currently active NPC
      const isActiveNpc = response.npcId === activeNpcId;

      // UI updates only if the response matches the active NPC panel
      if (isActiveNpc) {
        uiManager.interactionPanel.hideThinking();
        uiManager.interactionPanel.addMessage('npc', response.dialogue);
      }

      // Hide the thinking icon — action icons will be shown per-action by ReactionSystem
      const respondingNpc = entityManager.getNPC(response.npcId);
      if (respondingNpc) {
        respondingNpc.actionIcon.hide();
        // Spawn chat bubble above the NPC (follows NPC mesh)
        spawnChatBubble(response.dialogue, respondingNpc.mesh, 'npc');
      }

      // All NPC dialogue goes to the unified ChatPanel
      const chatNpcName = npcNameMap.get(response.npcId) ?? entityManager.getNPC(response.npcId)?.name ?? response.npcId;
      uiManager.chatPanel.addMessage(chatNpcName, response.dialogue, '#c5a55a');

      reactionSystem.handleResponse(response);

      // ── Combat HUD updates (only for active NPC) ────────────────────────
      if (isActiveNpc && uiManager.combatHUD.isVisible) {
        uiManager.combatHUD.updatePlayerHP(playerState.hp, playerState.maxHp);
        uiManager.combatHUD.updatePlayerMana(playerState.mana, playerState.maxMana);

        if (response.npcStateUpdate) {
          uiManager.combatHUD.updateNpcHP(
            response.npcStateUpdate.hp ?? 100,
            response.npcStateUpdate.maxHp ?? 100,
          );
        }
      }

      // ── Update InteractionPanel mood/relationship for active NPC ────────
      if (isActiveNpc && response.npcStateUpdate) {
        const mood = response.npcStateUpdate.mood ?? 'neutral';
        const relScore = response.npcStateUpdate.relationship_score ?? 0;
        uiManager.interactionPanel.updateMoodStatus(mood, relScore);
      }

      // ── Combat log entries for each action (always visible) ────────────
      const npcName = npcNameMap.get(response.npcId) ?? entityManager.getNPC(response.npcId)?.name ?? response.npcId;

      // Log to CombatHUD when visible, otherwise to global CombatLog (never both)
      const logCombat = (msg: string, color: string) => {
        if (uiManager.combatHUD.isVisible) {
          uiManager.combatHUD.addLogEntry(msg, color);
        } else {
          uiManager.addCombatLog(msg, color);
        }
      };

      for (const action of response.actions) {
        if (action.kind === 'damage') {
          const target = action.params.target ?? 'player';
          const amount = action.params.amount ?? 0;
          const damageType = action.params.damageType ?? 'physical';

          if (target === 'player') {
            logCombat(`${npcName} deals ${amount} ${damageType} damage!`, '#ff4444');
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
            logCombat(`You strike ${npcName} for ${amount} damage!`, '#ffffff');
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
          logCombat(`Healed for ${amount} HP`, '#44ff44');
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
          logCombat(`Received: ${item}`, '#c5a55a');
        } else if (action.kind === 'start_quest' || action.kind === 'complete_quest') {
          const quest = action.params.quest ?? action.params.name ?? 'Unknown Quest';
          const prefix = action.kind === 'start_quest' ? 'Quest Started' : 'Quest Complete';
          logCombat(`${prefix}: ${quest}`, '#c5a55a');
        } else if (action.kind === 'advance_objective') {
          const desc = action.params.description ?? action.params.objectiveId ?? 'objective';
          logCombat(`Objective Complete: ${desc}`, '#c5a55a');
        } else if (action.kind === 'emote') {
          const animation = action.params.animation ?? action.params.emote ?? 'gesture';
          logCombat(`${npcName} performs ${animation}`, '#aaaaaa');
        }
      }
    }

    // ── Quest update handling (dungeon_enter/exit responses) ───────────────
    if (data.type === 'quest_update') {
      reactionSystem.handleResponse({
        type: 'agent_response',
        npcId: '',
        dialogue: '',
        actions: data.actions || [],
        playerStateUpdate: data.playerStateUpdate,
      });
    }

    // ── Item use result handling ─────────────────────────────────────────────
    if (data.type === 'use_item_result' && data.success) {
      // Process server actions (heal, spawn_effect, etc.) but strip
      // inventory from playerStateUpdate — we already removed the item
      // client-side for instant feedback. Only sync non-inventory fields
      // like level, mana, maxHp.
      const serverUpdate = data.playerStateUpdate;
      const safeUpdate = serverUpdate ? { ...serverUpdate } : undefined;
      if (safeUpdate) {
        delete safeUpdate.inventory; // don't overwrite client inventory
      }

      reactionSystem.handleResponse({
        type: 'agent_response',
        npcId: '',
        dialogue: '',
        actions: data.actions || [],
        playerStateUpdate: safeUpdate,
      });

      // Log the server's message (visual effect already shown immediately on click)
      const itemName: string = data.item ?? '';
      const itemMessage: string = data.message ?? '';
      if (itemMessage && itemName) {
        uiManager.addCombatLog(itemMessage, '#44ff44');
        if (uiManager.combatHUD.isVisible) {
          uiManager.combatHUD.addLogEntry(itemMessage, '#44ff44');
        }
      }
    }
  };

  // ── Main loop ─────────────────────────────────────────────────────────────
  // Reusable vector for camera direction (avoids per-frame allocation)
  const _camDir = new THREE.Vector3();
  // Cache terrain height callback to avoid creating a closure each frame
  const getTerrainHeight = (x: number, z: number) => terrain.getHeightAt(x, z);

  // Position broadcast timer (10Hz)
  let moveSendTimer = 0;
  const MOVE_SEND_INTERVAL = 1 / 10; // 100ms

  function animate() {
    requestAnimationFrame(animate);

    const delta = sceneManager.tick();

    // Player (skip movement when dead)
    if (!playerState.isDead) {
      playerController.update(delta);
      player.group.position.copy(playerController.position);
      player.update(delta, playerController.isMoving, playerController.velocity, playerController.isSwimming);

      // Sync position to playerState
      playerState.position = [playerController.position.x, playerController.position.y, playerController.position.z];
    }

    // Capture position AFTER playerController.update so all systems use current-frame data
    const px = playerController.position.x;
    const pz = playerController.position.z;

    // Update terrain chunks around the player
    terrain.update(px, pz);

    // Keep effects and water centered on the player
    sceneManager.setPlayerPosition(px, pz);

    // Entities + effects (with distance culling)
    entityManager.setPlayerPosition(px, pz);
    entityManager.update(delta, getTerrainHeight);
    reactionSystem.tick(delta);

    // Zone tracking & dungeon proximity
    zoneTracker.update(px, pz);
    dungeonSystem.setPlayerPosition(playerController.position);
    dungeonSystem.update(player.group.position);

    // Update minimap (camera yaw as player direction arrow)
    camera.getWorldDirection(_camDir);
    const playerAngle = Math.atan2(_camDir.x, _camDir.z);
    uiManager.updateMinimap(px, pz, playerAngle);

    // Update chat bubbles
    uiManager.bubbleSystem?.update();

    // BUG-1: Only send position after join_ok has been received
    if (joinedServer) {
      moveSendTimer += delta;
      if (moveSendTimer >= MOVE_SEND_INTERVAL) {
        moveSendTimer = 0;
        ws.send({
          type: 'player_move',
          position: [playerController.position.x, playerController.position.y, playerController.position.z],
          yaw: playerController.yaw,
        });
      }
    }
  }

  animate();

  console.warn('World of Promptcraft initialized — WASD to move, click NPCs to interact');
}
