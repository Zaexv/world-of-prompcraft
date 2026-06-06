/**
 * Quest types — server-authoritative.
 *
 * Quests are no longer defined on the client. The server sends fully
 * self-describing quest instances (title, objectives with progress/required,
 * and a reward block); the client only renders them. These interfaces describe
 * that wire shape and provide a normalizer that accepts both the server's
 * storage shape (snake_case) and its client shape (camelCase).
 */

/** A single objective within a quest instance. */
export interface QuestObjectiveData {
  id: string;
  description: string;
  /** Open objective kind: kill | collect | talk | reach | enter_dungeon | … */
  kind: string;
  target: string;
  required: number;
  progress: number;
  completed: boolean;
}

/** Generalized quest reward. */
export interface QuestReward {
  gold: number;
  items: string[];
  xp: number;
  description: string;
}

/** A quest carried by the player (active or, by id, completed). */
export interface ActiveQuest {
  id: string;
  name: string;
  description: string;
  giverNpc: string;
  giverName: string;
  objectives: QuestObjectiveData[];
  reward: QuestReward;
  origin: string;
  status: string;
}

function num(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeObjective(raw: Record<string, unknown>): QuestObjectiveData {
  const required = Math.max(1, num(raw.required, 1));
  const completed = Boolean(raw.completed);
  return {
    id: String(raw.id ?? ""),
    description: String(raw.description ?? ""),
    kind: String(raw.kind ?? raw.type ?? "talk"),
    target: String(raw.target ?? ""),
    required,
    progress: num(raw.progress, completed ? required : 0),
    completed,
  };
}

function normalizeReward(raw: unknown): QuestReward {
  const r = (raw ?? {}) as Record<string, unknown>;
  const items = Array.isArray(r.items) ? r.items.map((i) => String(i)) : [];
  return {
    gold: num(r.gold),
    items,
    xp: num(r.xp),
    description: String(r.description ?? ""),
  };
}

/**
 * Normalize a raw server quest (storage or client shape) into an ActiveQuest.
 * Accepts `title`/`name`, `giver_npc_id`/`giverNpc`, etc.
 */
export function toActiveQuest(raw: Record<string, unknown>): ActiveQuest {
  const objectivesRaw = Array.isArray(raw.objectives) ? raw.objectives : [];
  const reward = normalizeReward(raw.reward);
  // Backward-compatible flat reward fields.
  if (reward.items.length === 0 && raw.rewardItem) {
    reward.items = [String(raw.rewardItem)];
  }
  if (!reward.description && raw.rewardDescription) {
    reward.description = String(raw.rewardDescription);
  }
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? raw.title ?? ""),
    description: String(raw.description ?? ""),
    giverNpc: String(raw.giverNpc ?? raw.giver_npc_id ?? raw.giver_npc ?? ""),
    giverName: String(raw.giverName ?? raw.giver_name ?? ""),
    objectives: objectivesRaw.map((o) => normalizeObjective(o as Record<string, unknown>)),
    reward,
    origin: String(raw.origin ?? "curated"),
    status: String(raw.status ?? "active"),
  };
}
