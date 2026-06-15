import { describe, it, expect, beforeEach } from "vitest";
import { PlayerState } from "../state/PlayerState";

/** A server storage-shaped quest instance (snake_case). */
function serverQuest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "crystal_tear",
    title: "The Crystal Tear",
    description: "Retrieve the shard.",
    giver_npc_id: "sage_01",
    giver_name: "Elyria the Sage",
    origin: "curated",
    status: "active",
    objectives: [
      {
        id: "kill_hostiles",
        description: "Defeat 3 creatures",
        kind: "kill",
        target: "any",
        required: 3,
        progress: 0,
        completed: false,
      },
      {
        id: "return_elyria",
        description: "Return to Elyria",
        kind: "talk",
        target: "sage_01",
        required: 1,
        progress: 0,
        completed: false,
      },
    ],
    reward: { gold: 80, items: ["Amulet of Clarity"], xp: 70, description: "Shiny." },
    ...overrides,
  };
}

describe("PlayerState quests (server-authoritative)", () => {
  let state: PlayerState;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PlayerState as any)._instance = null;
    state = PlayerState.getInstance();
  });

  it("acceptQuest normalizes a server instance with no client registry", () => {
    state.acceptQuest(serverQuest());
    expect(state.activeQuests).toHaveLength(1);
    const q = state.activeQuests[0];
    expect(q.name).toBe("The Crystal Tear");
    expect(q.giverName).toBe("Elyria the Sage");
    expect(q.objectives[0].kind).toBe("kill");
    expect(q.objectives[0].required).toBe(3);
    expect(q.reward.gold).toBe(80);
    expect(q.reward.items).toEqual(["Amulet of Clarity"]);
  });

  it("acceptQuest dedupes by id", () => {
    state.acceptQuest(serverQuest());
    state.acceptQuest(serverQuest());
    expect(state.activeQuests).toHaveLength(1);
  });

  it("merge renders activeQuests from a server snapshot (camelCase)", () => {
    state.merge({
      // The server's to_dict emits client-shaped quests under activeQuests.
      activeQuests: [
        {
          id: "village_patrol",
          name: "Village Patrol",
          description: "Patrol.",
          giverNpc: "guard_01",
          giverName: "Captain Aldric",
          objectives: [
            {
              id: "k",
              description: "Kill",
              kind: "kill",
              target: "any",
              required: 3,
              progress: 1,
              completed: false,
            },
          ],
          reward: { gold: 50, items: ["Badge"], xp: 40, description: "" },
          origin: "curated",
          status: "active",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ] as any,
    });
    expect(state.activeQuests).toHaveLength(1);
    expect(state.activeQuests[0].objectives[0].progress).toBe(1);
    expect(state.getQuestName("village_patrol")).toBe("Village Patrol");
  });

  it("advanceObjective updates progress and completes at required", () => {
    state.acceptQuest(serverQuest());
    state.advanceObjective("crystal_tear", "kill_hostiles", 2);
    let obj = state.activeQuests[0].objectives[0];
    expect(obj.progress).toBe(2);
    expect(obj.completed).toBe(false);
    state.advanceObjective("crystal_tear", "kill_hostiles", 3);
    obj = state.activeQuests[0].objectives[0];
    expect(obj.completed).toBe(true);
  });

  it("completeQuest moves a quest to completed and retains its name", () => {
    state.acceptQuest(serverQuest());
    state.completeQuest("crystal_tear");
    expect(state.isQuestActive("crystal_tear")).toBe(false);
    expect(state.isQuestComplete("crystal_tear")).toBe(true);
    // Name cache survives so the quest log can label the completed entry.
    expect(state.getQuestName("crystal_tear")).toBe("The Crystal Tear");
  });

  it("getQuestName falls back to the id when unknown", () => {
    expect(state.getQuestName("unknown_quest")).toBe("unknown_quest");
  });

  it("merge caches completed-quest names from {id, name} objects (reload)", () => {
    // A returning player's snapshot: completed quests as objects, never seen
    // active this session. The name must still render (not the raw id).
    state.merge({ completedQuests: [{ id: "crystal_tear", name: "The Crystal Tear" }] });
    expect(state.isQuestComplete("crystal_tear")).toBe(true);
    expect(state.getQuestName("crystal_tear")).toBe("The Crystal Tear");
  });

  it("merge still accepts legacy string[] completedQuests", () => {
    state.merge({ completedQuests: ["old_quest"] });
    expect(state.isQuestComplete("old_quest")).toBe(true);
  });
});
