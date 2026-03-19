// ── Client → Server Messages ──────────────────────────────────────────────────

export interface PlayerInteraction {
  type: "interaction";
  npcId: string;
  prompt: string;
  playerId: string;
  playerState: {
    position: [number, number, number];
    hp: number;
    inventory: string[];
  };
}

export interface PlayerMove {
  type: "player_move";
  playerId: string;
  position: [number, number, number];
  yaw: number;
}

export interface JoinRequest {
  type: "join";
  username: string;
  race: string;
  faction: string;
}

export interface ChatMessage {
  type: "chat_message";
  text: string;
}

export type ClientMessage = PlayerInteraction | PlayerMove | JoinRequest | ChatMessage;

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
    | "complete_quest"
    | "advance_objective";
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
  relationship_score: number;
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

export interface RemotePlayerData {
  playerId: string;
  username: string;
  position: [number, number, number];
  race: string;
  faction: string;
  hp: number;
  maxHp: number;
  yaw: number;
}

export interface JoinOk {
  type: "join_ok";
  playerId: string;
  players: RemotePlayerData[];
  npcs: NPCInitData[];
}

export interface JoinError {
  type: "join_error";
  message: string;
}

export interface PlayerJoined {
  type: "player_joined";
  player: RemotePlayerData;
}

export interface PlayerLeft {
  type: "player_left";
  playerId: string;
}

export interface WorldUpdate {
  type: "world_update";
  players: RemotePlayerData[];
}

export interface ChatBroadcast {
  type: "chat_broadcast";
  sender: string;
  text: string;
  position: [number, number, number];
}

export interface NPCDialogue {
  type: "npc_dialogue";
  npcId: string;
  npcName: string;
  speakerPlayer: string;
  dialogue: string;
  position: [number, number, number];
}

export interface NPCInitData {
  npc_id: string;
  name: string;
  hp: number;
  maxHp: number;
  position: [number, number, number];
  mood: string;
}

export interface PongMessage {
  type: "pong";
}

export type ServerMessage =
  | AgentResponse
  | ErrorResponse
  | JoinOk
  | JoinError
  | PlayerJoined
  | PlayerLeft
  | WorldUpdate
  | ChatBroadcast
  | NPCDialogue
  | PongMessage;
