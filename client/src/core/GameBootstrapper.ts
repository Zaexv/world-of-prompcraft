import * as THREE from 'three';
import { SceneManager } from '../scene/SceneManager';
import { PlayerController } from '../entities/PlayerController';
import { Player } from '../entities/Player';
import { EntityManager } from '../entities/EntityManager';
import { InteractionSystem } from '../systems/InteractionSystem';
import { ReactionSystem } from '../systems/ReactionSystem';
import { WebSocketClient } from '../network/WebSocketClient';
import { UIManager } from '../ui/UIManager';
import { PlayerState } from '../state/PlayerState';
import { NPCStateStore } from '../state/NPCState';
import { WorldState } from '../state/WorldState';
import { CollisionSystem } from '../systems/CollisionSystem';
import { WorldGenerator } from '../systems/WorldGenerator';
import { WorldManifest } from '../state/WorldManifest';
import { ZoneTracker } from '../systems/ZoneTracker';
import { ZoneAtmosphere } from '../systems/ZoneAtmosphere';
import { DungeonSystem } from '../systems/DungeonSystem';
import { AudioSystem } from '../audio/AudioSystem';
import { AssetLoader } from '../utils/asset/AssetLoader';
import { WorldBuilder } from '../systems/WorldBuilder';
import { WorldBuilderPanel } from '../ui/WorldBuilderPanel';
import { getWorldHeightAt, setWorldManifest as setTerrainManifest } from '../scene/VerticalTerrain';
import { setWorldManifest as setBiomeManifest } from '../scene/Biomes';
import { warmUpTextures } from '../utils/PBRMaps';
import { setWorldManifest as setDungeonManifest } from '../scene/DungeonConfig';
import { GameEngine } from './GameEngine';
import { WebSocketHandler } from './WebSocketHandler';
import { createRuntimeState } from './RuntimeState';
import type { LoginScreen } from '../ui/LoginScreen';

export interface PlayerConfig {
  username: string;
  race: string;
  faction: string;
  skin: string;
}

interface LoadingOverlay {
  setMessage(msg: string): void;
  hide(): void;
}

export function bootstrap(
  config: PlayerConfig,
  app: HTMLElement,
  loadingOverlay: LoadingOverlay,
  loginScreen: LoginScreen,
): GameEngine {
  const worldManifest = new WorldManifest();
  
  // Inject manifest into data-driven environment systems immediately
  setTerrainManifest(worldManifest);
  setBiomeManifest(worldManifest);
  setDungeonManifest(worldManifest);

  loadingOverlay.setMessage('Initializing renderer...');
  const sceneManager = new SceneManager(app);
  const { scene, camera, renderer, terrain } = sceneManager;

  const zoneAtmosphere = new ZoneAtmosphere(
    scene,
    sceneManager.lighting.sun,
    sceneManager.lighting.hemisphere,
    sceneManager.lighting.ambient,
  );

  const playerState = PlayerState.getInstance();
  playerState.race    = config.race;
  playerState.faction = config.faction;
  playerState.skin    = config.skin;
  const npcStateStore = new NPCStateStore();
  const worldState    = new WorldState(playerState, npcStateStore);
  void worldState; // server-authoritative; kept for future use

  const assetLoader = new AssetLoader();

  const runtime = createRuntimeState();

  const playerController = new PlayerController(camera, renderer.domElement, (x, z) => {
    if (runtime.inDungeonOverride) return 0;
    return getWorldHeightAt(terrain, x, z);
  });

  loadingOverlay.setMessage('Loading character skin...');
  const player = Player.create(config.race, config.skin, assetLoader);
  scene.add(player.group);

  loadingOverlay.setMessage('Loading entities...');
  const entityManager = new EntityManager(scene, assetLoader);

  const npcNameMap = new Map<string, string>();
  // NPC spawning removed for Tabula Rasa phase.
  // NPCs will be generated dynamically via WorldManifest and server state.

  loadingOverlay.setMessage('Preparing collisions...');
  const collisionSystem = new CollisionSystem();
  collisionSystem.initDebug(scene);
  
  // Hardcoded landmarks removed in Tabula Rasa phase. 
  // Future landmarks will be loaded via WorldManifest and WorldBuilder.

  playerController.setCollisionSystem(collisionSystem);

  const interactionSystem = new InteractionSystem(camera, renderer.domElement, entityManager);

  const audioSystem = AudioSystem.getInstance();
  audioSystem.init();
  audioSystem.playStartMusic();

  const reactionSystem    = new ReactionSystem(scene, playerState, npcStateStore, worldState, entityManager, audioSystem);

  const worldBuilder = new WorldBuilder(scene, terrain);
  worldBuilder.setCollisionSystem(collisionSystem);
  reactionSystem.setWorldBuilder(worldBuilder);
  reactionSystem.setTerrain(terrain);

  const uiManager = new UIManager();
  uiManager.updateStatusBars(playerState);
  uiManager.inventoryPanel.update(playerState.inventory);
  uiManager.updateQuestUI(playerState);
  playerState.onChange = (state) => {
    uiManager.updateStatusBars(state);
    uiManager.inventoryPanel.update(state.inventory);
    if (uiManager.combatHUD.isVisible) {
      uiManager.combatHUD.updatePlayerHP(state.hp, state.maxHp);
      uiManager.combatHUD.updatePlayerMana(state.mana, state.maxMana);
    }
  };
  uiManager.initBubbleSystem(camera);

  const worldGenerator = new WorldGenerator(scene, terrain, entityManager, null!);
  worldGenerator.setMinimap(uiManager.minimap);
  worldGenerator.setCollisionSystem(collisionSystem);
  worldGenerator.setWorldManifest(worldManifest);
  worldGenerator.setWorldBuilder(worldBuilder);
  // Exclusion footprints will be provided by WorldManifest in the future.
  worldGenerator.setExclusionFootprints([]);

  const zoneTracker  = new ZoneTracker();
  const dungeonSystem = new DungeonSystem(scene, entityManager, null!, playerState);
  dungeonSystem.setCollisionSystem(collisionSystem);
  dungeonSystem.excludeFromDungeonHide(player.group);

  terrain.onChunkLoaded   = (cx, cz, wx, wz) => worldGenerator.onChunkLoaded(cx, cz, wx, wz);
  terrain.onChunkUnloaded = (cx, cz)         => worldGenerator.onChunkUnloaded(cx, cz);

  // Initialize terrain (preloads starting area) AFTER callbacks are wired
  terrain.init();

  // eslint-disable-next-line prefer-const
  let engine: GameEngine;

  loadingOverlay.setMessage('Connecting to server...');
  const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocketClient(`${wsProto}://${window.location.host}/ws`);

  uiManager.minimap.onWaypointClick = (waypoint) => {
    const teleportY = runtime.inDungeonOverride ? 0 : getWorldHeightAt(terrain, waypoint.x, waypoint.z);
    playerController.position.set(waypoint.x, teleportY, waypoint.z);
    player.group.position.copy(playerController.position);
    playerState.position = [waypoint.x, teleportY, waypoint.z];
    if (runtime.joinedServer) {
      ws.send({
        type: 'player_move',
        playerId: runtime.localPlayerId,
        position: [waypoint.x, teleportY, waypoint.z],
        yaw: playerController.yaw,
      });
    }
  };

  const spawnChatBubble = (
    text: string,
    parent?: THREE.Object3D,
    style: 'player' | 'npc' | 'system' = 'player',
    senderName?: string,
  ) => {
    if (!uiManager.bubbleSystem) return;
    const pos = parent ? parent.position.clone() : new THREE.Vector3();
    uiManager.bubbleSystem.spawn(text, pos, { parent, style, senderName });
  };

  const wsHandler = new WebSocketHandler({
    runtime, entityManager, uiManager, playerState, npcStateStore,
    reactionSystem, worldBuilderPanel: null!, playerController, camera, scene,
    loginScreen, loadingOverlay, username: config.username, npcNameMap,
    HOSTILE_NPCS: new Set(['dragon_01', 'guard_01']),
    startIntroCinematic: () => {
      if (engine) engine.startIntroCinematic();
    },
    spawnChatBubble,
  });

  // Wire worldBuilderPanel now that ws is available
  const worldBuilderPanel = new WorldBuilderPanel(
    (prompt: string, _attachment?: File) => {
      if (!runtime.joinedServer) { worldBuilderPanel.setResponse('Connect to the server first.'); worldBuilderPanel.setReady(); return; }
      const pos = playerController.position;
      const nearbyObjects = worldBuilder.getNearbyObjects(pos, 30);
      // Note: Attachment handling (base64) would go here if implemented on server
      ws.send({ 
        type: 'world_modify', 
        prompt, 
        playerId: runtime.localPlayerId, 
        position: [pos.x, pos.y, pos.z],
        nearbyObjects 
      });
    },
    () => worldBuilder.undo(),
    () => worldBuilder.redo()
  );
  // Patch worldBuilderPanel ref into handler (created after wsHandler to avoid circular dep)
  (wsHandler as unknown as { d: { worldBuilderPanel: WorldBuilderPanel } }).d.worldBuilderPanel = worldBuilderPanel;
  // Wire HUD Build button → WorldBuilderPanel
  uiManager.worldBuilderToggle = () => worldBuilderPanel.toggle();

  // Wire dungeonSystem to ws
  dungeonSystem['ws'] = ws;     

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ws.onMessage = (data: any) => wsHandler.handle(data);

  ws.onConnectionChange = (connected: boolean) => {
    if (connected) {
      loadingOverlay.setMessage('Joining world...');
      const initPos: [number, number, number] = [
        playerController.position.x, playerController.position.y, playerController.position.z,
      ];
      ws.send({ type: 'join', username: config.username, race: config.race, faction: config.faction, skin: config.skin, position: initPos });
    } else {
      runtime.joinedServer = false;
    }
  };

  // Chat wiring
  uiManager.chatPanel.onSendMessage = (text: string) => {
    if (!runtime.joinedServer) return;
    ws.send({ type: 'chat_message', text });
    uiManager.chatPanel.addMessage(config.username, text);
    spawnChatBubble(text, player.group, 'player', config.username);
  };

  // Interaction panel prompt wiring
  uiManager.interactionPanel.onSendMessage = (prompt: string) => {
    if (!runtime.activeNpcId || !runtime.joinedServer) return;
    const npc = entityManager.getNPC(runtime.activeNpcId);
    // Optimistic combat: show the hit instantly, before the server round-trip.
    // The authoritative damage/HP follows via the server's npc_actions message.
    if (reactionSystem.isAttackPrompt(prompt)) {
      reactionSystem.previewLocalAttack(runtime.activeNpcId);
    }
    if (npc) npc.showAction('thinking', 10);
    ws.send({
      type: 'interaction',
      npcId: runtime.activeNpcId,
      npcName: npc?.name,
      personalityKey: npc?.personalityKey || undefined,
      prompt,
      playerId: runtime.localPlayerId,
      playerState: {
        position: [playerController.position.x, playerController.position.y, playerController.position.z],
        hp: playerState.hp, inventory: playerState.inventory, equipped: playerState.equipped,
      },
    });
  };

  // Inventory wiring
  uiManager.inventoryPanel.onUseItem = (itemName: string) => {
    if (!runtime.joinedServer) return;
    playerState.removeItem(itemName);
    ws.send({ type: 'use_item', playerId: runtime.localPlayerId, item: itemName, inventory: playerState.inventory });
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

  uiManager.inventoryPanel.onEquipItem = (itemName: string) => {
    if (!runtime.joinedServer) return;
    const slot = playerState.equip(itemName);
    if (slot) {
      uiManager.showItemUseEffect(itemName, 'buff');
      uiManager.addCombatLog(`Equipped ${itemName} [${slot}]`, '#c5a55a');
      if (uiManager.combatHUD.isVisible) uiManager.combatHUD.addLogEntry(`Equipped ${itemName} [${slot}]`, '#c5a55a');
      ws.send({ type: 'equip_item', playerId: runtime.localPlayerId, item: itemName, slot, equipped: playerState.equipped });
    }
  };

  // Keyboard shortcuts
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (e.code === 'KeyM' || key === 'm') {
      uiManager.toggleMinimap();
      return;
    }

    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'KeyI' || key === 'i') uiManager.toggleInventory();
    if (e.code === 'KeyL' || key === 'l') uiManager.toggleQuestLog(playerState);
    if (e.code === 'KeyE' || key === 'e') dungeonSystem.tryEnter();
    if (e.code === 'KeyB' || key === 'b') worldBuilderPanel.toggle();
    if (e.code === 'Enter' && !uiManager.chatPanel.isFocused) { e.preventDefault(); uiManager.chatPanel.focusInput(); }
    if (e.code === 'Escape' && uiManager.chatPanel.isFocused) e.preventDefault();
  }, { capture: true });

  engine = new GameEngine({
    sceneManager, playerController, player, entityManager, collisionSystem,
    interactionSystem, reactionSystem, worldGenerator, worldBuilder, zoneTracker, zoneAtmosphere,
    dungeonSystem, uiManager, ws, playerState, npcStateStore, runtime,
  });

  // Compile every shader program and upload every texture while the loading
  // screen is still visible. Shader compilation on first frustum entry causes
  // the deterministic freeze the player experiences a few meters from spawn.
  renderer.compile(scene, camera);
  warmUpTextures(renderer);

  return engine;
}
