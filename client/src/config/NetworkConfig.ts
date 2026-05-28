/**
 * Network and server endpoint configuration.
 * Centralized server URLs and connection settings.
 */

// Detect environment
const isDev = import.meta.env.DEV;

export const NetworkConfig = {
  // Server Endpoints
  server: {
    // Main WebSocket connection
    url: isDev ? 'ws://127.0.0.1:8000/ws' : 'wss://api.promptcraft.game/ws',

    // REST API (fallback, for health checks, etc.)
    api: isDev ? 'http://127.0.0.1:8000' : 'https://api.promptcraft.game',

    // Alternative servers for load balancing
    alternates: [
      'wss://api2.promptcraft.game/ws',
      'wss://api3.promptcraft.game/ws',
    ],
  },

  // Connection Settings
  connection: {
    // Reconnection strategy
    maxReconnectAttempts: 5,
    reconnectDelayMs: 3000,
    reconnectBackoffMultiplier: 1.5,
    maxReconnectDelayMs: 30000,

    // Timeout settings
    connectionTimeoutMs: 10000,
    messageTimeoutMs: 5000,

    // Heartbeat
    heartbeatIntervalMs: 30000,
    heartbeatTimeoutMs: 5000,
  },

  // Protocol Configuration
  protocol: {
    version: '1.0.0',
    compression: true,
    binaryMode: false, // Set to true for binary protocol in future
  },

  // Message Limits
  limits: {
    maxMessageSize: 1024 * 1024, // 1 MB
    maxQueuedMessages: 100,
    rateLimitPerSecond: 50,
  },

  // Authentication
  auth: {
    tokenKey: 'promptcraft_token',
    tokenExpiry: 24 * 60 * 60 * 1000, // 24 hours in ms
    refreshThreshold: 5 * 60 * 1000, // Refresh 5 mins before expiry
  },

  // Feature Flags
  features: {
    voiceChat: false,
    crossServerPlay: false,
    autoLogin: true,
    guestMode: true,
  },

  // Logging
  logging: {
    enabled: isDev,
    level: isDev ? 'debug' : 'error',
    logNetworkTraffic: isDev && false,
    logConnectionEvents: isDev,
  },
} as const;

export type NetworkConfigType = typeof NetworkConfig;

/**
 * Get the appropriate server URL based on environment.
 */
export function getServerUrl(): string {
  return NetworkConfig.server.url;
}

/**
 * Get the API base URL.
 */
export function getApiUrl(): string {
  return NetworkConfig.server.api;
}
