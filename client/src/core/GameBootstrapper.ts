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
import { ZoneTracker } from '../systems/ZoneTracker';
import { ZoneAtmosphere } from '../systems/ZoneAtmosphere';
import { DungeonSystem } from '../systems/DungeonSystem';
import { AssetLoader } from '../utils/asset/AssetLoader';
import { WorldBuilder } from '../systems/WorldBuilder';
import { WorldBuilderPanel } from '../ui/WorldBuilderPanel';
import { getWorldHeightAt } from '../scene/VerticalTerrain';
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

const NPC_CONFIGS = [
  { id: 'dragon_01',   name: 'Ignathar the Ancient',  position: new THREE.Vector3( 120, 15, -80),  color: 0xcc3300 },
  { id: 'merchant_01', name: 'Thornby the Merchant',   position: new THREE.Vector3(   5,  0,   8), color: 0x88aa44 },
  { id: 'sage_01',     name: 'Elyria the Sage',        position: new THREE.Vector3( -40,  5, -30), color: 0x6644cc },
  { id: 'guard_01',    name: 'Captain Aldric',         position: new THREE.Vector3(  15,  0,   2), color: 0x888888 },
  { id: 'healer_01',   name: 'Sister Mira',            position: new THREE.Vector3(  -5,  0,  12), color: 0xeedd88 },
  { id: 'eltito_01',   name: 'El Tito',                position: new THREE.Vector3(-120,  0,-236), color: 0x44cc44 },
  { id: 'mage_01',     name: 'Archmage Malakov',       position: new THREE.Vector3(-155,  0,-240), color: 0xaa44ff },
  { id: 'mage_02',     name: 'Zara the Pyromancer',    position: new THREE.Vector3(-128,  0,-255), color: 0xff4422 },
  { id: 'mage_03',     name: 'Frostweaver Nyx',        position: new THREE.Vector3(-148,  0,-232), color: 0x44ccff },
];

export function bootstrap(
  config: PlayerConfig,
  app: HTMLElement,
  loadingOverlay: LoadingOverlay,
  loginScreen: LoginScreen,
): GameEngine {
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
  for (const cfg of NPC_CONFIGS) {
    cfg.position.y = getWorldHeightAt(terrain, cfg.position.x, cfg.position.z);
    entityManager.addNPC(cfg);
    npcNameMap.set(cfg.id, cfg.name);
  }

  loadingOverlay.setMessage('Preparing collisions...');
  const collisionSystem = new CollisionSystem();
  collisionSystem.initDebug(scene);
  
  // Hardcoded landmarks removed in Tabula Rasa phase. 
  // Future landmarks will be loaded via WorldManifest and WorldBuilder.

  playerController.setCollisionSystem(collisionSystem);

  const interactionSystem = new InteractionSystem(camera, renderer.domElement, entityManager);
  const reactionSystem    = new ReactionSystem(scene, playerState, npcStateStore, worldState, entityManager);

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
  // Exclusion footprints will be provided by WorldManifest in the future.
  worldGenerator.setExclusionFootprints([]);

  const zoneTracker  = new ZoneTracker();
  const dungeonSystem = new DungeonSystem(scene, entityManager, null!, playerState);
  dungeonSystem.setCollisionSystem(collisionSystem);
  dungeonSystem.excludeFromDungeonHide(player.group);
  worldGenerator.setDungeonSystem(dungeonSystem);

  terrain.onChunkLoaded   = (cx, cz, wx, wz) => worldGenerator.onChunkLoaded(cx, cz, wx, wz);
  terrain.onChunkUnloaded = (cx, cz)         => worldGenerator.onChunkUnloaded(cx, cz);

  // eslint-disable-next-line prefer-const
  let engine: GameEngine;

  loadingOverlay.setMessage('Connecting to server...');
  const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocketClient(`${wsProto}://${window.location.host}/ws`);

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
    startIntroCinematic: () => engine.startIntroCinematic(),
    spawnChatBubble,
  });

  // Wire worldBuilderPanel now that ws is available
  const worldBuilderPanel = new WorldBuilderPanel(
    (prompt: string, attachment?: File) => {
      if (!runtime.joinedServer) { worldBuilderPanel.setResponse('Connect to the server first.'); worldBuilderPanel.setReady(); return; }
      const pos = playerController.position;
      // Note: Attachment handling (base64) would go here if implemented on server
      ws.send({ type: 'world_modify', prompt, playerId: runtime.localPlayerId, position: [pos.x, pos.y, pos.z] });
    },
    () => worldBuilder.undo(),
    () => worldBuilder.redo()
  );
  // Patch worldBuilderPanel ref into handler (created after wsHandler to avoid circular dep)
  (wsHandler as unknown as { d: { worldBuilderPanel: WorldBuilderPanel } }).d.worldBuilderPanel = worldBuilderPanel;
  // Wire HUD Build button → WorldBuilderPanel
  uiManager.worldBuilderToggle = () => worldBuilderPanel.toggle();

  // Wire dungeonSystem to ws
  dungeonSystem['ws'] = ws;    // eslint-disable-line @typescript-eslint/dot-notation

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
    if (npc) npc.showAction('thinking', 10);
    ws.send({
      type: 'interaction', npcId: runtime.activeNpcId, prompt, playerId: runtime.localPlayerId,
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
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.code === 'KeyI') uiManager.toggleInventory();
    if (e.code === 'KeyM') uiManager.toggleMinimap();
    if (e.code === 'KeyL') uiManager.toggleQuestLog(playerState);
    if (e.code === 'KeyE') dungeonSystem.tryEnter();
    if (e.code === 'KeyB') worldBuilderPanel.toggle();
    if (e.code === 'Enter' && !uiManager.chatPanel.isFocused) { e.preventDefault(); uiManager.chatPanel.focusInput(); }
    if (e.code === 'Escape' && uiManager.chatPanel.isFocused) e.preventDefault();
  });

  engine = new GameEngine({ // eslint-disable-line prefer-const
    sceneManager, playerController, player, entityManager, collisionSystem,
    interactionSystem, reactionSystem, worldGenerator, zoneTracker, zoneAtmosphere,
    dungeonSystem, uiManager, ws, playerState, npcStateStore, runtime,
  });

  return engine;
}
