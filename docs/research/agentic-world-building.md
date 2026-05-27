# Research Report: Deterministic Agentic World Building

## Current State Analysis

1.  **WorldManifest (`client/src/state/WorldManifest.ts`)**:
    *   Currently a TypeScript class with hardcoded defaults.
    *   Manages `LandmarkDefinition` (id, type, position, scale, label).
    *   Provides an `addLandmark` method but lacks persistence to disk/server.

2.  **WorldGenerator (`client/src/systems/WorldGenerator.ts`)**:
    *   Orchestrates procedural content (trees, NPCs, towns).
    *   Currently has procedural spawners **disabled** for the "Tabula Rasa" phase.
    *   Needs to be re-wired to consume `WorldManifest` for deterministic spawning.

3.  **Extend-World Skill (`.claude/skills/extend-world/SKILL.md`)**:
    *   Provides expert guidance on adding manual content (Three.js patterns, colors, performance).
    *   Focuses on *developer* edits rather than *AI-driven* world evolution.

4.  **World Spirit Agent (`server/src/ws/handler.py`)**:
    *   Already has a `world_modify` tool.
    *   Uses `WorldBuilder` on the client to spawn objects.
    *   **Problem**: These objects are ephemeral (lost on refresh) because they don't persist to a manifest.

## Proposed "Agentic Map Creator" Strategy

### 1. Deterministic Persistence (The Manifest)
*   **Move to JSON**: Create `client/src/data/world_manifest.json` as the source of truth.
*   **Hydration**: Update `WorldManifest.ts` to fetch/load this JSON.
*   **Sync**: Implement a "Save Manifest" mechanism (via a new server endpoint or local file write during development) so that when an agent adds a landmark, it's written to the file.

### 2. Manifest-Driven Spawning
*   **WorldGenerator Update**: Instead of random procedural noise, `WorldGenerator` will query the `WorldManifest` for landmarks within the current chunk's bounds.
*   **Deterministic Seeds**: For "cities" (clusters of buildings), use a seed derived from the Landmark's ID and coordinates. This ensures that even if the city is "generated" procedurally, it looks identical every time the chunk loads.

### 3. Agentic Workflow (The Skill)
*   **New Skill: `agentic-map-creator`**: This skill will specialize in using the World Spirit's tools to build complex, lore-consistent areas.
*   **Integration with `extend-world`**: The `extend-world` skill will be updated to include instructions on how to define "Templates" (e.g., a "Small Elven Outpost" template) that the `agentic-map-creator` can then stamp onto the manifest.

### 4. Deterministic "City" Generator
*   Create a `CityBuilder` utility that takes a `LandmarkDefinition` and a `seed`.
*   It calculates a street layout and building placements based on the seed.
*   This allows the agent to say "Build a city at [100, 100]" and the manifest just stores one entry, while the client generates the full city deterministically on demand.

## Implementation Plan

1.  **Phase 1: Persistence Layer** (Current Task)
    *   Create `world_manifest.json`.
    *   Refactor `WorldManifest.ts` to be data-driven.
2.  **Phase 2: Generator Integration**
    *   Wire `WorldGenerator` to spawn landmarks from the manifest.
3.  **Phase 3: The "Agentic Map Creator" Skill**
    *   Define the skill logic for multi-step building (Place landmark -> Generate lore -> Add NPCs).
4.  **Phase 4: Template System**
    *   Create reusable "City" and "Camp" templates.
