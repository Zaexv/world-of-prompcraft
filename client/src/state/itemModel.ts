/**
 * Client-side item model. The server attaches full metadata (description,
 * rarity, icon) to items it grants; {@link toItem} normalizes anything that
 * arrives without it (loot drops, legacy string payloads) so the inventory UI
 * always has a description, rarity color, and icon to render.
 */

export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export interface Item {
  name: string;
  description: string;
  rarity: Rarity;
  icon: string;
  quantity: number;
  /** Structured use-effects (heal_hp, restore_mana, max_hp, level). */
  effects: Record<string, number>;
}

/** Loose item shape as it arrives from the wire (rarity not yet validated). */
export interface RawItem {
  name?: string;
  description?: string;
  rarity?: string;
  icon?: string;
  quantity?: number;
  effects?: Record<string, number>;
}

/** WoW-style rarity palette (slot border + name color). */
export const RARITY_COLORS: Record<Rarity, string> = {
  common: "#ffffff",
  uncommon: "#1eff00",
  rare: "#0070dd",
  epic: "#a335ee",
  legendary: "#ff8000",
};

const RARITIES: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];

/** Sort weight per rarity (higher = rarer). Used to order the inventory grid. */
export const RARITY_RANK: Record<Rarity, number> = {
  legendary: 4,
  epic: 3,
  rare: 2,
  uncommon: 1,
  common: 0,
};

/** Sort items rarest-first, then alphabetically. Returns a new array. */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || a.name.localeCompare(b.name),
  );
}

function isRarity(value: unknown): value is Rarity {
  return typeof value === "string" && (RARITIES as readonly string[]).includes(value);
}

/** Keyword → icon heuristics for items lacking server-supplied metadata. */
function guessIcon(lower: string): string {
  if (/sword|blade|dagger|axe|mace|spear/.test(lower)) return "🗡️";
  if (/bow|crossbow/.test(lower)) return "🏹";
  if (/shield|armor|armour|plate|helm/.test(lower)) return "🛡️";
  if (/potion|elixir|tonic|brew/.test(lower)) return "🧪";
  if (/scroll|tome|book|map/.test(lower)) return "📜";
  if (/ring|amulet|charm|rune|gem|crystal/.test(lower)) return "💍";
  if (/coin|gold|silver/.test(lower)) return "🪙";
  if (/bread|meat|apple|food|fruit/.test(lower)) return "🍖";
  if (/key/.test(lower)) return "🗝️";
  return "📦";
}

/** Normalize a raw string name or partial item into a full {@link Item}. */
export function toItem(raw: string | RawItem): Item {
  if (typeof raw === "string") {
    const lower = raw.toLowerCase();
    return {
      name: raw,
      description: `An ordinary ${lower}.`,
      rarity: "common",
      icon: guessIcon(lower),
      quantity: 1,
      effects: {},
    };
  }
  const name = raw.name ?? "Unknown Item";
  const lower = name.toLowerCase();
  return {
    name,
    description: raw.description ?? `An ordinary ${lower}.`,
    rarity: isRarity(raw.rarity) ? raw.rarity : "common",
    icon: raw.icon ?? guessIcon(lower),
    quantity: raw.quantity ?? 1,
    effects: raw.effects ?? {},
  };
}
