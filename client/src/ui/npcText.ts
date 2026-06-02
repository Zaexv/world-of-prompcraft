import type { Action } from "../network/MessageProtocol";

/**
 * Shared NPC dialogue styling: maps NPC archetypes and per-turn actions to a
 * small set of semantic categories, and highlights item/price/quest tokens
 * inside dialogue text. Used by InteractionPanel (bubbles + action buttons)
 * and the world ChatPanel so a merchant's "selling" line, a healer's blessing,
 * and a dragon's threat all read differently at a glance.
 */
export type NpcCategory = "combat" | "heal" | "trade" | "quest" | "neutral";

export interface CategoryAccent {
  /** Foreground colour for text / button labels. */
  text: string;
  /** Border colour for action buttons. */
  border: string;
  /** Button hover background. */
  hover: string;
  /** Button hover glow. */
  glow: string;
  /** Dialogue bubble background. */
  bubbleBg: string;
  /** Dialogue bubble border. */
  bubbleBorder: string;
}

const CATEGORY_ACCENTS: Record<NpcCategory, CategoryAccent> = {
  combat: {
    text: "#f08888", border: "rgba(200,60,60,0.5)",
    hover: "rgba(200,60,60,0.2)", glow: "rgba(200,60,60,0.4)",
    bubbleBg: "rgba(200,60,60,0.13)", bubbleBorder: "rgba(200,60,60,0.35)",
  },
  heal: {
    text: "#88ddb0", border: "rgba(60,180,100,0.5)",
    hover: "rgba(60,180,100,0.2)", glow: "rgba(60,180,100,0.4)",
    bubbleBg: "rgba(60,180,100,0.13)", bubbleBorder: "rgba(60,180,100,0.35)",
  },
  trade: {
    text: "#d4b86a", border: "rgba(197,165,90,0.5)",
    hover: "rgba(197,165,90,0.2)", glow: "rgba(197,165,90,0.4)",
    bubbleBg: "rgba(197,165,90,0.16)", bubbleBorder: "rgba(197,165,90,0.4)",
  },
  quest: {
    text: "#a0b8f0", border: "rgba(130,160,220,0.5)",
    hover: "rgba(130,160,220,0.2)", glow: "rgba(130,160,220,0.4)",
    bubbleBg: "rgba(130,160,220,0.13)", bubbleBorder: "rgba(130,160,220,0.35)",
  },
  neutral: {
    text: "#e8dcc8", border: "rgba(197,165,90,0.3)",
    hover: "rgba(197,165,90,0.12)", glow: "rgba(197,165,90,0.3)",
    bubbleBg: "rgba(197,165,90,0.13)", bubbleBorder: "rgba(197,165,90,0.25)",
  },
};

export function categoryAccent(category: NpcCategory): CategoryAccent {
  return CATEGORY_ACCENTS[category];
}

/** Classify an action-button label (e.g. "Sell", "Attack") into a category. */
export function categoryForLabel(label: string): NpcCategory {
  const l = label.toLowerCase();
  if (/attack|challenge|fight|flee|defend|strike/.test(l)) return "combat";
  if (/heal|bless|protect|restore/.test(l)) return "heal";
  if (/trade|browse|sell|buy|bribe/.test(l)) return "trade";
  if (/quest|story|lore|wisdom/.test(l)) return "quest";
  return "neutral";
}

/** Map a single action kind to a category, or null if it carries no flavour. */
function categoryForActionKind(kind: Action["kind"]): NpcCategory | null {
  switch (kind) {
    case "damage":
      return "combat";
    case "heal":
      return "heal";
    case "give_item":
    case "take_item":
      return "trade";
    case "start_quest":
    case "complete_quest":
    case "advance_objective":
      return "quest";
    default:
      return null;
  }
}

/**
 * Pick the dominant category for a turn's actions. Combat/heal/quest take
 * priority over trade since they represent the more salient beat of the turn.
 */
export function categoryForActions(actions: readonly Action[]): NpcCategory | null {
  const order: NpcCategory[] = ["combat", "heal", "quest", "trade"];
  const present = new Set<NpcCategory>();
  for (const action of actions) {
    const cat = categoryForActionKind(action.kind);
    if (cat) present.add(cat);
  }
  return order.find((c) => present.has(c)) ?? null;
}

/** Map a server archetype string to a baseline category for plain chit-chat. */
export function archetypeCategory(archetype: string | undefined): NpcCategory {
  if (!archetype) return "neutral";
  const a = archetype.toLowerCase();
  if (a.includes("merchant") || a.includes("trader")) return "trade";
  if (a.includes("healer")) return "heal";
  if (a.includes("quest")) return "quest";
  if (a.includes("boss") || a.includes("monster") || a.includes("guard") || a.includes("pyromancer"))
    return "combat";
  return "neutral";
}

export interface Highlight {
  value: string;
  kind: "item" | "quest";
}

/** Collect item names and quest titles worth emphasising from a turn's actions. */
export function highlightsFromActions(actions: readonly Action[]): Highlight[] {
  const out: Highlight[] = [];
  const seen = new Set<string>();
  const push = (value: string | undefined, kind: Highlight["kind"]): void => {
    const v = (value ?? "").trim();
    if (!v || seen.has(v.toLowerCase())) return;
    seen.add(v.toLowerCase());
    out.push({ value: v, kind });
  };
  for (const action of actions) {
    if (action.kind === "give_item" || action.kind === "take_item") {
      push(action.params.item, "item");
    } else if (action.kind === "start_quest") {
      push(action.params.quest ?? action.params.questName, "quest");
    } else if (action.kind === "complete_quest") {
      push(action.params.questName ?? action.params.questId, "quest");
      push(action.params.reward, "item");
    }
  }
  return out;
}

const ITEM_COLOR = "#d4b86a";
const PRICE_COLOR = "#e0c872";
const QUEST_COLOR = "#a0b8f0";
const PRICE_RE = /\b\d+\s*gold\b/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Span {
  start: number;
  end: number;
  color: string;
  bold: boolean;
}

/**
 * Render `text` into `el`, wrapping recognised tokens (item names, quest
 * titles, and "<n> gold" prices) in coloured spans. Built entirely from DOM
 * text nodes / spans — never innerHTML — so dialogue text cannot inject markup.
 */
export function applyHighlightedText(el: HTMLElement, text: string, highlights: Highlight[]): void {
  el.textContent = "";

  const spans: Span[] = [];
  const addMatches = (re: RegExp, color: string, bold: boolean): void => {
    for (const m of text.matchAll(re)) {
      if (m.index === undefined) continue;
      spans.push({ start: m.index, end: m.index + m[0].length, color, bold });
    }
  };

  for (const h of highlights) {
    const color = h.kind === "quest" ? QUEST_COLOR : ITEM_COLOR;
    addMatches(new RegExp(escapeRegExp(h.value), "gi"), color, h.kind === "quest");
  }
  addMatches(PRICE_RE, PRICE_COLOR, false);

  // Resolve overlaps: earliest start wins, drop anything that overlaps it.
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const chosen: Span[] = [];
  let cursor = 0;
  for (const span of spans) {
    if (span.start < cursor) continue;
    chosen.push(span);
    cursor = span.end;
  }

  if (chosen.length === 0) {
    el.textContent = text;
    return;
  }

  let pos = 0;
  for (const span of chosen) {
    if (span.start > pos) {
      el.appendChild(document.createTextNode(text.slice(pos, span.start)));
    }
    const mark = document.createElement("span");
    mark.textContent = text.slice(span.start, span.end);
    mark.style.color = span.color;
    if (span.bold) mark.style.fontWeight = "700";
    el.appendChild(mark);
    pos = span.end;
  }
  if (pos < text.length) {
    el.appendChild(document.createTextNode(text.slice(pos)));
  }
}
