---
date: 2026-05-24T21:37:01.428212+00:00
git_commit: 25a3c443c7d204937998daf8e1048dd73c389f7a
branch: refactor/architecture-docs
topic: "NPC movement styles, fallback character polish, and load backpressure"
tags: [plan, client, entities, assets]
status: draft
---

# NPC Movement Styles, Fallback Character Polish, and Load Backpressure Implementation Plan

## Overview

We will make NPCs feel less uniform by giving each one a distinct movement profile, polish the procedural fallback character used when a GLTF skin is missing, and add load backpressure so bursts of model requests do not spike the frame or network budget.

## Current State Analysis

- NPCs all share one wander loop with a single speed/cooldown pattern in `client/src/entities/NPC.ts:279-377`.
- NPC animation is generic and only varies by idle/walk/attack/emote in `client/src/entities/NPCAnimator.ts:1-145`.
- World and dungeon spawns already know enough identity context to drive style choices, but they do not pass it through to the NPC entity yet (`client/src/systems/WorldGenerator.ts:724-835`, `client/src/systems/DungeonSystem.ts:252-265`).
- The player fallback is already procedural, but it is still the same base silhouette whenever GLTF loading fails (`client/src/entities/Player.ts:35-215`, `client/src/entities/RaceModels.ts:22-399`).
- GLTF loading is currently fire-and-forget with no queue or concurrency cap in `client/src/utils/AssetLoader.ts:17-21`.

## Desired End State

- Every NPC gets a deterministic movement style based on its identity and context, so guards, merchants, sages, hostile mobs, and dungeon enemies do not move the same way.
- GLTF NPCs still use the same style metadata to drive pacing and animation rate, while procedural NPCs inherit the same style in their fallback motion.
- The non-GLTF player model looks noticeably more intentional and readable than the current fallback silhouette.
- GLTF requests are queued with bounded concurrency so loading many characters at once does not overwhelm the client.

### Key Discoveries:

- `EntityManager.update()` already culls distant NPCs, so we can layer style logic onto the existing update path instead of rewriting the entity loop (`client/src/entities/EntityManager.ts:112-137`).
- `WorldGenerator` already computes a `behavior` string for spawned NPCs, which is the cleanest place to seed movement personality (`client/src/systems/WorldGenerator.ts:742-835`).
- `AssetLoader` is small and centralized, so it is the best place to add concurrency limits without touching every caller (`client/src/utils/AssetLoader.ts:1-30`).

## What We Are NOT Doing

- We are not changing server-side NPC agent logic or dialogue behavior.
- We are not adding new external art assets as part of this change.
- We are not rewriting the player/NPC networking protocol.
- We are not touching dungeon or quest gameplay rules beyond the NPC movement side effects needed for style.

## Implementation Approach

We will introduce a shared NPC motion profile helper that derives a deterministic archetype and numeric tuning values from NPC metadata. `NPC` will use that profile to vary wander radius, pause timing, turn speed, stride, bob, and movement pattern. `NPCAnimator` will consume the same profile so procedural motion and GLTF animation playback stay in sync.

In parallel, we will refine the procedural player fallback model so it looks more like a deliberate character model instead of a bare placeholder. The GLTF fallback path will continue to work if loading fails, but the no-asset version should feel coherent and polished.

Finally, we will add a bounded load queue to `AssetLoader` so concurrent GLTF requests are automatically backpressured. This keeps NPC/player skin loading from creating unnecessary spikes when many entities appear at once.

## Architecture and Code Reuse

- Reuse the current NPC spawn information from `WorldGenerator` and `DungeonSystem` instead of inventing a new server contract.
- Reuse the existing `NPCAnimator` and procedural race models, but feed them richer profile data.
- Reuse the existing GLTF loading API, wrapping it with a small concurrency limiter rather than changing every caller.
- Reuse `MathHelpers` for interpolation where the new motion code needs smoother transitions.

```text
client/src/
  entities/
    NPC.ts                    # adopt per-NPC motion profiles and style-aware movement
    NPCAnimator.ts            # read motion profile for procedural/GLTF animation timing
    NPCMotion.ts              # new shared profile/seed helper
    RaceModels.ts             # improve procedural fallback silhouette
    Player.ts                 # keep fallback path and wire improved procedural model
  systems/
    WorldGenerator.ts         # pass behavior/style hints into NPC configs
    DungeonSystem.ts          # mark dungeon enemies as hostile/prowl-style
  utils/
    AssetLoader.ts            # add bounded GLTF load queue / backpressure
```

## Phase 1: Add NPC motion profiles

### Overview

Build a shared profile system for NPC movement and wire it into the existing wander/animation path.

### Changes Required:

#### [ ] 1. Create shared NPC motion profile helper
**File**: `client/src/entities/NPCMotion.ts`
**Changes**: Add deterministic seed hashing, archetype selection, and numeric tuning values for calm, patrol, prowl, float, swagger, and stomp styles.

```ts
export type NPCBehavior = 'friendly' | 'neutral' | 'hostile';
export type NPCMovementStyle = 'stroll' | 'patrol' | 'prowl' | 'float' | 'swagger' | 'stomp';

export interface NPCMotionSource {
  id: string;
  name: string;
  color?: number;
  behavior?: NPCBehavior;
  movementStyle?: NPCMovementStyle;
}

export interface NPCMotionProfile {
  style: NPCMovementStyle;
  moveSpeed: number;
  wanderRadius: number;
  pauseMin: number;
  pauseMax: number;
  turnSpeed: number;
  walkCycleSpeed: number;
  idleBobAmplitude: number;
  idleBobSpeed: number;
  swayAmplitude: number;
  swaySpeed: number;
  animationRate: number;
  patrolPoints: number;
}
```

#### [ ] 2. Extend NPC config and apply the profile
**File**: `client/src/entities/NPC.ts`
**Changes**: Add optional behavior/style hints to `NPCConfig`, derive a motion profile in the constructor, and use it to drive wander target selection, speed, turn smoothing, and idle timing.

```ts
export interface NPCConfig extends NPCMotionSource {
  position: THREE.Vector3;
  wanderRadius?: number;
}
```

#### [ ] 3. Make NPC animation style-aware
**File**: `client/src/entities/NPCAnimator.ts`
**Changes**: Accept the motion profile, vary procedural bob/sway/step cadence from it, and apply the profile to GLTF mixer playback speed.

#### [ ] 4. Pass behavior hints from spawn sites
**Files**: `client/src/systems/WorldGenerator.ts`, `client/src/systems/DungeonSystem.ts`
**Changes**: Pass `behavior` into `addNPC()` for town citizens, biome spawns, and dungeon enemies so the profile helper can pick a better style.

### Success Criteria:

#### Automated Verification:
- [ ] Unit tests cover deterministic style selection and per-style tuning.
- [ ] Type checking passes with the new NPC config and animator signatures.

#### Manual Verification:
- [ ] In-game, guards, merchants, sages, hostile NPCs, and dungeon enemies no longer move with the same cadence.
- [ ] Nearby NPCs still wander and rotate smoothly around terrain and obstacles.

## Phase 2: Polish the no-GLTF character

### Overview

Refine the procedural player fallback so it reads as a finished character, not a placeholder, when no GLTF skin is available.

### Changes Required:

#### [ ] 1. Improve the procedural race silhouettes
**File**: `client/src/entities/RaceModels.ts`
**Changes**: Tighten proportions, add small secondary details where useful, and make each race’s fallback body shape more distinctive without changing the existing animation part names.

#### [ ] 2. Preserve and reuse the fallback path
**File**: `client/src/entities/Player.ts`
**Changes**: Keep the GLTF fallback logic intact, but ensure failed loads always land on the improved procedural model cleanly.

### Success Criteria:

#### Automated Verification:
- [ ] Existing player/model tests continue to pass.
- [ ] Type checking passes after the fallback model changes.

#### Manual Verification:
- [ ] When a GLTF skin is missing, the player still spawns with a polished procedural model.
- [ ] The fallback model animates naturally in idle, walk, run, and swim states.

## Phase 3: Add load backpressure

### Overview

Queue GLTF requests with bounded concurrency so character/model loading stays smooth under bursty spawn conditions.

### Changes Required:

#### [ ] 1. Add a bounded request queue
**File**: `client/src/utils/AssetLoader.ts`
**Changes**: Wrap GLTF and texture loads in a small concurrency-limited queue instead of dispatching every request immediately.

```ts
class AssetLoader {
  constructor(private readonly maxConcurrentLoads = 3) {}
}
```

#### [ ] 2. Keep callers unchanged
**Files**: `client/src/entities/Player.ts`, `client/src/entities/NPC.ts`, `client/src/entities/RemotePlayer.ts`
**Changes**: Continue calling `loadGLTF()` normally so the queue remains transparent to the rest of the client.

#### [ ] 3. Add queue coverage
**File**: `client/src/__tests__/AssetLoader.test.ts`
**Changes**: Verify requests are started in order and concurrency never exceeds the configured cap.

### Success Criteria:

#### Automated Verification:
- [ ] Loader queue tests pass.
- [ ] Full client type checking passes.
- [ ] Existing client and server test suites still pass.

#### Manual Verification:
- [ ] Loading many players/NPCs at once no longer produces a visible loading spike or freeze.

## Testing Strategy

### Unit Tests:
- Motion profile selection for specific NPC IDs and behaviors.
- Profile parameter differences between friendly, hostile, guard, and mage-like NPCs.
- Asset loader queue concurrency and ordering.

### Integration Tests:
- Spawned town citizens, dungeon enemies, and biome NPCs render with distinct movement cadence.
- A missing GLTF skin still falls back to the improved procedural player model.

### Manual Testing Steps:
1. Enter the world and watch a few different NPC types spawn in the same area.
2. Compare guard, merchant, sage, and hostile movement patterns side by side.
3. Temporarily remove or rename a player skin GLB and confirm the fallback character still looks complete.
4. Spawn or load several character models at once and confirm the client stays responsive.

## Performance Considerations

- Motion styles should stay deterministic and cheap; the profile helper should be pure and avoid per-frame allocations.
- The NPC update path should reuse existing vector instances and avoid creating new targets every frame.
- The asset queue should keep concurrency low enough to smooth spikes, but high enough that skin loading does not feel sluggish.

## Migration Notes

- Existing NPCs will automatically pick a style from their current IDs and spawn metadata.
- No data migration is required because the new style system is client-side and derived at runtime.

## References

- `client/src/entities/NPC.ts:279-377`
- `client/src/entities/NPCAnimator.ts:1-145`
- `client/src/entities/Player.ts:35-215`
- `client/src/entities/RaceModels.ts:22-399`
- `client/src/utils/AssetLoader.ts:17-21`
- `client/src/systems/WorldGenerator.ts:724-835`
- `client/src/systems/DungeonSystem.ts:252-265`
- `client/src/entities/EntityManager.ts:112-137`
