/**
 * WebSocket client with auto-reconnect (exponential backoff) and heartbeat.
 */
export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private shouldReconnect = true;

  /** Fired when a parsed JSON message arrives from the server. */
  onMessage: ((data: any) => void) | null = null;

  /** Fired when the connection state changes. */
  onConnectionChange: ((connected: boolean) => void) | null = null;

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  constructor(url = "ws://localhost:8000/ws") {
    this.url = url;
    this.connect();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /** JSON-encode and send a message. Silently drops if not connected. */
  send(msg: object): void {
    if (this.isConnected) {
      this.ws!.send(JSON.stringify(msg));
    }
  }

  /** Cleanly shut down the connection. */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private connect(): void {
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.close();
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // reset backoff on success
      this.startHeartbeat();
      this.onConnectionChange?.(true);
    };

    this.ws.onclose = () => {
      this.stopHeartbeat();
      this.onConnectionChange?.(false);
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), this.reconnectDelay);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay,
        );
      }
    };

    this.ws.onerror = () => {
      // close event will follow; nothing special to do here
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string);
        this.onMessage?.(data);
      } catch {
        // ignore non-JSON messages (e.g. pong frames)
      }
    };
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        this.ws!.send(JSON.stringify({ type: "ping" }));
      }
    }, 30_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}
