// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { QuestLog } from "../ui/QuestLog";
import { PlayerState } from "../state/PlayerState";

function serverQuest(): Record<string, unknown> {
  return {
    id: "village_patrol",
    title: "Village Patrol",
    description: "Defend the village.",
    giver_npc_id: "guard_01",
    giver_name: "Captain Aldric",
    origin: "curated",
    status: "active",
    objectives: [
      {
        id: "k",
        description: "Defeat 3 creatures",
        kind: "kill",
        target: "any",
        required: 3,
        progress: 1,
        completed: false,
      },
    ],
    reward: { gold: 50, items: ["Guard's Badge"], xp: 40, description: "" },
  };
}

describe("QuestLog rendering (server instances, no client registry)", () => {
  let state: PlayerState;

  beforeEach(() => {
    document.body.innerHTML = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PlayerState as any)._instance = null;
    state = PlayerState.getInstance();
  });

  it("renders an active quest with progress counts and reward", () => {
    state.acceptQuest(serverQuest());
    const log = new QuestLog();
    log.update(state);
    const text = log.element.textContent ?? "";
    expect(text).toContain("Village Patrol");
    expect(text).toContain("(1/3)");
    expect(text).toContain("Reward:");
    expect(text).toContain("50 gold");
    expect(text).toContain("Guard's Badge");
    expect(text).toContain("Captain Aldric");
  });

  it("labels a completed quest using the retained name (no registry lookup)", () => {
    state.acceptQuest(serverQuest());
    state.completeQuest("village_patrol");
    const log = new QuestLog();
    log.update(state);
    const text = log.element.textContent ?? "";
    expect(text).toContain("Village Patrol");
    expect(text).toContain("Completed (1)");
  });

  it("shows an empty state with no quests", () => {
    const log = new QuestLog();
    log.update(state);
    const text = log.element.textContent ?? "";
    expect(text).toContain("No active quests");
  });
});
