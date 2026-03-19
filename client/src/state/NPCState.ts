import type { NPCStateData } from "../network/MessageProtocol";

/**
 * Central store for all tracked NPC states.
 */
export class NPCStateStore {
  readonly states: Map<string, NPCStateData> = new Map();

  /** Called whenever any NPC state changes (receives the npcId that changed). */
  onChange: ((npcId: string, state: NPCStateData) => void) | null = null;

  getState(npcId: string): NPCStateData | undefined {
    return this.states.get(npcId);
  }

  updateState(npcId: string, partial: Partial<NPCStateData>): void {
    const existing = this.states.get(npcId) ?? {
      hp: 100,
      maxHp: 100,
      position: [0, 0, 0] as [number, number, number],
      mood: "neutral",
      relationship_score: 0,
    };

    const updated: NPCStateData = {
      hp: partial.hp ?? existing.hp,
      maxHp: partial.maxHp ?? existing.maxHp,
      position: partial.position ?? existing.position,
      mood: partial.mood ?? existing.mood,
      relationship_score: partial.relationship_score ?? existing.relationship_score,
    };

    this.states.set(npcId, updated);
    this.onChange?.(npcId, updated);
  }
}
