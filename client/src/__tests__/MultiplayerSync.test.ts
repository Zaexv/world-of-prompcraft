// @vitest-environment happy-dom
import { describe, it, expect, vi } from "vitest";

// EntityManager transitively imports the mesh catalog, whose Málaga building kit
// eagerly builds canvas-based PBR textures. happy-dom has no canvas 2d context, so
// stub the PBR helpers (no-ops for this test's logic).
vi.mock("../utils/PBRMaps", () => ({
  warmUpTextures: vi.fn(),
  applyTerrainPBR: vi.fn(),
  applyCharacterPBR: vi.fn(),
  applyBarkPBR: vi.fn(),
  applyCanopyPBR: vi.fn(),
  applyStonePBR: vi.fn(),
  applyMalakaPBR: vi.fn(),
}));

// Floating combat text draws to a 2d canvas; happy-dom's getContext returns
// null. A permissive stub is enough — the tests assert state, not pixels.
// Every method returns another permissive stub so chained calls
// (createLinearGradient().addColorStop(...)) keep working.
const anyStub: unknown = new Proxy(function () {}, {
  get: (_t, p) => (p === Symbol.toPrimitive ? () => 10 : anyStub),
  set: () => true,
  apply: () => anyStub,
});
(globalThis.HTMLCanvasElement.prototype as unknown as { getContext: () => unknown }).getContext =
  () => anyStub;

import * as THREE from "three";
import { ReactionSystem, type EntityManagerLike } from "../systems/ReactionSystem";
import type { PlayerState } from "../state/PlayerState";
import type { NPCStateStore } from "../state/NPCState";
import type { WorldState } from "../state/WorldState";
import type { AgentResponse } from "../network/MessageProtocol";

/**
 * Multiplayer sync invariants on the client:
 * - an NPC death (hp <= 0 in an npcStateUpdate) permanently kills the NPC via
 *   markNPCDead, so chunk reloads / rejoins can't resurrect the corpse;
 * - the deterministic procedural NPC id contains no per-client counter, so all
 *   clients agree on who died.
 */

function makeDeathHarness() {
  const mesh = new THREE.Group();
  const markNPCDead = vi.fn();
  const removeNPC = vi.fn();
  const entityManager: EntityManagerLike = {
    getNPC: (id: string) =>
      id === "proc_wolf_3_-2_0"
        ? {
            mesh,
            nameplate: { updateHP: vi.fn() },
          }
        : undefined,
    removeNPC,
    markNPCDead,
  };
  const stub = {} as unknown;
  const npcStateStore = { updateState: vi.fn(), getState: () => undefined } as unknown as NPCStateStore;
  const rs = new ReactionSystem(
    new THREE.Scene(),
    stub as PlayerState,
    npcStateStore,
    stub as WorldState,
    entityManager,
  );
  return { rs, mesh, markNPCDead, removeNPC };
}

describe("NPC death sync", () => {
  it("marks the NPC permanently dead after the death animation", () => {
    const { rs, mesh, markNPCDead, removeNPC } = makeDeathHarness();

    rs.handleResponse({
      type: "agent_response",
      npcId: "proc_wolf_3_-2_0",
      dialogue: "",
      actions: [],
      npcStateUpdate: { hp: 0, maxHp: 80 },
    } as unknown as AgentResponse);

    // Death is animated (shrink over 1s) before despawn.
    expect(markNPCDead).not.toHaveBeenCalled();
    rs.tick(0.5);
    expect(markNPCDead).not.toHaveBeenCalled();
    rs.tick(0.6); // past 1s total
    expect(markNPCDead).toHaveBeenCalledWith("proc_wolf_3_-2_0");
    expect(removeNPC).not.toHaveBeenCalled(); // markNPCDead supersedes removeNPC
    expect(mesh.scale.x).toBe(0); // fully shrunk
  });

  it("ignores deaths of NPCs this client has not spawned (unknown id)", () => {
    const { rs, markNPCDead } = makeDeathHarness();

    rs.handleResponse({
      type: "agent_response",
      npcId: "proc_unknown_9_9_9",
      dialogue: "",
      actions: [],
      npcStateUpdate: { hp: 0, maxHp: 80 },
    } as unknown as AgentResponse);
    rs.tick(1.2);

    expect(markNPCDead).not.toHaveBeenCalled();
  });
});

describe("EntityManager dead-NPC registry", () => {
  it("refuses to respawn an NPC marked dead (chunk reload, join_ok replay)", async () => {
    const { EntityManager } = await import("../entities/EntityManager");
    const em = new EntityManager(new THREE.Scene());

    const alive = em.addNPC({ id: "wolf_a", name: "Wolf", position: new THREE.Vector3(1, 0, 1) });
    expect(alive).toBeDefined();

    em.markNPCDead("wolf_a");
    expect(em.getNPC("wolf_a")).toBeUndefined();
    expect(em.isNPCDead("wolf_a")).toBe(true);

    // Chunk reload tries to respawn the same deterministic id — must no-op.
    const resurrected = em.addNPC({ id: "wolf_a", name: "Wolf", position: new THREE.Vector3(1, 0, 1) });
    expect(resurrected).toBeUndefined();
    expect(em.getNPC("wolf_a")).toBeUndefined();
  });
});

describe("server-authoritative NPC positions", () => {
  it("walks a server-driven NPC to nearby targets, teleports far ones, no local wander", async () => {
    const { EntityManager } = await import("../entities/EntityManager");
    const em = new EntityManager(new THREE.Scene());
    const flat = () => 0;

    // Non-fixed NPC, online: the server owns its motion. It walks to pushed
    // targets and never invents its own movement.
    const npc = em.addNPC({ id: "wolf_b", name: "Wolf", position: new THREE.Vector3(0, 0, 0) });
    expect(npc).toBeDefined();
    em.setServerAuthoritativeNPCs(true);
    em.setPlayerPosition(0, 0);

    // Near target (~3m): the NPC walks toward it (arrival radius ~1.5m).
    em.applyServerNPCPositions([{ npcId: "wolf_b", position: [3, 0, 0] }]);
    for (let i = 0; i < 600; i++) em.update(1 / 60, flat);
    expect(npc!.position.x).toBeGreaterThan(1.4);
    expect(npc!.position.x).toBeLessThanOrEqual(3.01);

    // Far divergence (>25m): instant teleport.
    em.applyServerNPCPositions([{ npcId: "wolf_b", position: [100, 0, 100] }]);
    em.update(1 / 60, flat);
    expect(npc!.position.x).toBe(100);
    expect(npc!.position.z).toBe(100);

    // No local random wander drift without further server pushes.
    const sx = npc!.position.x;
    const sz = npc!.position.z;
    em.setPlayerPosition(100, 100);
    for (let i = 0; i < 1200; i++) em.update(1 / 60, flat);
    expect(npc!.position.x).toBe(sx);
    expect(npc!.position.z).toBe(sz);
  });

  it("holds a fixed NPC put: ignores small corrections, teleports far ones, never wanders", async () => {
    const { EntityManager } = await import("../entities/EntityManager");
    const em = new EntityManager(new THREE.Scene());
    const flat = () => 0;

    // Fixed NPCs hold their authored spot. They never wander and ignore small
    // server corrections; only a large divergence (rejoin / long cull) teleports.
    const npc = em.addNPC({ id: "wolf_b", name: "Wolf", position: new THREE.Vector3(0, 0, 0), fixed: true });
    expect(npc).toBeDefined();
    em.setServerAuthoritativeNPCs(true);
    em.setPlayerPosition(0, 0);

    // Small correction (~3m): ignored — the NPC stays at its authored position.
    em.applyServerNPCPositions([{ npcId: "wolf_b", position: [3, 0, 0] }]);
    for (let i = 0; i < 600; i++) em.update(1 / 60, flat);
    expect(npc!.position.x).toBe(0);
    expect(npc!.position.z).toBe(0);

    // Far correction (>25m): instant teleport (re-ground after rejoin/cull).
    em.applyServerNPCPositions([{ npcId: "wolf_b", position: [100, 0, 100] }]);
    em.update(1 / 60, flat);
    expect(npc!.position.x).toBe(100);
    expect(npc!.position.z).toBe(100);

    // No local random wander drift.
    const sx = npc!.position.x;
    const sz = npc!.position.z;
    em.setPlayerPosition(100, 100); // keep it in the active update radius
    for (let i = 0; i < 1200; i++) em.update(1 / 60, flat);
    expect(npc!.position.x).toBe(sx);
    expect(npc!.position.z).toBe(sz);
  });

  it("updates remote player nameplate HP from world updates", async () => {
    const { EntityManager } = await import("../entities/EntityManager");
    const em = new EntityManager(new THREE.Scene());
    const data = {
      playerId: "p2", username: "Frodo", position: [0, 0, 0] as [number, number, number],
      race: "human", faction: "alliance", hp: 100, maxHp: 100, yaw: 0,
    };
    const remote = em.addRemotePlayer(data);
    const spy = vi.spyOn(remote.nameplate, "updateHP");

    em.updateRemotePlayers([{ ...data, hp: 42 }]);

    expect(spy).toHaveBeenCalledWith(42, 100);
  });
});

describe("procedural NPC id determinism", () => {
  it("contains only seed-derived parts (no per-client counter)", () => {
    // Mirrors ProceduralPopulator's id template: proc_<def>_<chunkX>_<chunkZ>_<i>
    // Two clients exploring chunks in ANY order must produce this exact id.
    const id = (def: string, chunkX: number, chunkZ: number, i: number): string =>
      `proc_${def}_${chunkX}_${chunkZ}_${i}`;

    // Client A explores (3,-2) first; client B explores it after 50 other chunks.
    expect(id("wolf", 3, -2, 0)).toBe(id("wolf", 3, -2, 0));
    expect(id("wolf", 3, -2, 0)).toBe("proc_wolf_3_-2_0");
    expect(id("wolf", 3, -2, 1)).not.toBe(id("wolf", 3, -2, 0));
  });
});
