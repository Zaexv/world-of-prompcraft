import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { ReactionSystem, type EntityManagerLike } from "../systems/ReactionSystem";
import type { PlayerState } from "../state/PlayerState";
import type { NPCStateStore } from "../state/NPCState";
import type { WorldState } from "../state/WorldState";

function makeSystem(): ReactionSystem {
  const stub = {} as unknown;
  const entityManager = { getNPC: () => undefined } as unknown as EntityManagerLike;
  return new ReactionSystem(
    new THREE.Scene(),
    stub as PlayerState,
    stub as NPCStateStore,
    stub as WorldState,
    entityManager,
  );
}

describe("ReactionSystem.isAttackPrompt", () => {
  it("detects attack keywords (case-insensitive)", () => {
    const rs = makeSystem();
    expect(rs.isAttackPrompt("I attack you with my weapon!")).toBe(true);
    expect(rs.isAttackPrompt("I cast fireball at the dragon")).toBe(true);
    expect(rs.isAttackPrompt("SWING my axe")).toBe(true);
    expect(rs.isAttackPrompt("freeze it solid")).toBe(true);
  });

  it("ignores non-combat prompts", () => {
    const rs = makeSystem();
    expect(rs.isAttackPrompt("Hello, how are you?")).toBe(false);
    expect(rs.isAttackPrompt("Do you have any quests for me?")).toBe(false);
    expect(rs.isAttackPrompt("Show me what you have for sale")).toBe(false);
  });
});
