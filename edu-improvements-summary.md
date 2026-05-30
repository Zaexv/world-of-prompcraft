# World of Promptcraft: Improvements Summary (Branch: feature/agentic-rework-sync)

This document summarizes the key architectural and functional improvements developed in this branch. These changes aim to enhance world-building efficiency, AI intelligence, and rendering reliability.

## 1. World Infrastructure & Rendering

### Data-Driven World (Tabula Rasa)
- **Unified Manifest (V2.1.0)**: Shifted from hardcoded scene registrations to a single source of truth: `shared/data/world_manifest.json`.
- **Spatial Partitioning**: Implemented a 128x128 unit grid (`landmarkGrid`) within the `WorldManifest` state. This allows for O(1) landmark lookups during chunk loading, significantly reducing the CPU overhead of world generation.
- **Landmark Lifecycle Fix**: Resolved a race condition in the `Terrain` loading sequence. By moving chunk preloading to an explicit `init()` phase called after callback registration, we ensure all landmarks (like Fort Malaka) in the starting radius are correctly spawned.

### Visual & Physics Optimizations
- **Idempotent Spawning**: NPC re-addition now includes explicit disposal of previous meshes to prevent "multiplication" bugs and memory leaks.
- **Water Rendering Fixes**: Resolved issues where the water plane would vanish near ground decals or during specific camera rotations by disabling depth-writing on transparent ground patches.
- **Lighting Overhaul**: Implemented warm, bright daytime lighting consistent across all biomes, with smooth transitions between zone atmospheres.

## 2. Agentic Architecture (Server-Side)

*Note: The server was synchronized back to the main branch's LangGraph configuration to maintain compatibility, but the following "vNext" improvements were validated in this branch:*

### Advanced Memory & Cognition
- **Hybrid Memory System**: Introduced a dual-memory approach combining **Conversation Summaries** (rolling context) with **Episodic Memories** (discrete key facts about the player).
- **NPC State Persistence**: Designed a SQLite-backed persistence layer for NPC HP, position, mood, and relationship scores, ensuring world state survives server restarts.
- **Relationship Tiers**: Implemented dynamic relationship scoring (-100 to +100) that affects NPC dialogue and willingness to trade or assist.

### Performance & Reliability
- **Deterministic Fast-Path**: Created an O(1) regex-based "pre-check" node to handle direct commands (e.g., "attack", "trade") without invoking the full LLM, reducing latency and API costs for common actions.
- **Backpressure & Concurrency**: Added semaphores to LLM invocations and per-player interaction locks to prevent race conditions during concurrent chat requests.

## 3. Gameplay & UX

### Audio System Integration
- **Procedural BGM**: Added a dynamic audio system that scales with zone transitions.
- **SFX Framework**: Integrated spatial sound effects for combat, movement, and environment interactions.

### UI/UX Enhancements
- **Minimap Evolution**: Added `MinimapWidget` support for richer NPC tracking and waypoint labeling.
- **Rich Text Chat**: Implemented a `RichTextFormatter` for dialogue, allowing for highlighted keywords and better readability in chat bubbles.
- **Interaction Feedback**: Improved the `InteractionPanel` and `ToastPanel` to provide clearer feedback on quest progress and item acquisitions.

## 4. Stability & Testing
- **E2E Visual Regression**: Added initial support for visual regression testing and screenshot capture for UI components.
- **Expanded Test Suite**: New integration tests for `EntityManager` synchronization, `AudioSystem` reliability, and `WebSocket` message routing.
