import type { PlayerStateData } from "../network/MessageProtocol";
import type { ActiveQuest } from "./QuestDefinitions";
import { QUEST_DEFINITIONS } from "./QuestDefinitions";
import type { Item, RawItem } from "./itemModel";
import { toItem } from "./itemModel";

/** Equipment slot types. */
export type EquipSlot = "weapon" | "shield" | "trinket";

/** Map of slot → equipped item name (or null). */
export type EquippedItems = Record<EquipSlot, string | null>;

/** Extended player state data that may include quest fields from the server. */
interface PlayerStatePatch extends Partial<PlayerStateData> {
  activeQuests?: ActiveQuest[];
  completedQuests?: string[];
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
    let questChanged = false;
    if (update.activeQuests !== undefined) {
      this.activeQuests = update.activeQuests.map((q) => ({
        ...q,
        objectives: q.objectives.map((o) => ({ ...o })),
      }));
      questChanged = true;
    }
    if (update.completedQuests !== undefined) {
      this.completedQuests = [...update.completedQuests];
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

  /** Accept a quest by ID. Skips if already active or completed. */
  startQuest(questId: string): void {
    if (this.isQuestActive(questId) || this.isQuestComplete(questId)) return;
    const def = QUEST_DEFINITIONS[questId];
    if (!def) return;
    const quest: ActiveQuest = {
      id: def.id,
      name: def.name,
      description: def.description,
      giverNpc: def.giverNpc,
      giverName: def.giverName,
      objectives: def.objectives.map((o) => ({ ...o, completed: false })),
      rewardItem: def.rewardItem,
      rewardDescription: def.rewardDescription,
    };
    this.activeQuests.push(quest);
    this.notify();
    this.onQuestChange?.();
  }

  /** Mark a specific objective as completed within an active quest. */
  advanceObjective(questId: string, objectiveId: string): void {
    const quest = this.getActiveQuest(questId);
    if (!quest) return;
    const objective = quest.objectives.find((o) => o.id === objectiveId);
    if (!objective || objective.completed) return;
    objective.completed = true;
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
