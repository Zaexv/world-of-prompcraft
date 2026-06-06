// ── Client → Server Messages ──────────────────────────────────────────────────

export interface PlayerInteraction {
  type: "interaction";
  npcId: string;
  npcName?: string;
  personalityKey?: string;
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
  position: [number, number, number];
  /** Full list of registered mesh type ids, so the server agent can place any of them. */
  meshCatalog?: string[];
}

export interface ChatMessage {
  type: "chat_message";
  text: string;
}

export interface UseItem {
  type: "use_item";
  playerId: string;
  item: string;
}

export interface EquipItem {
  type: "equip_item";
  playerId: string;
  item: string;
  slot: string | null;
  equipped: boolean;
}

export interface ExploreArea {
  type: "explore_area";
  position: [number, number, number];
  npcs: NPCInitData[];
}

export interface DungeonEnter {
  type: "dungeon_enter";
  dungeonId: string;
  playerId: string;
}

export interface DungeonExit {
  type: "dungeon_exit";
  dungeonId: string;
  playerId: string;
  loot: string[];
}

export interface QuestUpdate {
  type: "quest_update";
  questId: string;
  objectiveId: string;
  playerId: string;
}

export interface PingMessage {
  type: "ping";
}

// ── WorldBuilder Messages ─────────────────────────────────────────────────────

export interface WorldModifyRequest {
  type: "world_modify";
  prompt: string;
  playerId: string;
  position: [number, number, number];
}

/** A single primitive in a generated custom mesh. */
export interface MeshSpecPart {
  shape: "box" | "cylinder" | "sphere" | "cone" | "pyramid";
  size: number[];
  position: [number, number, number];
  color: string;
  rotation?: [number, number, number];
}

/** A brand-new mesh composed of primitives, produced by the create_custom_mesh tool. */
export interface MeshSpec {
  parts: MeshSpecPart[];
}

/** Manual (non-LLM) world edit from the UI — palette spawn or delete. */
export interface WorldDirectEdit {
  type: "world_direct_edit";
  action: "spawn" | "remove";
  params: WorldSpawnParams | WorldRemoveParams;
}

export type ClientMessage =
  | PlayerInteraction
  | PlayerMove
  | JoinRequest
  | ChatMessage
  | UseItem
  | EquipItem
  | ExploreArea
  | DungeonEnter
  | DungeonExit
  | QuestUpdate
  | PingMessage
  | WorldModifyRequest
  | WorldDirectEdit;

// ── Action Params (discriminated by kind) ────────────────────────────────────
// Each action kind carries a typed params object. This makes the client-server
// contract explicit: adding a new action kind requires updating both sides.

export interface DamageParams {
  amount: number;
  target: "player" | "npc";
  damageType?: "physical" | "fire" | "ice" | "lightning" | "holy" | "dark" | "arcane";
  effectType?: string;
  outcome?: string;
  isCrit?: boolean;
  combatText?: string;
}

export interface HealParams {
  amount: number;
  target: "player" | "npc";
}

export interface GiveItemParams {
  item: string;
  description?: string;
  rarity?: string;
  icon?: string;
  effects?: Record<string, number>;
  value?: number;
}

export interface GiveGoldParams {
  amount: number;
}

export interface CompletePurchaseParams {
  item: string;
  price: number;
  description?: string;
  rarity?: string;
  icon?: string;
  effects?: Record<string, number>;
  value?: number;
}

export interface SellItemParams {
  item: string;
  price: number;
}

export interface TakeItemParams {
  item: string;
}

export interface EmoteParams {
  animation: string;
}

export interface MoveNpcParams {
  position: [number, number, number];
  duration?: number;
}

export interface SpawnEffectParams {
  effectType?: string;
  effect_type?: string; // legacy alias from handler
  color?: string;
  count?: number;
  position?: [number, number, number];
}

export interface ChangeWeatherParams {
  weather: string;
}

/** Raw quest instance as sent by the server (storage or client shape). */
export type RawServerQuest = Record<string, unknown>;

/** accept_quest carries a full, server-authoritative quest instance. */
export interface AcceptQuestParams {
  player_id?: string;
  quest: RawServerQuest;
}

/** Legacy start_quest (kept for backward compatibility). */
export interface StartQuestParams {
  player_id?: string;
  quest?: RawServerQuest | string;
  questId?: string;
  questName?: string;
  description?: string;
}

export interface CompleteQuestParams {
  player_id?: string;
  questId?: string;
  quest_id?: string;
  questName?: string;
  reward?: string;
}

export interface AdvanceObjectiveParams {
  questId?: string;
  objectiveId?: string;
  description?: string;
  progress?: number;
  required?: number;
}

export interface GrantXpParams {
  amount: number;
}

export interface WorldSpawnParams {
  objectId: string;
  objectType: string;
  position: [number, number, number];
  scale?: number;
  label?: string;
  /** Present for objectType === "custom": primitives to build the mesh from. */
  spec?: MeshSpec;
}

export interface WorldRemoveParams {
  objectId: string;
}

export interface PlayMusicParams {
  mood: string;
  description?: string;
  notes?: Array<{ note: string; duration: string; time: number }>;
  duration?: number;
  tempo?: number;
  scale?: string;
}

export type Action =
  | { kind: "damage"; params: DamageParams }
  | { kind: "heal"; params: HealParams }
  | { kind: "give_item"; params: GiveItemParams }
  | { kind: "give_gold"; params: GiveGoldParams }
  | { kind: "complete_purchase"; params: CompletePurchaseParams }
  | { kind: "sell_item"; params: SellItemParams }
  | { kind: "take_item"; params: TakeItemParams }
  | { kind: "emote"; params: EmoteParams }
  | { kind: "move_npc"; params: MoveNpcParams }
  | { kind: "spawn_effect"; params: SpawnEffectParams }
  | { kind: "change_weather"; params: ChangeWeatherParams }
  | { kind: "accept_quest"; params: AcceptQuestParams }
  | { kind: "start_quest"; params: StartQuestParams }
  | { kind: "complete_quest"; params: CompleteQuestParams }
  | { kind: "advance_objective"; params: AdvanceObjectiveParams }
  | { kind: "grant_xp"; params: GrantXpParams }
  | { kind: "world_spawn"; params: WorldSpawnParams }
  | { kind: "world_remove"; params: WorldRemoveParams }
  | { kind: "play_music"; params: PlayMusicParams };

// ── Shared Data Shapes ────────────────────────────────────────────────────────

/** Full item metadata as serialized by the server (stacked). */
export interface ItemData {
  name: string;
  description: string;
  rarity: string;
  icon: string;
  quantity: number;
  stackable?: boolean;
  effects?: Record<string, number>;
  value?: number;
}

export interface PlayerStateData {
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  inventory: ItemData[];
  level: number;
  gold: number;
}

export interface NPCStateData {
  hp: number;
  maxHp: number;
  position: [number, number, number];
  scale: number;
  mood: string;
  relationship_score: number;
  personality?: string;
  archetype?: string;
  name?: string;
}

export interface NPCInitData {
  npc_id: string;
  name: string;
  hp: number;
  maxHp: number;
  position: [number, number, number];
  scale: number;
  mood: string;
  personality: string;
  archetype?: string;
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

// ── Server → Client Messages ─────────────────────────────────────────────────

export interface AgentResponse {
  type: "agent_response";
  npcId: string;
  dialogue: string;
  actions: Action[];
  playerStateUpdate?: Partial<PlayerStateData>;
  npcStateUpdate?: Partial<NPCStateData>;
}

export interface UseItemResult {
  type: "use_item_result";
  success: boolean;
  message: string;
  actions: Action[];
  playerStateUpdate?: Partial<PlayerStateData>;
}

export interface AckMessage {
  type: "ack";
  status: string;
}

export interface ErrorResponse {
  type: "error";
  message: string;
}

export interface JoinOk {
  type: "join_ok";
  playerId: string;
  players: RemotePlayerData[];
  npcs: NPCInitData[];
  /** Player-built objects already in the shared world (placed by anyone). */
  worldObjects?: WorldSpawnParams[];
}

/** Broadcast when any player builds or removes a shared world object. */
export interface WorldObjectsUpdate {
  type: "world_objects_update";
  actions: Action[];
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

export interface PongMessage {
  type: "pong";
}

export interface WorldModifyResponse {
  type: "world_modify_response";
  dialogue: string;
  actions: Action[];
}

export interface WorldModifyStart {
  type: "world_modify_start";
  blueprintId: string;
  totalChunks: number;
}

export interface WorldModifyChunk {
  type: "world_modify_chunk";
  blueprintId: string;
  chunkIndex: number;
  data: string; // Base64 or JSON string of actions/blueprint
}

export interface WorldModifyEnd {
  type: "world_modify_end";
  blueprintId: string;
}

export type ServerMessage =
  | AgentResponse
  | UseItemResult
  | AckMessage
  | ErrorResponse
  | JoinOk
  | JoinError
  | PlayerJoined
  | PlayerLeft
  | WorldUpdate
  | ChatBroadcast
  | NPCDialogue
  | PongMessage
  | WorldModifyResponse
  | WorldModifyStart
  | WorldModifyChunk
  | WorldModifyEnd
  | WorldObjectsUpdate;
