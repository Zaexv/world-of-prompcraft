# World of Promptcraft — Front-End Refactoring Plan
**Date:** 2026-05-26  
**Branch:** feature/front-end-improvements  
**Scope:** Client-side 3D rendering and architecture only

---

## Current State

Phases 1–6 of refactoring are complete. The architecture is layered and mostly sound. Three problems remain that block extensibility:

1. **`main.ts` is a god object** (1140 LOC) — owns system init, game loop, WebSocket routing, login flow, cursor VFX. Everything new must go through it.
2. **UI is inconsistent** — UIComponent base class exists and is good, but only 5 of 33 panels use it. No shared theme/design constants.
3. **Incomplete refactors** — LoginScreen (Phase 2) and NPC (Phase 3) were partially extracted but the original files weren't reduced.

Everything else — scene, systems, entities, networking, state — is well-structured and should be left alone.

---

## What Is NOT Being Touched

The following are production-ready and must not be refactored unless a bug requires it:

- `client/src/scene/` — all 19 files (Terrain, Water, Skybox, Lighting, Buildings, etc.)
- `client/src/systems/` — all 18 files (CollisionSystem, InteractionSystem, ReactionSystem, WorldGenerator, Spawners)
- `client/src/network/` — WebSocketClient, MessageProtocol
- `client/src/state/` — PlayerState, WorldState, NPCState
- `client/src/config/` — all config files
- `client/src/entities/EntityManager.ts`, `RemotePlayer.ts`, `PlayerController.ts`

---

## Problems and Fixes

### Phase 7 — Extract GameEngine from `main.ts`

**Problem:** `main.ts` (1140 LOC) is the hardest file to extend. Adding a new system means editing a 1140-line file with no clear seams.

**Solution:** Decompose into 4 focused modules.

**Files to create:**

```
client/src/core/
├── GameEngine.ts        — owns the requestAnimationFrame loop + per-tick system calls
├── GameBootstrapper.ts  — owns system initialization + scene creation
└── WebSocketHandler.ts  — owns WS event dispatch → system/state calls
```

**`main.ts` becomes:**
```typescript
// ~80 LOC total
import { LoginScreen } from './ui/LoginScreen';
import { GameBootstrapper } from './core/GameBootstrapper';

const loginScreen = new LoginScreen();
loginScreen.onEnterWorld(async (config) => {
  const game = await GameBootstrapper.create(config);
  game.start();
});
```

**`GameEngine.ts`:**
- Holds references to all initialized systems
- Runs the RAF loop calling `update(delta)` on each system in order
- Exposes `start()`, `stop()`, `pause()`
- Does NOT import WebSocketClient or UI

**`GameBootstrapper.ts`:**
- Accepts player config from LoginScreen
- Creates SceneManager, all systems, EntityManager, UIManager
- Creates WebSocketClient, creates WebSocketHandler
- Returns a configured `GameEngine` ready to start

**`WebSocketHandler.ts`:**
- Accepts references to EntityManager, UIManager, all systems
- One method per message type: `handleJoinOk()`, `handleAgentResponse()`, `handlePlayerMoved()`, etc.
- Pure dispatch — no game logic

**Acceptance criteria:**
- `main.ts` drops below 100 LOC
- GameEngine can be instantiated in a test with mock systems
- Adding a new WebSocket message type requires only editing `WebSocketHandler.ts`

---

### Phase 8 — Finish LoginScreen (Phase 2 Completion)

**Problem:** `LoginScreen.ts` is 862 LOC. `LoginForm.ts` was extracted (Phase 2) but LoginScreen was never refactored to delegate to it.

**Solution:** Refactor LoginScreen to delegate, not inline.

**Target structure:**
```
ui/screens/
├── LoginScreen.ts       — owns: portal canvas animation, screen lifecycle, coordinates subcomponents
├── LoginForm.ts         — exists: form validation, name input, submit button (250 LOC)
├── ServerSelector.ts    — NEW: server URL input + saved server list
└── RaceSelector.ts      — NEW: faction/race/skin selection grid
```

**`LoginScreen.ts` target:** ~250 LOC (owns only the portal animation and subcomponent coordination).

**Acceptance criteria:**
- LoginScreen stays above the fold at ~250 LOC
- Portal animation is isolated (class `PortalAnimator` or similar)
- LoginForm, ServerSelector, RaceSelector are independently testable

---

### Phase 9 — Complete NPC Decomposition (Phase 3 Completion)

**Problem:** `NPC.ts` is 1102 LOC. NPCAppearance was extracted (Phase 3) but wander AI and mesh manipulation are still inline.

**Solution:** Extract the behavior state machine.

**Files to create:**
```
client/src/entities/
├── NPC.ts               — target: ~400 LOC (coordination only)
├── NPCAppearance.ts     — exists: mesh building, materials (464 LOC)
├── NPCAnimator.ts       — exists: animation state machine (163 LOC)
├── NPCMotion.ts         — exists: motion profiles (194 LOC)
└── NPCBehavior.ts       — NEW: wander AI state machine (target state, patrol, cooldown, idle)
```

**`NPCBehavior.ts` should own:**
- Wander target selection logic
- Patrol between waypoints
- Idle/wander cooldown timers
- Return-to-spawn detection
- Only depends on `THREE.Vector3` and the NPC's config — no mesh access

**Acceptance criteria:**
- `NPC.ts` drops below 450 LOC
- `NPCBehavior.ts` has no Three.js scene or mesh imports
- Wander AI can be unit tested without a Three.js scene

---

### Phase 10 — UI Component Consistency

**Problem:** 25+ UI panels bypass the UIComponent lifecycle. Memory leaks are likely. No shared design constants.

**Target state:**
- Every panel in `client/src/ui/` extends UIComponent or documents why not
- Shared constants file for colors, fonts, z-indices

**Files to create:**
```
client/src/ui/core/
├── UIComponent.ts       — exists (186 LOC)
├── UIFactory.ts         — exists
├── UITheme.ts           — NEW: color palette, font stacks, z-index scale, spacing
└── index.ts
```

**`UITheme.ts` shape:**
```typescript
export const UITheme = {
  colors: {
    panelBg:    'rgba(10, 8, 20, 0.95)',
    goldPrimary: '#c9a96e',
    healthGreen: '#4a9',
    dangerRed:   '#c44',
    textPrimary: '#e8d5b0',
  },
  fonts: {
    heading: '"Cinzel", serif',
    body:    '"Segoe UI", sans-serif',
    mono:    'monospace',
  },
  zIndex: {
    world: 0, hud: 10, panel: 20, modal: 30, overlay: 40,
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
} as const;
```

**Migration priority for panels (by impact):**
1. `InteractionPanel.ts` — most-used panel in gameplay
2. `CombatHUD.ts` — always visible
3. `InventoryPanel.ts` — complex, likely leaks
4. `ChatPanel.ts` — frequent DOM updates
5. `Minimap.ts`, `QuestLog.ts`, etc.

**Acceptance criteria:**
- `UITheme` imported by all panels (no inline hex strings)
- All panels extend UIComponent or have a `dispose()` that cleans up listeners
- No `document.addEventListener` without a corresponding removal in `dispose()`

---

## Phases Summary

| Phase | Target File(s) | Problem | LOC Goal | Unblocks |
|-------|---------------|---------|----------|----------|
| 7 | `main.ts` → `core/` | God object | main.ts < 100 | Adding new systems, testability |
| 8 | `LoginScreen.ts` | Incomplete Phase 2 | LoginScreen < 250 | Login flow extensibility |
| 9 | `NPC.ts` | Incomplete Phase 3 | NPC.ts < 450 | NPC behavior extensibility |
| 10 | All `ui/` panels | UIComponent inconsistency | All panels compliant | UI extensibility, no memory leaks |

**Suggested order:** 7 → 9 → 8 → 10 (GameEngine first so new code lands cleanly)

---

## Stability Rules

These rules must hold before and after every phase:

1. `make check` passes (lint + typecheck + tests)
2. The game boots and the login portal animation renders
3. A player can enter the world, see terrain, and chat with an NPC
4. No new `any` types introduced
5. No existing tests deleted

---

## What Stale Docs Can Be Deleted

These files are noise and should be removed or archived:

| File | Why |
|------|-----|
| `docs/architecture.md` | Pre-Phase-1 snapshot, superseded by `client/ARCHITECTURE.md` |
| Any `*-plan.md` in root | Implementation plans for completed phases |
| `skin-plan.md`, `state.md`, `to-do.md` | Root-level scratchpad files, content is stale |
| `PIPELINE_IMPROVEMENTS.md` | Check if actionable; if not, delete |
| `docs/research/player-interactions.md` | Historical only |

Keep: `client/ARCHITECTURE.md`, `server/ARCHITECTURE.md`, `docs/protocol.md`, `docs/agentic-workflow.md`

---

## Non-Goals

The following are explicitly out of scope for this refactor:

- **ECS pattern** — current composition works, migration is high risk/low value
- **Event bus** — direct callbacks are simpler and testable
- **Full UI rewrite** — incremental adoption of UIComponent is sufficient
- **Rendering pipeline changes** — separate concern, handle in generative-agent skill
- **Server-side changes** — this plan is client-only
- **New features** — nothing new until architecture is stable
