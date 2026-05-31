# Pull Request: Zonal Hybrid World Engine & Scalable Population Sync

## 🚀 Overview
This PR represents a major architectural milestone for World of Promptcraft. It transforms the world from a hardcoded procedural prototype into a professional, **data-driven game engine**. The core of this update is the **Version 2.1.0 Zonal Hybrid Manifest system**, which provides a scalable, server-authoritative foundation for all future world expansion.

## 🏗️ Major Architectural Changes

### 1. Zonal Hybrid Manifest (V2.1.0)
- **Centralized Source of Truth**: Moved all world data (Biomes, Topology, Population, Architecture) into a single physical file: `shared/data/world_manifest.json`.
- **Zonal Organization**: The world is now divided into logical **Zones** (e.g., `teldrassil_central`, `fort_malaka`). This allows for easy navigation and management as the generative world grows.
- **Component-Based Data Model**: NPCs and landmarks now use a structured component schema (`identity`, `transform`, `stats`, `ai`), mirroring modern engine standards.

### 2. Unified FE <> BE Synchronization
- **Physical Sharing**: Created a root-level `shared/` directory mounted into both Client and Server containers. Both systems now point to the exact same physical manifest on disk.
- **Synchronous Boot**: Refactored the frontend bootstrap to wait for the manifest import before engine initialization, eliminating race conditions.
- **Hot-Reloading**: The server now refreshes its internal NPC registry and AI agents from the manifest on every player join, enabling real-time population changes without restarts.

### 3. Physics & Engine Overhaul
- **BVH-Accelerated Collisions**: Fully implemented `three-mesh-bvh` for static landmarks. 
- **Idempotent Spawning**: Objects are now correctly re-registered for physics when terrain chunks reload, ensuring permanent collisions.
- **AI Navigation**: Implemented `isPositionBlocked()` using fast AABB broadphase queries, allowing NPCs to navigate intelligently around buildings.
- **Distance Culling**: Implemented object distance culling at **180 units**, perfectly aligned with the exponential fog for optimal performance.

### 4. NPC & World Polish
- **Tutorial-Man**: Added a friendly guide at spawn with a unique procedural "civilian" style.
- **Dynamic Ground Snapping**: Implemented a robust `isGrounded` system that ensures all NPCs snap to the terrain surface the moment their chunk is loaded.
- **Active AI Wandering**: Enhanced the `stroll` motion profile with reduced pause times and increased speeds for a more "alive" feel.
- **Tabula Rasa Cleanup**: Removed thousands of lines of legacy hardcoded systems (Boats, Fort Malaka terrain, old procedural spawners) to ensure a clean, manifest-driven baseline.

## 🛠️ New Developer Tools
- **`agentic-world-designer` Skill**: Upgraded AI skill that allows the World Spirit to reshape biomes, build mountains, and place cities via the manifest.
- **`npc-registry-manager` Skill**: A specialized skill for rapid dev-time population management (Add/Remove NPCs across zones).

## 🧪 Verification & Quality
- **Pre-commit Checks**: Passed all ESLint, Ruff, and TypeScript static analysis.
- **Client Tests**: 72/72 Vitest cases passing, including new physics integration and capsule math tests.
- **Server Tests**: 50/50 Pytest cases passing, updated to reflect the new zonal population model.
- **Sync Reliability**: Verified manifest synchronization across local dev (Vite) and Docker Compose environments.

## 🗂️ Project Structure Update
```
world-of-prompcraft/
├── shared/data/world_manifest.json    # Master blueprint (The "Brain")
├── client/src/state/WorldManifest.ts  # Manifest hydration & rendering
├── server/src/world/npc_definitions.py# AI population registry
└── ...
```
