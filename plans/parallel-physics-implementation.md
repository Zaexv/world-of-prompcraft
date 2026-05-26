# Parallel Implementation Plan: `three-mesh-bvh` & WorldBuilder Pipeline

This document outlines the parallel execution strategy for **3 Sub-Agents** to rebuild the world and physics systems from a clean slate.

---

## 🌌 Phase 0: Tabula Rasa (Total World Reset)
**Goal:** Remove all hardcoded legacy content to ensure the new data-driven systems are the sole source of truth.

- **Remove Hardcoded Landmarks:** Delete or disable the manual registrations of `FortMalaka`, `Buildings` (the initial batch), and the `SuarezlandsMountain` in `SceneManager.ts` and `WorldGenerator.ts`.
- **Clear Procedural Spawners:** Reset the `WorldGenerator` hash-based logic to its bare essentials (Terrain only) until the new Manifest-driven spawning is ready.
- **Physics Purge:** Complete removal of `CollisionSystem.ts` and all `cannon-es` imports.

---

## 🛠 World Extension Strategy (The Core Feature)
The world is extended via two primary channels:
1.  **Authored Landmarks (Large Scale):** The `WorldManifest.ts` allows an agent to "carve out" space for persistent cities, dungeons, and zones. Adding a new continent is as simple as adding a JSON entry.
2.  **Agentic WorldBuilding (Fine Grained):** The prompt-to-object pipeline allows players/agents to place objects, furniture, and decorations anywhere. These are stored in `localStorage` and synced via `world_modify_chunk` messages.

---

## 🟢 Agent 1: The Collision Foundation (Core & Broadphase)
**Goal:** Implement the new physics infrastructure and the "Tabula Rasa" cleanup.

### Task 1.1: The Reset & Core Types
- **Tabula Rasa:** Remove `FortMalaka` and other hardcoded groups from `SceneManager`.
- **Dependencies:** Run `npm install three-mesh-bvh` and `npm uninstall cannon-es` in the `client` directory.
- **Types (`client/src/systems/collision/types.ts`):** Define `AABB`, `OBB`, `CollisionBody`, `ContactPoint`, `Capsule`, and `TriggerVolume`.
- **Monkey-Patch:** Update `main.ts` to attach `computeBoundsTree` to `THREE.BufferGeometry`.

### Task 1.2: Broadphase & BVH Construction
- **BVH Wrapper (`client/src/systems/collision/BVH.ts`):** Implement the scene-level spatial acceleration structure.
- **OBB Fallback (`client/src/systems/collision/OBB.ts`):** Implement 8-corner construction and SAT (Separating Axis Theorem) narrow phase for 15 axes.
- **Body Factory:** Implement the asynchronous `mesh.geometry.computeBoundsTree()` logic.

### Task 1.3: Façade and Debug Overlay
- **`CollisionSystem.ts` Façade:** Rewrite the main class while keeping the public API identical.
- **Debug Overlay (`client/src/systems/collision/CollisionDebug.ts`):** Create the `Alt+C` visualizer to show real-time collision wireframes (Green=BVH, Yellow=OBB, Cyan=AABB).

---

## 🔵 Agent 2: The Kinematic Solver (Character Controller)
**Goal:** Implement the math-heavy Capsule Controller to provide AAA-quality movement.

### Task 2.1: Capsule & Contact Solver
- **Capsule (`client/src/systems/collision/Capsule.ts`):** Define the player's 1.8m x 0.35m capsule.
- **Contact Solver (`client/src/systems/collision/ContactSolver.ts`):** Implement the narrow phase algorithm using `bvh.shapecast(capsuleShape)`.

### Task 2.2: Movement Resolution Algorithms
- **Slope Solver (`client/src/systems/collision/SlopeSolver.ts`):** Classify contacts (floor/ceiling/wall) and handle slope sliding.
- **Step Detector (`client/src/systems/collision/StepDetector.ts`):** Implement the "Two-Probe" algorithm for 0.5m curb stepping.
- **Ground Snap (`client/src/systems/collision/GroundSnap.ts`):** Implement downward raycasting for terrain-sticking.

### Task 2.3: Controller Integration
- **`CapsuleController.ts`:** Combine Gravity, Swept Movement, Ground Snapping, and Step Detection into one cohesive function.
- **`PlayerController.ts` Integration:** Swap the old movement resolver with the new Capsule flow.

---

## 🟡 Agent 3: WorldBuilder & Agentic Pipeline
**Goal:** Implement the world extension tools (Object Library, Persistence, and Streaming).

### Task 3.1: Object Library & Manifest
- **World Manifest:** Implement `client/src/state/WorldManifest.ts` to replace the hardcoded landmarks deleted in Phase 0.
- **Factories (`client/src/systems/worldbuilder/objects/`):** Implement the categorized object hierarchy (`structures/`, `vegetation/`, `furniture/`, etc.).
- **Persistence:** Implement `WorldBuilderPersistence.ts` using `localStorage`.

### Task 3.2: Streaming Protocol & WebSocket
- **`MessageProtocol.ts`:** Add types for `world_modify_start`, `world_modify_chunk`, and `world_modify_end`.
- **Integration:** Update `WebSocketHandler.ts` to parse streaming blueprint chunks.

### Task 3.3: UI Panel & Undo Stack
- **Undo/Redo:** Implement the snapshot stack (`Ctrl+Z` / `Ctrl+Shift+Z`) within the World Builder state.
- **`WorldBuilderPanel.ts`:** Add image drag/drop, streaming progress bars, and the build history log.

---

## 🏁 Interface Contracts & Milestones
- **Agent 1 ➜ Agent 2:** Provides the spatial registry and BVH trees.
- **Agent 3 ➜ Agent 1:** Ensures all new objects are tagged with `userData.isCollider = true` for automatic BVH baking.
- **Shared Validation:** Start from an empty world (0), add a city via prompt, and verify the player can walk through it with perfect collision.
