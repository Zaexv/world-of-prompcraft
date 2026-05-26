# Parallel Implementation Plan: `three-mesh-bvh` & WorldBuilder Pipeline

This document outlines the parallel execution strategy for **3 Sub-Agents** to rebuild the world and physics systems from a clean slate.

---

## 🌌 Phase 0: Tabula Rasa (Total World Reset) - [DONE]
**Goal:** Remove all hardcoded legacy content to ensure the new data-driven systems are the sole source of truth.

- **[DONE] Remove Hardcoded Landmarks:** Delete or disable the manual registrations of `FortMalaka`, `Buildings` (the initial batch), and the `SuarezlandsMountain` in `SceneManager.ts` and `WorldGenerator.ts`.
- **[DONE] Clear Procedural Spawners:** Reset the `WorldGenerator` hash-based logic to its bare essentials (Terrain only) until the new Manifest-driven spawning is ready.
- **[DONE] Physics Purge:** Complete removal of `CollisionSystem.ts` and all `cannon-es` imports.

---

## 🛠 World Extension Strategy (The Core Feature)
The world is extended via two primary channels:
1.  **Authored Landmarks (Large Scale):** The `WorldManifest.ts` allows an agent to "carve out" space for persistent cities, dungeons, and zones. Adding a new continent is as simple as adding a JSON entry.
2.  **Agentic WorldBuilding (Fine Grained):** The prompt-to-object pipeline allows players/agents to place objects, furniture, and decorations anywhere. These are stored in `localStorage` and synced via `world_modify_chunk` messages.

---

## 🟢 Agent 1: The Collision Foundation (Core & Broadphase) - [DONE]
**Goal:** Implement the new physics infrastructure and the "Tabula Rasa" cleanup.

### Task 1.1: The Reset & Core Types - [DONE]
- **[DONE] Tabula Rasa:** Remove `FortMalaka` and other hardcoded groups from `SceneManager`.
- **[DONE] Dependencies:** Run `npm install three-mesh-bvh` and `npm uninstall cannon-es` in the `client` directory.
- **[DONE] Types (`client/src/systems/collision/types.ts`):** Define `AABB`, `OBB`, `CollisionBody`, `ContactPoint`, `Capsule`, and `TriggerVolume`.
- **[DONE] Monkey-Patch:** Update `main.ts` to attach `computeBoundsTree` to `THREE.BufferGeometry`.

### Task 1.2: Broadphase & BVH Construction - [DONE]
- **[DONE] BVH Wrapper (`client/src/systems/collision/BVH.ts`):** Implement the scene-level spatial acceleration structure.
- **[DONE] OBB Fallback (`client/src/systems/collision/OBB.ts`):** Implement 8-corner construction and SAT (Separating Axis Theorem) narrow phase for 15 axes.
- **[DONE] Body Factory:** Implement the asynchronous `mesh.geometry.computeBoundsTree()` logic.

### Task 1.3: Façade and Debug Overlay - [DONE]
- **[DONE] `CollisionSystem.ts` Façade:** Rewrite the main class while keeping the public API identical.
- **[DONE] Debug Overlay (`client/src/systems/collision/CollisionDebug.ts`):** Create the `Alt+C` visualizer to show real-time collision wireframes (Green=BVH, Yellow=OBB, Cyan=AABB).

---

## 🔵 Agent 2: The Kinematic Solver (Character Controller) - [DONE]
**Goal:** Implement the math-heavy Capsule Controller to provide AAA-quality movement.

### Task 2.1: Capsule & Contact Solver - [DONE]
- **[DONE] Capsule (`client/src/systems/collision/Capsule.ts`):** Define the player's 1.8m x 0.35m capsule.
- **[DONE] Contact Solver (`client/src/systems/collision/ContactSolver.ts`):** Implement the narrow phase algorithm using `bvh.shapecast(capsuleShape)`.

### Task 2.2: Movement Resolution Algorithms - [DONE]
- **[DONE] Slope Solver (`client/src/systems/collision/SlopeSolver.ts`):** Classify contacts (floor/ceiling/wall) and handle slope sliding.
- **[DONE] Step Detector (`client/src/systems/collision/StepDetector.ts`):** Implement the "Two-Probe" algorithm for 0.5m curb stepping.
- **[DONE] Ground Snap (`client/src/systems/collision/GroundSnap.ts`):** Implement downward raycasting for terrain-sticking.

### Task 2.3: Controller Integration - [DONE]
- **[DONE] `CapsuleController.ts`:** Combine Gravity, Swept Movement, Ground Snapping, and Step Detection into one cohesive function.
- **[DONE] `PlayerController.ts` Integration:** Swap the old movement resolver with the new Capsule flow.

---

## 🟡 Agent 3: WorldBuilder & Agentic Pipeline - [DONE]
**Goal:** Implement the world extension tools (Object Library, Persistence, and Streaming).

### Task 3.1: Object Library & Manifest - [DONE]
- **[DONE] World Manifest:** Implement `client/src/state/WorldManifest.ts` to replace the hardcoded landmarks deleted in Phase 0.
- **[DONE] Factories (`client/src/systems/worldbuilder/objects/`):** Implement the categorized object hierarchy (`structures/`, `vegetation/`, `furniture/`, etc.).
- **[DONE] Persistence:** Implement `WorldBuilderPersistence.ts` using `localStorage`.

### Task 3.2: Streaming Protocol & WebSocket - [DONE]
- **[DONE] `MessageProtocol.ts`:** Add types for `world_modify_start`, `world_modify_chunk`, and `world_modify_end`.
- **[DONE] Integration:** Update `WebSocketHandler.ts` to parse streaming blueprint chunks.

### Task 3.3: UI Panel & Undo Stack - [DONE]
- **[DONE] Undo/Redo:** Implement the snapshot stack (`Ctrl+Z` / `Ctrl+Shift+Z`) within the World Builder state.
- **[DONE] `WorldBuilderPanel.ts`:** Add image drag/drop, streaming progress bars, and the build history log.

---

## 🏁 Interface Contracts & Milestones
- **Agent 1 ➜ Agent 2:** Provides the spatial registry and BVH trees.
- **Agent 3 ➜ Agent 1:** Ensures all new objects are tagged with `userData.isCollider = true` for automatic BVH baking.
- **Shared Validation:** Start from an empty world (0), add a city via prompt, and verify the player can walk through it with perfect collision.

---

## 🔧 Post-Implementation Fixes (Current)
**Goal:** Resolve CI failures and verify Tabula Rasa and Collision functionality.

- **[DONE] ESLint & TS Fixes:** Resolved unused variable and implicit any warnings in `BVH.ts`, `GameBootstrapper.ts`, and `WorldManifest.ts` to fix CI pipeline.
- **[DONE] BVH Shapecast Fix:** Implemented the actual `three-mesh-bvh` logic in `BVH.ts` (replaced the placeholder) so that mesh collisions function correctly.
- **[DONE] Tabula Rasa Purge:** Cleared procedural spawning logic from `Vegetation.ts` and removed hardcoded `NPC_CONFIGS` from `GameBootstrapper.ts` to enforce a clean 0-state world.
