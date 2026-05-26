# Architecture Plan: Unified Physics & Agentic World Building

## 1. Overview
This plan outlines the total removal of the current "Hybrid" physics system (Math-based terrain + Kinematic AABB sweeps) and its replacement with a **Unified Physics Simulation**. This new architecture is designed to be **Agent-Friendly**, allowing natural language prompts to modify the world, textures, and terrain with 100% reliable collision detection.

### Core Problems Being Solved:
1.  **Split-Brain Physics:** Ground height is currently "calculated," while buildings are "simulated," causing jitter and clipping.
2.  **Box-Only Collision:** Complex cities are currently treated as big boxes, preventing players from entering buildings or climbing stairs.
3.  **Black-Box Generation:** The procedural math is hard to modify via agent prompts.

---

## Phase 1: The "World Manifest" (Agent Interface)
**Goal:** Create a data-driven layer that an agent can easily edit to modify the world.

### Step 1.1: Define `WorldManifest.ts`
- Create a central registry for all "authored" content.
- Support for `Landmarks` (cities, dungeons), `NPCs`, and `Biomes`.
- **Agent Action:** The agent will add/remove JSON entries here to change the world.

### Step 1.2: Manifest-Driven Spawning
- Refactor `WorldGenerator.ts` to listen to the manifest.
- Implement **Exclusion Zones**: If a landmark is in the manifest, the procedural "noise" generator is suppressed in that area.

---

## Phase 2: The Unified Physics Engine
**Goal:** Replace manual math with a high-fidelity `cannon-es` simulation.

### Step 2.1: Terrain Heightfield Integration
- Convert Three.js terrain chunks into `CANNON.Heightfield` bodies.
- Instead of `getHeightAt(x, z)` math, the player's vertical position is determined by actual physical contact with the ground.
- **Benefit:** 100% accurate ground collision, even on steep cliffs or jagged terrain.

### Step 2.2: Authored Content "Trimeshes"
- Implement an automated pipeline to convert GLTF models (cities, towers) into `CANNON.Trimesh`.
- **Benefit:** Players can walk up stairs, through doorways, and along narrow ramparts. No more "invisible walls."

### Step 2.3: Physics-First Player Controller
- Replace the current "Kinematic" controller with a **Dynamic Body** (Sphere or Capsule).
- Movement is applied via `velocity` or `impulses`.
- **Benefit:** Smooth sliding against walls, natural gravity, and zero jitter.

---

## Phase 3: Agentic Terrain & Texture Injection
**Goal:** Allow the agent to "explain" new terrain and swap textures dynamically.

### Step 3.1: Texture Atlas & Shader Injection
- Update `Terrain.ts` to use a dynamic texture mapping system.
- Allow the manifest to specify texture URLs (e.g., `"/textures/custom_grass.png"`).
- The agent can "import" a texture by simply providing the URL in the manifest.

### Step 3.2: Noise Parameterization
- Move all "hardcoded" noise math (sin/cos frequencies) into the `WorldManifest` biome settings.
- **Agent Action:** The agent can prompt: *"Make the Tundra biome have sharper, higher peaks"* → The agent updates `frequency` and `amplitude` values in the manifest.

---

## Phase 4: Scalability & Optimization
**Goal:** Ensure the system handles hundreds of cities and huge maps.

### Step 4.1: Physics Chunking (Spatial Hash)
- Implement a `PhysicsChunkManager` that only activates Cannon-es bodies within a 200m radius of the player.
- **Benefit:** Infinite world support with constant-time physics performance.

### Step 4.2: Physics LOD (Level of Detail)
- Implement simplified collision shapes for distant objects or minor props (e.g., using AABBs for distant trees but Trimeshes for the building the player is in).
- **Benefit:** Reduces the triangle count in the physics simulation significantly.

### Step 4.3: Network Sync Readiness (MMORPG)
- Design the `PhysicsPlayerController` to support **Input Buffering** and **State Snapshots**.
- While the client remains authoritative for this prototype, the architecture must allow the Server to run the same `CANNON.World` for future authoritative verification.
- **Continuous Collision Detection (CCD):** Enable CCD for the player body to prevent "glitching" through thin walls during lag or high-speed movement.

---

## Implementation Sequence (Step-by-Step)

1.  **Surgical Removal:** Clear out `CollisionSystem.ts` and the manual collision calls in `PlayerController.ts`.
2.  **Core Simulation:** Instantiate a clean `CANNON.World` with a proper fixed time-step loop.
3.  **Grounding:** Hook `Terrain.ts` chunk generation into the physics world as `Heightfields`.
4.  **The Manifest:** Create the first `WorldManifest.json` and migrate `FortMalaka` into it.
5.  **Dynamic Player:** Implement the new `PhysicsPlayerController` using the dynamic body.
6.  **Trimesh Baking:** Implement the model-to-collision converter for the cities.

---

## Validation Strategy
- **Collision Test:** Player must walk up a 45-degree slope without jitter.
- **Interior Test:** Player must enter a building and stand on the second floor (Trimesh validation).
- **Agent Test:** Add a "test city" via manifest edit and verify it appears with collision active.
