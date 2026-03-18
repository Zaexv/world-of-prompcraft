// ── Client → Server Messages ──────────────────────────────────────────────────

export interface PlayerInteraction {
  type: "interaction";
  npcId: string;
  prompt: string;
  playerState: {
    position: [number, number, number];
    hp: number;
    inventory: string[];
  };
}

export interface PlayerMove {
  type: "player_move";
  position: [number, number, number];
}

export type ClientMessage = PlayerInteraction | PlayerMove;

// ── Server → Client Messages ─────────────────────────────────────────────────

export interface Action {
  kind:
    | "damage"
    | "heal"
    | "give_item"
    | "take_item"
    | "emote"
    | "move_npc"
    | "spawn_effect"
    | "change_weather"
    | "start_quest"
    | "complete_quest";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params: Record<string, any>;
}

export interface PlayerStateData {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  inventory: string[];
  level: number;
}

export interface NPCStateData {
  hp: number;
  maxHp: number;
  position: [number, number, number];
  mood: string;
}

export interface AgentResponse {
  type: "agent_response";
  npcId: string;
  dialogue: string;
  actions: Action[];
  playerStateUpdate?: Partial<PlayerStateData>;
  npcStateUpdate?: Partial<NPCStateData>;
}

export interface ErrorResponse {
  type: "error";
  message: string;
}

export type ServerMessage = AgentResponse | ErrorResponse;
