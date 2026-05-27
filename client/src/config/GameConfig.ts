/**
 * Centralized game configuration and defaults.
 * All game settings accessible from a single source of truth.
 */

export const GameConfig = {
  // World & Physics
  world: {
    gravity: 9.81,
    defaultSpawnY: 5,
    chunkSize: 64,
    viewDistance: 256,
    fogNear: 50,
    fogFar: 500,
  },

  // Player
  player: {
    moveSpeed: 30,
    sprintMultiplier: 1.5,
    jumpForce: 200,
    maxHealth: 100,
    defaultScale: 1.8,
  },

  // NPC
  npc: {
    moveSpeed: 15,
    detectionRange: 100,
    interactionDistance: 10,
    conversationTimeout: 30000, // ms
  },

  // Combat
  combat: {
    meleeRange: 5,
    baseDamage: 10,
    critChance: 0.15,
    critMultiplier: 1.5,
  },

  // UI
  ui: {
    fadeInDuration: 300, // ms
    fadeOutDuration: 200, // ms
    toastDisplayTime: 4000, // ms
    dialogZIndex: 1000,
  },

  // Rendering
  rendering: {
    targetFPS: 60,
    shadowMapSize: 2048,
    antialiasLevel: 1,
    enableShadows: true,
    enablePostProcessing: false,
  },

  // Network
  network: {
    reconnectAttempts: 5,
    reconnectDelay: 3000, // ms
    messageTimeout: 5000, // ms
    heartbeatInterval: 30000, // ms
  },

  // Development
  debug: {
    enabled: false,
    showColliders: false,
    showGrid: false,
    logNetworkMessages: false,
  },
} as const;

export type GameConfigType = typeof GameConfig;
