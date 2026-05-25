import * as THREE from 'three';
// Config will be used gradually as systems migrate to centralized constants
// import { GameConfig, AssetPaths, UIConfig, NetworkConfig } from './config';
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
import { ZoneAtmosphere } from './systems/ZoneAtmosphere';
import { DungeonSystem } from './systems/DungeonSystem';
import { AssetLoader } from './utils/AssetLoader';
import { getWorldHeightAt } from './scene/VerticalTerrain';
import { WorldBuilder } from './systems/WorldBuilder';
import { WorldBuilderPanel } from './ui/WorldBuilderPanel';

// ── Hostile NPC set (those that trigger the combat HUD) ──────────────────────
const HOSTILE_NPCS = new Set(['dragon_01', 'guard_01']);

// ── Module-level player identity ─────────────────────────────────────────────
let localPlayerId = 'default';
let joinedServer = false;

interface LoadingOverlayController {
  setMessage(message: string): void;
  hide(): void;
}

function createLoadingOverlay(container: HTMLElement): LoadingOverlayController {
  const overlay = document.createElement('div');
  overlay.style.position = 'absolute';
  overlay.style.inset = '0';
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.gap = '14px';
  overlay.style.background = 'radial-gradient(circle at center, rgba(12,16,28,0.92), rgba(4,6,12,0.98))';
  overlay.style.backdropFilter = 'blur(2px)';
  overlay.style.color = '#c8d6ff';
  overlay.style.fontFamily = 'system-ui, sans-serif';
  overlay.style.fontSize = '16px';
  overlay.style.zIndex = '9999';

  const spinner = document.createElement('div');
  spinner.style.width = '28px';
  spinner.style.height = '28px';
  spinner.style.border = '3px solid rgba(160, 184, 255, 0.2)';
  spinner.style.borderTopColor = '#9fb9ff';
  spinner.style.borderRadius = '50%';
  spinner.style.animation = 'promptcraft-spin 0.85s linear infinite';

  const message = document.createElement('div');
  message.textContent = 'Loading world...';
  message.style.letterSpacing = '0.3px';

  const style = document.createElement('style');
  style.textContent = `
    @keyframes promptcraft-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  overlay.appendChild(spinner);
  overlay.appendChild(message);
  container.appendChild(overlay);

  return {
    setMessage(nextMessage: string) {
      message.textContent = nextMessage;
    },
    hide() {
      overlay.remove();
    },
  };
}

function createArcaneMouseVfx(): void {
  if (document.getElementById('promptcraft-game-cursor')) return;

  const style = document.createElement('style');
  style.id = 'promptcraft-hide-system-cursor';
  style.textContent = `
    html, body, #app, #app * { cursor: none !important; }
    @keyframes promptcraft-thunder-flicker {
      0%, 100% { opacity: 0.14; transform: scaleY(0.78); }
      28% { opacity: 0.86; transform: scaleY(1.08); }
      62% { opacity: 0.46; transform: scaleY(0.9); }
    }
  `;
  document.head.appendChild(style);

  const cursor = document.createElement('div');
  cursor.id = 'promptcraft-game-cursor';
  cursor.style.position = 'fixed';
  cursor.style.left = '-100px';
  cursor.style.top = '-100px';
  cursor.style.width = '22px';
  cursor.style.height = '30px';
  cursor.style.pointerEvents = 'none';
  cursor.style.zIndex = '2147483647';
  cursor.style.opacity = '0';
  cursor.style.transform = 'translate(-20%, -6%)';
  cursor.style.willChange = 'transform, left, top, opacity';

  const pointer = document.createElement('div');
  pointer.style.position = 'absolute';
  pointer.style.inset = '0';
  pointer.style.clipPath = 'polygon(0 0, 0 100%, 31% 72%, 45% 100%, 59% 93%, 45% 64%, 100% 64%)';
  pointer.style.background = 'linear-gradient(150deg, #cfdcff 0%, #7fa4ef 40%, #40559b 100%)';
  pointer.style.border = '1px solid rgba(10, 14, 30, 0.96)';
  pointer.style.boxShadow = '0 0 8px rgba(92, 136, 240, 0.5), 0 0 16px rgba(77, 48, 140, 0.4)';

  const pointerInner = document.createElement('div');
  pointerInner.style.position = 'absolute';
  pointerInner.style.inset = '2px 3px 3px 2px';
  pointerInner.style.clipPath = 'polygon(0 0, 0 100%, 30% 72%, 45% 100%, 56% 93%, 43% 63%, 100% 63%)';
  pointerInner.style.background = 'linear-gradient(152deg, rgba(236,242,255,0.95) 0%, rgba(146,182,250,0.9) 48%, rgba(74,102,188,0.65) 100%)';
  pointerInner.style.filter = 'drop-shadow(0 0 2px rgba(160, 195, 255, 0.55))';

  const pointerSpine = document.createElement('div');
  pointerSpine.style.position = 'absolute';
  pointerSpine.style.left = '7px';
  pointerSpine.style.top = '5px';
  pointerSpine.style.width = '1px';
  pointerSpine.style.height = '12px';
  pointerSpine.style.background = 'linear-gradient(to bottom, rgba(255,255,255,0.9), rgba(188,208,255,0.1))';

  const boltA = document.createElement('div');
  boltA.style.position = 'absolute';
  boltA.style.left = '5px';
  boltA.style.top = '-3px';
  boltA.style.width = '2px';
  boltA.style.height = '20px';
  boltA.style.background = 'linear-gradient(to bottom, rgba(170,186,255,0), rgba(170,186,255,0.9), rgba(98,124,231,0))';
  boltA.style.filter = 'drop-shadow(0 0 3px rgba(122, 144, 255, 0.72))';
  boltA.style.animation = 'promptcraft-thunder-flicker 165ms steps(2, end) infinite';
  boltA.style.transformOrigin = 'top center';

  const boltB = document.createElement('div');
  boltB.style.position = 'absolute';
  boltB.style.left = '11px';
  boltB.style.top = '5px';
  boltB.style.width = '2px';
  boltB.style.height = '15px';
  boltB.style.background = 'linear-gradient(to bottom, rgba(163,175,255,0), rgba(151,181,255,0.86), rgba(84,110,209,0))';
  boltB.style.filter = 'drop-shadow(0 0 3px rgba(102, 138, 255, 0.64))';
  boltB.style.animation = 'promptcraft-thunder-flicker 220ms steps(2, end) infinite';
  boltB.style.animationDelay = '60ms';
  boltB.style.transformOrigin = 'top center';

  cursor.appendChild(pointer);
  cursor.appendChild(pointerInner);
  cursor.appendChild(pointerSpine);
  cursor.appendChild(boltA);
  cursor.appendChild(boltB);
  document.body.appendChild(cursor);

  let x = -100;
  let y = -100;
  let hiddenByMouseLook = false;

  const showCursor = () => {
    cursor.style.opacity = '1';
  };
  const hideCursor = () => {
    cursor.style.opacity = '0';
  };

  window.addEventListener('mousemove', (e: MouseEvent) => {
    x = e.clientX;
    y = e.clientY;
    if (hiddenByMouseLook) return;
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    const tilt = Math.max(-14, Math.min(14, e.movementX * 0.7));
    cursor.style.transform = `translate(-20%, -6%) rotate(${tilt}deg)`;
    showCursor();
  });

  window.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button === 0 || e.button === 2) {
      hiddenByMouseLook = true;
      hideCursor();
    }
  });

  window.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 0 || e.button === 2) {
      hiddenByMouseLook = false;
      cursor.style.left = `${x}px`;
      cursor.style.top = `${y}px`;
      showCursor();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement !== null;
    hiddenByMouseLook = locked;
    if (locked) {
      hideCursor();
      return;
    }
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    showCursor();
  });

  window.addEventListener('mouseleave', () => {
    hideCursor();
  });
}

// ── Login / Title screen ────────────────────────────────────────────────────
const loginScreen = new LoginScreen();
loginScreen.show();

loginScreen.onEnterWorld = (username: string, race: string, faction: string, skin: string) => {
  void initGame(username, race, faction, skin);
};

// ── Game initialisation (runs after "Enter World") ──────────────────────────
async function initGame(username: string, race: string, faction: string, skin: string): Promise<void> {
  // ── Core scene ────────────────────────────────────────────────────────────
  const app = document.getElementById('app')!;
  const loadingOverlay = createLoadingOverlay(app);
  loadingOverlay.setMessage('Initializing renderer...');
  const sceneManager = new SceneManager(app);
  const { scene, camera, renderer, terrain } = sceneManager;
  createArcaneMouseVfx();

  // ── Zone atmosphere (fog + lighting transitions) ──────────────────────────
  const zoneAtmosphere = new ZoneAtmosphere(
    scene,
    sceneManager.lighting.sun,
    sceneManager.lighting.hemisphere,
    sceneManager.lighting.ambient,
  );

  // ── State ─────────────────────────────────────────────────────────────────
  const playerState = PlayerState.getInstance();
  playerState.race = race;
  playerState.faction = faction;
  playerState.skin = skin;
  const npcStateStore = new NPCStateStore();
  const worldState = new WorldState(playerState, npcStateStore);

  // ── Player ────────────────────────────────────────────────────────────────
  const assetLoader = new AssetLoader();

  // Height function — returns dungeon floor when inside a dungeon,
  // otherwise queries the terrain as usual.
  let inDungeonOverride = false;
  const heightFn = (x: number, z: number): number => {
    if (inDungeonOverride) return 0; // Dungeon floor at Y=0 (above water)
    return getWorldHeightAt(terrain, x, z);
  };

  const playerController = new PlayerController(
    camera,
    renderer.domElement,
    heightFn,
  );
  loadingOverlay.setMessage('Loading character skin...');
  const player = await Player.create(race, skin, assetLoader);
  scene.add(player.group);

  // ── Intro cinematic (POC) ────────────────────────────────────────────────
  const INTRO_CINEMATIC_DURATION_SEC = 8;
  let introCinematicActive = false;
  let introCinematicHasPlayed = false;
  let introCinematicStartMs = 0;
  let introOverlay: HTMLDivElement | null = null;
  const introStart = new THREE.Vector3();
  const introEnd = new THREE.Vector3();
  const introCameraPos = new THREE.Vector3();
  const introLookAt = new THREE.Vector3();
  let removeIntroSkipHandlers: (() => void) | null = null;

  const stopIntroCinematic = () => {
    introCinematicActive = false;
    if (removeIntroSkipHandlers) {
      removeIntroSkipHandlers();
      removeIntroSkipHandlers = null;
    }
    introOverlay?.remove();
    introOverlay = null;
  };

  const updateIntroCinematic = () => {
    if (!introCinematicActive) return;

    const elapsedSec = (performance.now() - introCinematicStartMs) / 1000;
    const t = Math.min(elapsedSec / INTRO_CINEMATIC_DURATION_SEC, 1);
    const eased = 1 - Math.pow(1 - t, 3);

    const baseX = THREE.MathUtils.lerp(introStart.x, introEnd.x, eased);
    const baseY = THREE.MathUtils.lerp(introStart.y, introEnd.y, eased);
    const baseZ = THREE.MathUtils.lerp(introStart.z, introEnd.z, eased);
    const orbitRadius = THREE.MathUtils.lerp(18, 4, eased);
    const orbitAngle = eased * Math.PI * 1.5;

    introCameraPos.set(
      baseX + Math.cos(orbitAngle) * orbitRadius,
      baseY + Math.sin(eased * Math.PI) * 4,
      baseZ + Math.sin(orbitAngle) * orbitRadius,
    );
    camera.position.copy(introCameraPos);

    introLookAt.set(
      playerController.position.x,
      playerController.position.y + 2,
      playerController.position.z,
    );
    camera.lookAt(introLookAt);

    if (t >= 1) {
      stopIntroCinematic();
    }
  };

  const startIntroCinematic = () => {
    if (introCinematicHasPlayed) return;
    introCinematicHasPlayed = true;
    introCinematicActive = true;
    introCinematicStartMs = performance.now();

    introStart.set(
      playerController.position.x + 70,
      playerController.position.y + 38,
      playerController.position.z + 60,
    );
    introEnd.set(
      playerController.position.x + 16,
      playerController.position.y + 14,
      playerController.position.z + 20,
    );

    const appRoot = document.getElementById('app');
    if (appRoot) {
      introOverlay = document.createElement('div');
      Object.assign(introOverlay.style, {
        position: 'absolute',
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        padding: '8px 14px',
        borderRadius: '999px',
        fontFamily: "'Cinzel', Georgia, serif",
        fontSize: '12px',
        letterSpacing: '0.08em',
        color: '#d6dfef',
        background: 'rgba(8, 12, 22, 0.62)',
        border: '1px solid rgba(133, 163, 227, 0.45)',
        textShadow: '0 0 8px rgba(120,160,255,0.35)',
        zIndex: '10001',
        pointerEvents: 'none',
      } as CSSStyleDeclaration);
      introOverlay.textContent = 'Cinematic intro • click or press Space to skip';
      appRoot.appendChild(introOverlay);
    }

    const skip = () => stopIntroCinematic();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') {
        skip();
      }
    };
    const onPointerDown = () => skip();
    window.addEventListener('keydown', onKeyDown);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    removeIntroSkipHandlers = () => {
      window.removeEventListener('keydown', onKeyDown);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    };
  };

  // ── NPCs ──────────────────────────────────────────────────────────────────
  loadingOverlay.setMessage('Loading entities...');
  const entityManager = new EntityManager(scene, assetLoader);

  // Mirror the backend NPC definitions (positions match server/src/world/npc_definitions.py)
  const NPC_CONFIGS = [
    { id: 'dragon_01', name: 'Ignathar the Ancient', position: new THREE.Vector3(120, 15, -80), color: 0xcc3300 },
    { id: 'merchant_01', name: 'Thornby the Merchant', position: new THREE.Vector3(5, 0, 8), color: 0x88aa44 },
    { id: 'sage_01', name: 'Elyria the Sage', position: new THREE.Vector3(-40, 5, -30), color: 0x6644cc },
    { id: 'guard_01', name: 'Captain Aldric', position: new THREE.Vector3(15, 0, 2), color: 0x888888 },
    { id: 'healer_01', name: 'Sister Mira', position: new THREE.Vector3(-5, 0, 12), color: 0xeedd88 },
    { id: 'eltito_01', name: 'El Tito', position: new THREE.Vector3(-120, 0, -236), color: 0x44cc44 },
    { id: 'mage_01', name: 'Archmage Malakov', position: new THREE.Vector3(-155, 0, -240), color: 0xaa44ff },
    { id: 'mage_02', name: 'Zara the Pyromancer', position: new THREE.Vector3(-128, 0, -255), color: 0xff4422 },
    { id: 'mage_03', name: 'Frostweaver Nyx', position: new THREE.Vector3(-148, 0, -232), color: 0x44ccff },
  ];

  // Build a quick id->name lookup
  const npcNameMap = new Map<string, string>();
  for (const cfg of NPC_CONFIGS) {
    npcNameMap.set(cfg.id, cfg.name);
  }

  // Load all NPCs in parallel — falls back to procedural mesh if GLTF is missing
  await Promise.all(
    NPC_CONFIGS.map(async (cfg) => {
      cfg.position.y = getWorldHeightAt(terrain, cfg.position.x, cfg.position.z);
      await entityManager.addNPC(cfg);
    }),
  );

  // ── Collision (AABB-based) ───────────────────────────────────────────────
  loadingOverlay.setMessage('Preparing collisions...');
  const collisionSystem = new CollisionSystem();

  // Buildings (static — filtered to solid structural elements only)
  collisionSystem.addCollidablesFiltered(sceneManager.buildings.groups);

  // Fort Malaka structures (static — filtered to solid elements only)
  collisionSystem.addCollidablesFiltered(sceneManager.fortMalaka.groups);

  // Massive trees (static — filtered to trunk/roots only)
  if (sceneManager.vegetation.massiveTreeGroups.length > 0) {
    collisionSystem.addCollidablesFiltered(sceneManager.vegetation.massiveTreeGroups);
  }

  // NPC meshes — dynamic source so newly spawned NPCs are always collidable
  collisionSystem.setDynamicSource(() => entityManager.getMeshes());

  playerController.setCollisionSystem(collisionSystem, scene);

  // ── Systems ───────────────────────────────────────────────────────────────
  const interactionSystem = new InteractionSystem(camera, renderer.domElement, entityManager);
  const reactionSystem = new ReactionSystem(scene, playerState, npcStateStore, worldState, entityManager);

  // ── WorldBuilder ──────────────────────────────────────────────────────────
  const worldBuilder = new WorldBuilder(scene, terrain);
  worldBuilder.setCollisionSystem(collisionSystem);
  reactionSystem.setWorldBuilder(worldBuilder);
  reactionSystem.setTerrain(terrain);

  const worldBuilderPanel = new WorldBuilderPanel(app, (prompt: string) => {
    if (!joinedServer) {
      worldBuilderPanel.setResponse('Connect to the server first.');
      worldBuilderPanel.setReady();
      return;
    }
    const pos = playerController.position;
    ws.send({
      type: 'world_modify',
      prompt,
      playerId: localPlayerId,
      position: [pos.x, pos.y, pos.z],
    });
  });

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

    if (e.code === "KeyB") {
      worldBuilderPanel.toggle();
    }

    // Enter to focus chat (if not already focused)
    if (e.code === "Enter" && !uiManager.chatPanel.isFocused) {
      e.preventDefault();
      uiManager.chatPanel.focusInput();
    }

    // Escape in chat to blur
    if (e.code === "Escape" && uiManager.chatPanel.isFocused) {
      e.preventDefault();
    }
  });

  // ── Network ───────────────────────────────────────────────────────────────
  loadingOverlay.setMessage('Connecting to server...');
  const wsProto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocketClient(`${wsProto}://${window.location.host}/ws`);

  ws.onConnectionChange = (connected) => {
    console.warn(`WebSocket ${connected ? 'connected' : 'disconnected'}`);
    if (connected) {
      loadingOverlay.setMessage('Joining world...');
      // BUG-3: Send initial position in join so other players see correct spawn
      const initPos: [number, number, number] = [
        playerController.position.x,
        playerController.position.y,
        playerController.position.z,
      ];
      ws.send({ type: 'join', username, race, faction, skin, position: initPos });
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
  worldGenerator.setExclusionFootprints([
    ...sceneManager.buildings.footprints,
    ...sceneManager.fortMalaka.footprints,
  ]);
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
    zoneAtmosphere.enterZone(name);
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
      playerController.position.y = getWorldHeightAt(terrain, saved.x, saved.z);
    }
  };

  // Quest UI reactivity
  playerState.onQuestChange = () => {
    uiManager.updateQuestUI(playerState);
  };

  // ── Interaction wiring ────────────────────────────────────────────────────
  let activeNpcId: string | null = null;
  const dialogFocusTarget = new THREE.Vector3();
  const dialogFocusLookTarget = new THREE.Vector3();
  const dialogFocusForward = new THREE.Vector3();
  const dialogFocusSide = new THREE.Vector3();
  const dialogFocusUp = new THREE.Vector3(0, 1, 0);
  const updateDialogFocus = (delta: number): boolean => {
    if (!activeNpcId || introCinematicActive) return false;
    const npc = entityManager.getNPC(activeNpcId);
    if (!npc) return false;

    dialogFocusForward.subVectors(npc.mesh.position, playerController.position);
    dialogFocusForward.y = 0;
    const horizontalDistance = dialogFocusForward.length();
    if (horizontalDistance < 0.001) return false;
    dialogFocusForward.divideScalar(horizontalDistance);

    dialogFocusSide.crossVectors(dialogFocusUp, dialogFocusForward).normalize();
    dialogFocusTarget.set(
      playerController.position.x - dialogFocusForward.x * 2.2 + dialogFocusSide.x * 0.85,
      playerController.position.y + 1.9,
      playerController.position.z - dialogFocusForward.z * 2.2 + dialogFocusSide.z * 0.85,
    );
    camera.position.lerp(dialogFocusTarget, 1 - Math.exp(-10 * delta));

    dialogFocusLookTarget.set(npc.mesh.position.x, npc.mesh.position.y + 1.55, npc.mesh.position.z);
    camera.lookAt(dialogFocusLookTarget);
    playerController.facingYawOverride = Math.atan2(dialogFocusForward.x, dialogFocusForward.z);
    return true;
  };

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
    playerController.facingYawOverride = null;
    uiManager.hideInteractionPanel();
    uiManager.hideCombatHUD();
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
      loadingOverlay.hide();
      startIntroCinematic();
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
      loadingOverlay.hide();
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
        } else if (action.kind === 'start_quest') {
          const quest = action.params.quest ?? action.params.questName ?? 'Unknown Quest';
          logCombat(`Quest Started: ${quest}`, '#c5a55a');
        } else if (action.kind === 'complete_quest') {
          const quest = action.params.questName ?? action.params.questId ?? 'Unknown Quest';
          logCombat(`Quest Complete: ${quest}`, '#c5a55a');
        } else if (action.kind === 'advance_objective') {
          const desc = action.params.objectiveId ?? 'objective';
          logCombat(`Objective Complete: ${desc}`, '#c5a55a');
        } else if (action.kind === 'emote') {
          const animation = action.params.animation ?? 'gesture';
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

    // ── World Modify Response ────────────────────────────────────────────────
    if (data.type === 'world_modify_response') {
      const dialogue: string = data.dialogue ?? '';
      const actions = data.actions ?? [];
      worldBuilderPanel.setResponse(dialogue);
      worldBuilderPanel.setReady();
      reactionSystem.processActions(actions);
    }
  };

  // ── Main loop ─────────────────────────────────────────────────────────────
  // Reusable vector for camera direction (avoids per-frame allocation)
  const _camDir = new THREE.Vector3();
  const _idleVelocity = new THREE.Vector3();
  // Cache terrain height callback to avoid creating a closure each frame
  const getTerrainHeight = (x: number, z: number) => getWorldHeightAt(terrain, x, z);

  // Position broadcast timer (10Hz)
  let moveSendTimer = 0;
  const MOVE_SEND_INTERVAL = 1 / 10; // 100ms

  function animate() {
    requestAnimationFrame(animate);

    const delta = sceneManager.tick();
    const dialogFocusActive = updateDialogFocus(delta);

    // Player (skip movement when dead)
    if (!playerState.isDead) {
      if (!introCinematicActive && !dialogFocusActive) {
        playerController.update(delta);
      }
      player.group.position.copy(playerController.position);
      player.update(
        delta,
        !introCinematicActive && !dialogFocusActive && playerController.isMoving,
        (introCinematicActive || dialogFocusActive) ? _idleVelocity : playerController.velocity,
        playerController.isSwimming,
        playerController.facingYawOverride,
      );

      // Sync position to playerState
      playerState.position = [playerController.position.x, playerController.position.y, playerController.position.z];
    }

    if (introCinematicActive) {
      updateIntroCinematic();
    } else if (!dialogFocusActive) {
      playerController.facingYawOverride = null;
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
    entityManager.update(delta, getTerrainHeight, collisionSystem);
    reactionSystem.tick(delta);

    // Zone tracking & dungeon proximity
    zoneTracker.update(px, pz);
    zoneAtmosphere.update(delta);
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

  console.warn('World of Promptcraft initialized — WASD move, hold LMB/RMB to rotate camera, wheel to zoom');
}
