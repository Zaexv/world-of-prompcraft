# World of Promptcraft — Session State

_Last updated: 2026-05-24 (late session update)_

---

## Session outcome

Major server hardening, architecture/doc replication, visual quality upgrades, and 3D engine performance work were completed in one branch (`refactor/architecture-docs`). Current runtime is healthy for both backend and frontend.

---

## Completed work

### 1. Server / AI hardening ✅

All previously tracked backend resiliency fixes are in place and passing checks:

- WebSocket JSON error handling and disconnect lock cleanup (`server/src/main.py`)
- Interaction backpressure (per-player lock + global semaphore), handler cleanup, and crash guards (`server/src/ws/handler.py`)
- Agent-node guards + safer retrieval path (`server/src/agents/nodes/*.py`)
- Combat flee action protocol fix (`server/src/agents/tools/combat.py` + test update)
- LLM timeout and provider API key validation (`server/src/llm/provider.py`, `server/src/config.py`)

### 2. Claude structure replication + skills/docs scaffolding ✅

- Added/updated:
  - `CLAUDE.md`
  - `.claude/skills/agentic-promptcraft/SKILL.md`
  - `.claude/skills/create-architecture/SKILL.md`
  - `client/ARCHITECTURE.md`
  - `server/ARCHITECTURE.md`

### 3. Water + terrain quality fixes ✅

- Water visibility/root cause fixed in render path (`SceneManager.tick()` now always updates water)
- Camera far plane increased to avoid water-edge clipping (`1600`)
- Water reflection clipping improved (`clipBias: 0.003`)
- Terrain quality pass implemented in `Terrain.ts`:
  - steep-slope rock blending
  - valley AO darkening
  - micro color variation
  - emissive suppression on steep faces
  - higher near-chunk segment density
  - roughness tuning

### 4. NPC GLTF model integration infrastructure ✅

- Async NPC factory/load path and fallback to procedural meshes
- `NPCModels.ts` map + animation mixer handoff in `NPCAnimator`
- `EntityManager.addNPC` + dungeon/main wiring updated for async spawn

> GLB assets are still optional and can be dropped under `client/public/models/npcs/`.

### 5. 3D engine performance + quality balancing ✅

Implemented targeted runtime optimizations to recover FPS while preserving close-range visual quality:

- **Collision hot-path broad-phase** in swept AABB (`client/src/systems/CollisionSystem.ts`)
- **Adaptive dynamic resolution scaling** in `SceneManager` (pixel ratio auto-adjusts with frame time)
- **Distance-based decorative shadow casting** via `userData.distanceShadowCaster` tags
  - near objects can cast shadows
  - far decorative foliage disables shadows automatically
- Reduced baseline shadow/render cost:
  - directional shadow map `2048 → 1024`
  - water reflection texture made DPR-aware

### 6. Runtime process correction ✅

Frontend port `5173` was temporarily shared by another project (SpAIce). The wrong process was terminated, leaving Promptcraft as the active frontend.

---

## Current runtime URLs

- Frontend: `http://127.0.0.1:5173`
- Backend health: `http://127.0.0.1:8000/health`

---

## Latest update — Darker vibe + startup UX/perf (2026-05-24)

### Visual mood (darker/cooler)

- `client/src/scene/Lighting.ts`
  - Key moon light intensity lowered and shifted cooler
  - Hemisphere/ambient/rim fill reduced for less washed-out look
  - Cooler fog tone for stronger night atmosphere
  - Shadow map reduced to `512` for lower GPU cost

- `client/src/scene/SceneManager.ts`
  - Tone mapping exposure reduced to `1.2`
  - Bloom kept subtle, with dynamic enable/disable based on frame time

### Load-time performance

- `client/src/scene/Terrain.ts`
  - Replaced bulk chunk generation with queued streaming (`CHUNK_LOADS_PER_UPDATE`)
  - Added smaller initial preload radius and per-frame chunk processing
  - Startup no longer blocks on creating all near chunks at once

### Loading screen

- `client/src/main.ts`
  - Added full-screen loading overlay with progress messages
  - Shows during renderer/world/network setup
  - Automatically hides on `join_ok` and on `join_error`

---

## Current priority backlog

1. Add actual NPC `.glb` assets into `client/public/models/npcs/` (infrastructure is ready)
2. Optional visual leap: triplanar terrain texturing / splat blending shader
3. Optional optimization: selective bloom (emissive-only path) instead of broad bloom

---

## Key files touched for the latest 3D pass

| Area | Files |
|------|-------|
| Adaptive quality + shadow distance logic | `client/src/scene/SceneManager.ts` |
| Collision performance | `client/src/systems/CollisionSystem.ts` |
| Water perf/quality balance | `client/src/scene/Water.ts` |
| Lighting shadow cost | `client/src/scene/Lighting.ts` |
| Foliage shadow tagging | `client/src/scene/Vegetation.ts`, `client/src/systems/WorldGenerator.ts` |
