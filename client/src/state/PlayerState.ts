import type { PlayerStateData } from "../network/MessageProtocol";

/** Equipment slot types. */
export type EquipSlot = "weapon" | "shield" | "trinket";

/** Map of slot → equipped item name (or null). */
export type EquippedItems = Record<EquipSlot, string | null>;

/**
 * Singleton player state store.
 */
export class PlayerState {
  private static _instance: PlayerState | null = null;

  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  level: number;
  inventory: string[];
  position: [number, number, number];
  isDead: boolean = false;

  /** Currently equipped items by slot. */
  equipped: EquippedItems = { weapon: null, shield: null, trinket: null };

  /** Called whenever any property changes. */
  onChange: ((state: PlayerState) => void) | null = null;

  /** Called when the player dies (HP reaches 0). */
  onDeath: ((killerName?: string) => void) | null = null;

  private constructor() {
    this.hp = 100;
    this.maxHp = 100;
    this.mana = 50;
    this.maxMana = 50;
    this.level = 1;
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
  merge(update: Partial<PlayerStateData>): void {
    if (update.hp !== undefined) this.hp = update.hp;
    if (update.maxHp !== undefined) this.maxHp = update.maxHp;
    if (update.mana !== undefined) this.mana = update.mana;
    if (update.maxMana !== undefined) this.maxMana = update.maxMana;
    if (update.level !== undefined) this.level = update.level;
    if (update.inventory !== undefined) this.inventory = [...update.inventory];
    this.notify();
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

  addItem(item: string): void {
    this.inventory.push(item);
    this.notify();
  }

  removeItem(item: string): void {
    const idx = this.inventory.indexOf(item);
    if (idx !== -1) {
      this.inventory.splice(idx, 1);
      this.notify();
    }
  }

  /** Equip an item from inventory into the appropriate slot. Returns the slot used. */
  equip(item: string): EquipSlot | null {
    const lower = item.toLowerCase();
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
      this.inventory.push(prev);
    }

    // Remove from inventory and put in slot
    const idx = this.inventory.indexOf(item);
    if (idx !== -1) {
      this.inventory.splice(idx, 1);
    }
    this.equipped[slot] = item;
    this.notify();
    return slot;
  }

  /** Unequip an item from a slot back into inventory. */
  unequip(slot: EquipSlot): void {
    const item = this.equipped[slot];
    if (item) {
      this.inventory.push(item);
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

  // ── Internal ───────────────────────────────────────────────────────────────

  private notify(): void {
    this.onChange?.(this);
  }
}
