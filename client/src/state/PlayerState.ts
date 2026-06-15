import type { PlayerStateData } from "../network/MessageProtocol";
import type { ActiveQuest } from "./QuestDefinitions";
import { toActiveQuest } from "./QuestDefinitions";
import type { Item, RawItem } from "./itemModel";
import { toItem } from "./itemModel";

/** Equipment slot types. */
export type EquipSlot = "weapon" | "shield" | "trinket";

/** Map of slot → equipped item name (or null). */
export type EquippedItems = Record<EquipSlot, string | null>;

/** Extended player state data that may include quest fields from the server. */
export interface PlayerStatePatch extends Partial<PlayerStateData> {
  activeQuests?: ActiveQuest[];
  /** Completed quests: ids (legacy) or {id, name} objects (so the title shows
   *  after a reload, when it wouldn't otherwise be known cross-session). */
  completedQuests?: Array<string | { id: string; name?: string }>;
  /** slot → equipped item name (from the server's persisted PlayerData). */
  equipped?: Partial<Record<EquipSlot, string | null>>;
}

/**
 * Singleton player state store.
 */
export class PlayerState {
  private static _instance: PlayerState | null = null;

  playerId: string = '';
  race: string = 'human';
  faction: string = 'alliance';

  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  level: number;
  gold: number;
  inventory: Item[];
  position: [number, number, number];
  isDead: boolean = false;

  /** Currently equipped items by slot. */
  equipped: EquippedItems = { weapon: null, shield: null, trinket: null };

  /** Quests the player has accepted but not yet completed. */
  activeQuests: ActiveQuest[] = [];

  /** IDs of quests the player has completed. */
  completedQuests: string[] = [];

  /** id → display name, retained so completed quests (id-only) still show a name. */
  private questNameCache: Map<string, string> = new Map();

  /** Called whenever any property changes. */
  onChange: ((state: PlayerState) => void) | null = null;

  /** Called when quest state changes (for UI reactivity). */
  onQuestChange?: () => void;

  /** Called when the player dies (HP reaches 0). */
  onDeath: ((killerName?: string) => void) | null = null;

  private constructor() {
    this.hp = 100;
    this.maxHp = 100;
    this.mana = 50;
    this.maxMana = 50;
    this.level = 1;
    this.gold = 0;
    this.inventory = [];
    this.position = [0, 0, 0];
  }

  static getInstance(): PlayerState {
    if (!PlayerState._instance) {
      PlayerState._instance = new PlayerState();
    }
    return PlayerState._instance;
  }

  // ── Mutations ──────────────────────────────────────────────────────────────

  /** Merge a partial server update into the current state. */
  merge(update: PlayerStatePatch): void {
    if (update.hp !== undefined) this.hp = update.hp;
    if (update.maxHp !== undefined) this.maxHp = update.maxHp;
    if (update.mana !== undefined) this.mana = update.mana;
    if (update.maxMana !== undefined) this.maxMana = update.maxMana;
    if (update.level !== undefined) this.level = update.level;
    if (update.gold !== undefined) this.gold = update.gold;
    if (update.inventory !== undefined) {
      this.inventory = update.inventory.map((i) => toItem(i));
    }
    if (update.equipped !== undefined) {
      this.equipped = {
        weapon: update.equipped.weapon ?? null,
        shield: update.equipped.shield ?? null,
        trinket: update.equipped.trinket ?? null,
      };
    }
    let questChanged = false;
    if (update.activeQuests !== undefined) {
      this.activeQuests = update.activeQuests.map((q) =>
        toActiveQuest(q as unknown as Record<string, unknown>),
      );
      for (const q of this.activeQuests) this.questNameCache.set(q.id, q.name);
      questChanged = true;
    }
    if (update.completedQuests !== undefined) {
      // Accept ids (legacy) or {id, name} objects; cache the name so the quest
      // log shows the title rather than the raw id after a reload.
      this.completedQuests = update.completedQuests.map((q) => {
        if (typeof q === 'string') return q;
        if (q.name) this.questNameCache.set(q.id, q.name);
        return q.id;
      });
      questChanged = true;
    }
    this.notify();
    if (questChanged) this.onQuestChange?.();
    if (this.hp <= 0 && !this.isDead) {
      this.isDead = true;
      this.onDeath?.();
    }
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.notify();
    if (this.hp <= 0 && !this.isDead) {
      this.isDead = true;
      this.onDeath?.();
    }
  }

  heal(amount: number): void {
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.notify();
  }

  consumeMana(amount: number): void {
    this.mana = Math.max(0, this.mana - amount);
    this.notify();
  }

  restoreMana(amount: number): void {
    this.mana = Math.min(this.maxMana, this.mana + amount);
    this.notify();
  }

  /** Add (or subtract, if negative) gold, clamped at zero. */
  addGold(amount: number): void {
    this.gold = Math.max(0, this.gold + amount);
    this.notify();
  }

  /** Item names as a flat list (duplicates per quantity) — for server payloads. */
  inventoryNames(): string[] {
    const names: string[] = [];
    for (const item of this.inventory) {
      for (let i = 0; i < item.quantity; i++) names.push(item.name);
    }
    return names;
  }

  /** Add an item, stacking by name. Accepts a full/partial item or a bare name. */
  addItem(raw: string | RawItem): void {
    const incoming = toItem(raw);
    const existing = this.inventory.find((i) => i.name === incoming.name);
    if (existing) {
      existing.quantity += incoming.quantity;
    } else {
      this.inventory.push(incoming);
    }
    this.notify();
  }

  removeItem(name: string): void {
    const idx = this.inventory.findIndex((i) => i.name === name);
    if (idx === -1) return;
    const item = this.inventory[idx];
    if (item.quantity > 1) {
      item.quantity -= 1;
    } else {
      this.inventory.splice(idx, 1);
    }
    this.notify();
  }

  /** Equip an item from inventory into the appropriate slot. Returns the slot used. */
  equip(name: string): EquipSlot | null {
    const lower = name.toLowerCase();
    let slot: EquipSlot | null = null;

    if (/sword|blade|axe|dagger|mace|hammer|spear|bow|staff/i.test(lower)) {
      slot = "weapon";
    } else if (/shield|armor/i.test(lower)) {
      slot = "shield";
    } else if (/charm|amulet|rune|ring|trinket|cloak/i.test(lower)) {
      slot = "trinket";
    }

    if (!slot) return null;

    // If something was already in that slot, put it back in inventory
    const prev = this.equipped[slot];
    if (prev) {
      this.addItem(prev);
    }

    this.removeItem(name);
    this.equipped[slot] = name;
    this.notify();
    return slot;
  }

  /** Unequip an item from a slot back into inventory. */
  unequip(slot: EquipSlot): void {
    const name = this.equipped[slot];
    if (name) {
      this.addItem(name);
      this.equipped[slot] = null;
      this.notify();
    }
  }

  respawn(): void {
    this.hp = this.maxHp;
    this.mana = this.maxMana;
    this.isDead = false;
    this.notify();
  }

  // ── Quest Methods ─────────────────────────────────────────────────────────

  /**
   * Accept a full server-sent quest instance. Skips if already active or
   * completed. `raw` may be the server storage (snake) or client (camel) shape.
   */
  acceptQuest(raw: Record<string, unknown>): void {
    const quest = toActiveQuest(raw);
    if (!quest.id || this.isQuestActive(quest.id) || this.isQuestComplete(quest.id)) return;
    this.activeQuests.push(quest);
    this.questNameCache.set(quest.id, quest.name);
    this.notify();
    this.onQuestChange?.();
  }

  /** Best-effort display name for a quest id (falls back to the id). */
  getQuestName(questId: string): string {
    return this.questNameCache.get(questId) ?? questId;
  }

  /** Advance a specific objective within an active quest (server-authoritative). */
  advanceObjective(questId: string, objectiveId: string, progress?: number): void {
    const quest = this.getActiveQuest(questId);
    if (!quest) return;
    const objective = quest.objectives.find((o) => o.id === objectiveId);
    if (!objective) return;
    if (progress !== undefined) {
      objective.progress = Math.min(objective.required, progress);
    } else {
      objective.progress = objective.required;
    }
    if (objective.progress >= objective.required) {
      objective.completed = true;
    }
    this.notify();
    this.onQuestChange?.();
  }

  /** Move a quest from active to completed. */
  completeQuest(questId: string): void {
    const idx = this.activeQuests.findIndex((q) => q.id === questId);
    if (idx === -1) return;
    this.activeQuests.splice(idx, 1);
    if (!this.completedQuests.includes(questId)) {
      this.completedQuests.push(questId);
    }
    this.notify();
    this.onQuestChange?.();
  }

  /** Check whether a quest is currently active. */
  isQuestActive(questId: string): boolean {
    return this.activeQuests.some((q) => q.id === questId);
  }

  /** Check whether a quest has been completed. */
  isQuestComplete(questId: string): boolean {
    return this.completedQuests.includes(questId);
  }

  /** Get the active quest instance by ID, or undefined if not active. */
  getActiveQuest(questId: string): ActiveQuest | undefined {
    return this.activeQuests.find((q) => q.id === questId);
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  private notify(): void {
    this.onChange?.(this);
  }
}
