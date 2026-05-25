# World of Promptcraft — Client Architecture Refactoring Plan

**Last Updated:** May 2025  
**Scope:** Three.js + TypeScript frontend (`client/src/`)  
**Goal:** Improve maintainability, testability, and scalability while preserving all game functionality  
**Timeline:** 6 weeks full-time | 12–14 weeks part-time  
**Risk Level:** Low (incremental, tests remain green throughout)

---

## Executive Summary

The World of Promptcraft client codebase (88 TypeScript files, ~20.5K LOC) exhibits signs of rapid growth:
- **3 "god objects"** with >850 LOC each (NPC.ts 1552, WorldGenerator.ts 856, LoginScreen.ts 862)
- **Scattered responsibilities** across layers (rendering, logic, UI, animation all in entities)
- **Boilerplate UI code** repeated across 20+ panels
- **Tight coupling** between procedural generation, spawning, and collision systems

This plan restructures the codebase around **clear responsibility boundaries** and **reusable base classes** while maintaining **zero breaking changes** to gameplay or the server contract.

---

## Current State Analysis

### Codebase Metrics
```
client/src/
  entities/       3,100 LOC  (7 files)
    NPC.ts       1,552 LOC  ← god object
    Player.ts      410 LOC
    RemotePlayer   295 LOC
  scene/         5,200 LOC  (7 files)
    Water.ts       510 LOC
    Skybox.ts      380 LOC
    Terrain.ts     680 LOC
  systems/       3,600 LOC  (9 files)
    WorldGenerator 856 LOC  ← god object
    Collision      620 LOC
    Interaction    485 LOC
  ui/            5,100 LOC  (20+ files)
    LoginScreen    862 LOC  ← god object
    InteractionPanel 492 LOC
    CombatHUD      370 LOC
    Nameplate      370 LOC
    (+ 16 more UI panels with similar boilerplate)
  state/           600 LOC  (2 files)
  network/         450 LOC  (1 file)
  utils/           350 LOC  (3 files)

Total: ~20,553 LOC across 88 files
```

### Pain Points Identified

| Problem | Impact | Files Affected |
|---------|--------|-----------------|
| **God Objects** | Hard to test, impossible to reuse components | NPC.ts (1552), WorldGenerator.ts (856), LoginScreen.ts (862) |
| **UI Boilerplate** | 1000+ LOC of repeated DOM setup | 20+ UI panel files |
| **Mixed Concerns** | Rendering + logic + animation in one class | entities/, systems/WorldGenerator |
| **Missing Abstractions** | No base class for entities or UI components | Entire codebase |
| **Unclear Dependencies** | Circular imports, tight coupling | systems/ ↔ entities/ |
| **Hard to Test** | Game classes depend on Three.js scene | entities/, systems/ |

---

## Proposed Architecture

### New Folder Structure

```
client/src/
├── config/                  ← NEW: Centralized configuration
│   ├── GameConfig.ts       (Game settings, defaults)
│   ├── AssetPaths.ts       (All asset URIs)
│   ├── UIConfig.ts         (UI dimensions, colors)
│   └── NetworkConfig.ts    (Server endpoints)
│
├── entities/               ← REFACTORED: Cleaner composition
│   ├── base/              (NEW: Abstract base classes)
│   │   ├── BaseEntity.ts   (Common entity interface)
│   │   └── BaseCharacter.ts (Movement, animation, update loop)
│   ├── player/            (NEW: Organized by character type)
│   │   ├── Player.ts       (Refactored from entities/)
│   │   └── PlayerController.ts (Input handling)
│   ├── npc/               (NEW: Split NPC into focused files)
│   │   ├── NPC.ts         (400 LOC: Core logic, behavior)
│   │   ├── NPCFactory.ts  (300 LOC: Creation & pooling)
│   │   └── NPCAppearance.ts (200 LOC: Mesh, skeleton, materials)
│   ├── remote/            (NEW: Organized group)
│   │   └── RemotePlayer.ts
│   └── EntityManager.ts    (Refactored: orchestrator only)
│
├── rendering/             ← RESTRUCTURED: Grouped by visual layer
│   ├── terrain/          (NEW: Subgroup)
│   │   ├── Terrain.ts
│   │   └── ChunkManager.ts (NEW: Procedural chunk loading)
│   ├── environment/      (NEW: World visuals)
│   │   ├── Water.ts
│   │   ├── Skybox.ts
│   │   ├── Lighting.ts
│   │   └── VegetationSpawner.ts (NEW: Extracted from WorldGenerator)
│   ├── effects/          (NEW: Visual FX)
│   │   ├── ParticleSystem.ts
│   │   └── EffectsRenderer.ts
│   ├── atmosphere/       (NEW: Environmental rendering)
│   │   ├── Weather.ts
│   │   └── Fog.ts
│   └── RenderQueue.ts    (Optimize rendering order)
│
├── systems/              ← REFACTORED: One job per system
│   ├── world/           (NEW: Subgroup)
│   │   ├── WorldGenerator.ts (300 LOC: Refactored orchestrator)
│   │   ├── BiomeManager.ts (150 LOC: Biome logic)
│   │   ├── BuildingSpawner.ts (150 LOC: Building generation)
│   │   ├── CaveSpawner.ts (100 LOC: Cave generation)
│   │   ├── DungeonSystem.ts (Already exists)
│   │   └── ZoneTracker.ts (Zone-based loading)
│   ├── collision/       (NEW: Clearer naming)
│   │   └── CollisionSystem.ts (Refactored from systems/)
│   ├── interaction/     (NEW: Clearer naming)
│   │   ├── InteractionSystem.ts
│   │   └── ReactionSystem.ts
│   ├── animation/       (NEW: Subgroup for animation logic)
│   │   ├── CharacterAnimator.ts
│   │   ├── NPCAnimator.ts
│   │   └── AnimationMixer.ts
│   └── physics/         (NEW: Physics simulation)
│       └── PhysicsEngine.ts
│
├── ui/                   ← REFACTORED: Base classes + organized panels
│   ├── core/            (NEW: Reusable UI infrastructure)
│   │   ├── UIComponent.ts (Base class for all panels)
│   │   ├── UIManager.ts (Refactored: delegation only)
│   │   └── UIConstants.ts (Colors, dimensions, fonts)
│   ├── screens/         (NEW: Full-screen UI)
│   │   ├── LoginScreen.ts (400 LOC: Refactored)
│   │   └── LoginForm.ts (250 LOC: Extracted)
│   ├── hud/            (NEW: In-game overlay HUD)
│   │   ├── InteractionPanel.ts
│   │   ├── CombatHUD.ts
│   │   ├── Nameplate.ts
│   │   ├── Minimap.ts
│   │   └── ChatPanel.ts
│   ├── inventory/      (NEW: Grouped inventory UI)
│   │   ├── InventoryPanel.ts
│   │   └── EquipmentSlot.ts
│   ├── dialogs/        (NEW: Modal dialogs)
│   │   ├── QuestDialog.ts
│   │   ├── TradeDialog.ts
│   │   └── ConfirmDialog.ts
│   └── helpers/        (NEW: Shared UI utilities)
│       ├── ButtonFactory.ts
│       └── FormValidator.ts
│
├── state/               ← UNCHANGED: Already clean
│   ├── PlayerState.ts
│   └── WorldState.ts
│
├── network/             ← UNCHANGED: Already focused
│   ├── WebSocketClient.ts
│   └── MessageProtocol.ts
│
├── utils/               ← REFACTORED: Organized into categories
│   ├── math/           (NEW: Math utilities)
│   │   └── MathHelpers.ts
│   ├── asset/          (NEW: Asset management)
│   │   ├── AssetLoader.ts
│   │   └── TextureCache.ts
│   └── debug/          (NEW: Development utilities)
│       └── DebugOverlay.ts
│
└── main.ts              (Unchanged bootstrap)
```

---

## Core Design Changes

### 1. Base Classes Pattern

#### UIComponent (Base Class for All UI)
```typescript
// ui/core/UIComponent.ts
export abstract class UIComponent {
  protected container: HTMLElement;
  protected isVisible = false;

  constructor(containerId: string) {
    const parent = document.getElementById(containerId);
    if (!parent) throw new Error(`Container ${containerId} not found`);
    this.container = document.createElement('div');
    parent.appendChild(this.container);
  }

  abstract render(): void;

  show(): void {
    this.container.style.display = 'block';
    this.isVisible = true;
  }

  hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  dispose(): void {
    this.container.remove();
  }
}

// Usage in all UI panels (eliminates ~50% boilerplate)
export class InteractionPanel extends UIComponent {
  constructor() {
    super('ui-container');
  }

  render(): void {
    // Panel-specific rendering only
  }
}
```

#### BaseEntity (Foundation for Game Objects)
```typescript
// entities/base/BaseEntity.ts
export abstract class BaseEntity {
  id: string;
  position: Vector3;
  protected mesh?: Object3D;

  constructor(id: string, position: Vector3) {
    this.id = id;
    this.position = position;
  }

  abstract update(deltaTime: number): void;

  getDistance(other: Vector3): number {
    return this.position.distanceTo(other);
  }

  dispose(): void {
    if (this.mesh) this.mesh.removeFromParent();
  }
}
```

### 2. God Object Refactoring

#### NPC.ts Decomposition (1552 LOC → 900 LOC)
**Before:** Single file mixing rendering, animation, movement, interaction, mesh building
**After:** Focused responsibilities across 3 files

| File | Lines | Responsibility |
|------|-------|-----------------|
| NPC.ts | 400 | Behavior: AI state, dialogue, response logic |
| NPCFactory.ts | 300 | Creation: NPC instantiation, pooling, initialization |
| NPCAppearance.ts | 200 | Rendering: Mesh, skeleton, materials, appearance |

**Migration Path:**
1. Extract NPCAppearance.ts (rendering details)
2. Extract NPCFactory.ts (creation logic)
3. Refactor NPC.ts to use these helpers
4. Update imports in WorldGenerator, EntityManager
5. Tests should pass at each step

#### WorldGenerator.ts Decomposition (856 LOC → 900 LOC distributed)
**Before:** Monolithic procedural generation handling 8 concerns
**After:** Focused modules with single responsibilities

| File | Lines | Job |
|------|-------|-----|
| WorldGenerator.ts | 300 | Orchestration: Manages chunk lifecycle |
| ChunkManager.ts | 200 | Chunks: Load, unload, streaming |
| BiomeManager.ts | 150 | Biomes: Terrain definition, rules |
| VegetationSpawner.ts | 200 | Plants: Trees, grass, biome-specific flora |
| BuildingSpawner.ts | 150 | Buildings: House, fort placement |
| CaveSpawner.ts | 100 | Caves: Underground generation |

**Benefits:**
- Each system is independently testable
- Biome rules can be modified without touching spawning logic
- Can replace terrain with voxel system without changing building logic
- Easier to optimize: disable trees without rewriting caves

#### LoginScreen.ts Decomposition (862 LOC → 650 LOC)
**Before:** UI screen handling form, validation, server selection
**After:** Focused components with clear separation

| File | Lines | Responsibility |
|------|-------|-----------------|
| LoginScreen.ts | 400 | Screen orchestration, routing |
| LoginForm.ts | 250 | Form UI and validation |
| ServerSelector.ts | 100 | Server dropdown and connection logic |

---

## 5-Phase Implementation Plan

### Phase 1: Foundation (Week 1) — 8 hours
**Goal:** Set up reusable infrastructure without touching existing code

**Tasks:**
1. Create `config/` folder with centralized constants
   - GameConfig.ts (game defaults: gravity, speed, etc.)
   - AssetPaths.ts (all asset URIs)
   - UIConfig.ts (UI sizes, colors, fonts)
   - NetworkConfig.ts (server endpoints)

2. Create `ui/core/UIComponent.ts` base class
   - Copy to a new file (don't modify existing panels yet)
   - Document the pattern

3. Create folder skeleton for new structure
   - `entities/base/`, `entities/player/`, `entities/npc/`, `entities/remote/`
   - `rendering/terrain/`, `rendering/environment/`, `rendering/effects/`, `rendering/atmosphere/`
   - `systems/world/`, `systems/collision/`, `systems/interaction/`, `systems/animation/`, `systems/physics/`
   - `ui/core/`, `ui/screens/`, `ui/hud/`, `ui/inventory/`, `ui/dialogs/`, `ui/helpers/`

4. Move existing files into new folders (no logic changes)
   - Copy (don't delete) existing files to new locations
   - Update imports in main.ts only
   - Run tests → should pass

5. Document folder structure in client/ARCHITECTURE.md

**Effort:** 8 hours  
**Risk:** Very low (adds folders, doesn't delete or modify logic)  
**Validation:** Tests pass, game boots, no regressions

---

### Phase 2: LoginScreen Refactoring (Week 2) — 8 hours
**Goal:** Extract form logic and establish refactoring pattern

**Tasks:**
1. Create `LoginForm.ts` (extract form UI & validation)
   - Move form rendering logic from LoginScreen
   - ~250 LOC
   - Extend UIComponent base class

2. Create `ServerSelector.ts` (extract server selection)
   - Move dropdown and server list logic
   - ~100 LOC
   - Extend UIComponent base class

3. Refactor LoginScreen.ts to orchestrate
   - ~400 LOC remaining
   - Delegates to LoginForm and ServerSelector
   - Manages screen transitions

4. Update imports (LoginScreen now imports LoginForm, ServerSelector)

5. Run tests → should pass

**Effort:** 8 hours  
**Risk:** Low (UI-only, isolated, lowest complexity)  
**Validation:** Login flow still works, form validation unchanged, tests pass

---

### Phase 3: NPC Refactoring (Week 3) — 16 hours
**Goal:** Decompose largest entity class, establish entity patterns

**Tasks:**
1. Create `entities/npc/NPCAppearance.ts` (rendering)
   - Extract mesh building, skeleton setup, materials
   - Move appearance-related logic
   - ~200 LOC

2. Create `entities/npc/NPCFactory.ts` (creation)
   - Factory pattern for NPC instantiation
   - Pooling, initialization, defaults
   - ~300 LOC

3. Refactor `entities/npc/NPC.ts` (core behavior)
   - Remove rendering and factory code
   - Keep: AI, dialogue, state machine, responses
   - ~400 LOC remaining

4. Update imports
   - WorldGenerator.ts → uses NPCFactory
   - EntityManager.ts → imports updated NPC path
   - ReactionSystem.ts → unchanged (uses NPC.respond())

5. Run tests → should pass

**Effort:** 16 hours  
**Risk:** Medium (largest class, complex behavior)  
**Validation:** NPCs spawn correctly, dialogue works, animations play, tests pass

---

### Phase 4: WorldGenerator Refactoring (Week 4-5) — 20 hours
**Goal:** Distribute procedural generation responsibilities

**Tasks:**
1. Create `systems/world/BiomeManager.ts`
   - Biome definition, noise settings, terrain rules
   - ~150 LOC

2. Create `systems/world/ChunkManager.ts`
   - Chunk lifecycle, streaming, loading/unloading
   - ~200 LOC

3. Create `systems/world/VegetationSpawner.ts` (extracted from rendering)
   - Tree placement, grass, flowers
   - Biome-aware spawning
   - ~200 LOC

4. Create `systems/world/BuildingSpawner.ts`
   - Building placement logic
   - ~150 LOC

5. Create `systems/world/CaveSpawner.ts`
   - Cave generation
   - ~100 LOC

6. Refactor `systems/world/WorldGenerator.ts` (orchestrator)
   - Delegates to specialists
   - ~300 LOC remaining

7. Move terrain rendering to `rendering/terrain/`
   - Terrain.ts stays but imports from ChunkManager
   - Keep rendering separate from logic

8. Update imports across codebase
   - DungeonSystem, ZoneTracker, main.ts

9. Run tests → should pass

**Effort:** 20 hours  
**Risk:** Medium-High (complex procedural logic, many dependencies)  
**Validation:** World generates, chunks stream, buildings spawn, caves load, tests pass

---

### Phase 5: Polish & Optimization (Week 5-6) — 12 hours
**Goal:** Finish remaining refactors, optimize, document

**Tasks:**
1. Create `BaseEntity` base class in `entities/base/`
   - Common interface for all entities
   - Move shared logic from Player, RemotePlayer, NPC

2. Extract UI helper functions
   - Create `ui/helpers/ButtonFactory.ts`
   - Create `ui/helpers/FormValidator.ts`
   - Used across all UI panels

3. Reorganize utilities
   - `utils/math/MathHelpers.ts` (vector, angle utilities)
   - `utils/asset/AssetLoader.ts` (texture, model loading)
   - `utils/asset/TextureCache.ts` (caching)
   - `utils/debug/DebugOverlay.ts` (dev tools)

4. Migrate UI panels to use UIComponent
   - InteractionPanel, CombatHUD, Nameplate, etc.
   - Use helpers (ButtonFactory, FormValidator)
   - ~50% LOC reduction per panel

5. Document patterns
   - Update client/ARCHITECTURE.md with code examples
   - Create REFACTORING_NOTES.md for team
   - Document base classes and patterns

6. Final integration testing
   - Play-test game end-to-end
   - Run full test suite
   - Check performance (same as before)

7. Clean up
   - Remove old duplicate files (if any)
   - Delete old imports
   - Final lint pass

**Effort:** 12 hours  
**Risk:** Low (mostly consolidation, last risky change in Phase 4)  
**Validation:** All tests pass, game fully functional, codebase much cleaner

---

## Detailed File Reference

### NPC.ts Refactoring Example

**Before (1552 LOC combined):**
```typescript
// entities/NPC.ts
export class NPC extends BaseCharacter {
  // Rendering
  nameplate: Nameplate;
  private buildMesh() { /* 200 LOC */ }
  private setupSkeleton() { /* 150 LOC */ }
  private setupMaterials() { /* 100 LOC */ }

  // Factory
  static create(data: NPCData) { /* 100 LOC */ }
  private initializeProperties() { /* 80 LOC */ }

  // Behavior
  private updateAI() { /* 250 LOC */ }
  respond(prompt: string) { /* 300 LOC */ }
  handleDialogue() { /* 150 LOC */ }

  // Animation
  animate() { /* 100 LOC */ }
  playEmote(name: string) { /* 80 LOC */ }
  // ... 1552 total
}
```

**After (focused files):**

```typescript
// entities/npc/NPCAppearance.ts (200 LOC)
export class NPCAppearance {
  private mesh: Group;
  private skeleton: Skeleton;
  private materials: Map<string, Material>;

  constructor(model: Object3D, config: NPCConfig) {
    this.mesh = this.buildMesh(model, config);
    this.setupSkeleton(this.mesh);
    this.setupMaterials();
  }

  private buildMesh(model: Object3D, config: NPCConfig): Group {
    // Mesh building logic (150 LOC)
  }

  private setupSkeleton(mesh: Group): void {
    // Skeleton setup (150 LOC)
  }

  private setupMaterials(): void {
    // Material setup (100 LOC)
  }

  getNameplate(): Nameplate {
    return new Nameplate(this.mesh);
  }
}

// entities/npc/NPCFactory.ts (300 LOC)
export class NPCFactory {
  private pool: ObjectPool<NPC>;

  constructor(scene: Scene) {
    this.pool = new ObjectPool(() => new NPC(scene));
  }

  create(npcData: NPCData): NPC {
    const npc = this.pool.get();
    npc.initialize(npcData);
    return npc;
  }

  private initializeProperties(npc: NPC, data: NPCData): void {
    // Init logic (100 LOC)
  }
}

// entities/npc/NPC.ts (400 LOC)
export class NPC extends BaseCharacter {
  private appearance: NPCAppearance;
  private state: NPCState;
  private behavior: NPCBehavior;

  constructor(appearance: NPCAppearance) {
    super();
    this.appearance = appearance;
  }

  // Pure behavior logic
  updateAI(deltaTime: number): void { /* 200 LOC */ }
  respond(prompt: string): NPCResponse { /* 150 LOC */ }
  handleDialogue(): void { /* 50 LOC */ }

  // Animation (delegates to appearance)
  animate(): void {
    this.appearance.animate();
  }
}
```

---

## Execution Checklist

### Quick Wins (Week 1, 8 hours)
- [ ] Create config/ folder with 4 files
- [ ] Create ui/core/UIComponent.ts base class
- [ ] Create folder skeleton (no file moves)
- [ ] Update main.ts imports for config
- [ ] Run tests → all pass
- [ ] Commit: "chore: add config folder and UIComponent base class"

### LoginScreen (Week 2, 8 hours)
- [ ] Create LoginForm.ts extending UIComponent
- [ ] Create ServerSelector.ts extending UIComponent
- [ ] Refactor LoginScreen.ts to delegate
- [ ] Update LoginScreen imports
- [ ] Test login flow end-to-end
- [ ] Run tests → all pass
- [ ] Commit: "refactor: decompose LoginScreen into form and selector"

### NPC Refactoring (Week 3, 16 hours)
- [ ] Create NPCAppearance.ts
- [ ] Create NPCFactory.ts
- [ ] Refactor NPC.ts core logic
- [ ] Update WorldGenerator imports
- [ ] Update EntityManager imports
- [ ] Test NPC spawning, animation, dialogue
- [ ] Run tests → all pass
- [ ] Commit: "refactor: decompose NPC into appearance, factory, core"

### WorldGenerator (Week 4-5, 20 hours)
- [ ] Create BiomeManager.ts
- [ ] Create ChunkManager.ts
- [ ] Create VegetationSpawner.ts
- [ ] Create BuildingSpawner.ts
- [ ] Create CaveSpawner.ts
- [ ] Refactor WorldGenerator.ts to orchestrate
- [ ] Update related imports
- [ ] Test world generation, streaming, spawning
- [ ] Run tests → all pass
- [ ] Commit: "refactor: decompose WorldGenerator into specialized modules"

### Polish (Week 5-6, 12 hours)
- [ ] Create BaseEntity base class
- [ ] Extract UI helpers
- [ ] Reorganize utils/
- [ ] Migrate UI panels to UIComponent
- [ ] Update ARCHITECTURE.md
- [ ] Full integration testing
- [ ] Run tests → all pass
- [ ] Commit: "refactor: complete architecture refactoring"

---

## Migration Strategy

### Per-Phase Approach
Each phase:
1. **Add new structure** (don't delete old code)
2. **Create new files** with refactored logic
3. **Update imports** gradually
4. **Run tests** after each step (should not break)
5. **Commit** with clear message

### Zero Breaking Changes
- Game behavior unchanged
- Server API unchanged
- All existing tests pass
- Features continue to work during refactoring

### Rollback Plan
If any phase encounters unforeseen issues:
1. Revert last commit
2. Return to previous known-good state
3. Pause refactoring, resume after root cause fixed

---

## Risk Assessment

| Risk | Likelihood | Severity | Mitigation |
|------|------------|----------|-----------|
| Circular imports | Low | High | Use dependency injection, keep layer boundaries clean |
| Test coverage gaps | Medium | Medium | Run full test suite after each phase, add unit tests as needed |
| Performance regression | Low | High | Profile before/after phases, use same patterns (no ECS overhaul) |
| Breaking changes to server contract | Very Low | Critical | Only modify client-side code, server API untouched |
| Timeline overrun | Medium | Medium | Track hours weekly, adjust scope if needed |

### Mitigation Strategies
1. **Tests first:** Ensure tests pass after each change
2. **Incremental commits:** Commit every 2-4 hours, easy to revert
3. **Pair review:** Have second pair of eyes on big changes (NPC, WorldGenerator)
4. **Profile before/after:** Check performance hasn't degraded
5. **Preserve branching strategy:** Keep main green, work on feature branch

---

## Success Criteria

### Objective Metrics
- [ ] No new test failures introduced
- [ ] Game boots and runs identically
- [ ] NPC.ts reduced from 1552 → 400 LOC
- [ ] WorldGenerator.ts reduced from 856 → 300 LOC
- [ ] LoginScreen.ts reduced from 862 → 400 LOC
- [ ] 20+ UI panels: 50% LOC reduction via UIComponent
- [ ] Zero circular imports (checked via ESLint)
- [ ] Zero `any` types (TypeScript strict mode)

### Qualitative Metrics
- [ ] Code is easier to understand (new contributor feedback)
- [ ] Changes are easier to make (time to add new NPC, new UI panel)
- [ ] Classes have single responsibility (pass "what is this class for?" test)
- [ ] Tests are easier to write (no God objects to mock)

### Team Confidence
- [ ] Lead reviewer approves structure
- [ ] No developer concerns about maintainability
- [ ] Clear documentation for onboarding

---

## FAQ

**Q: Will this break the game?**
A: No. We're refactoring structure, not gameplay. All logic is preserved. Tests validate this.

**Q: How long will the main branch be broken?**
A: Never. Work happens on a feature branch. Only merge when all tests pass.

**Q: Can I add features during refactoring?**
A: Yes, on a separate branch. Refactoring and features are independent.

**Q: What if I discover a bug while refactoring?**
A: Fix it in the same commit. Document why in commit message.

**Q: Should we implement an EventBus?**
A: Not in this plan. Focus on folder structure first. EventBus can be Phase 6 if needed.

**Q: Should we implement ECS (Entity Component System)?**
A: Not initially. BaseEntity is composition-friendly, but ECS adds complexity. Revisit in 6 months.

**Q: What about animation refactoring?**
A: Created `systems/animation/` folder. AnimationMixer centralizes animation state. Phase 5 can extract CharacterAnimator separately if needed.

---

## Appendix: Code Examples

### BaseEntity Usage
```typescript
export abstract class BaseEntity {
  id: string;
  position: Vector3;
  rotation: Quaternion;

  abstract update(deltaTime: number): void;

  getDistance(other: Vector3): number {
    return this.position.distanceTo(other);
  }
}

// Player and NPC both extend BaseEntity
export class Player extends BaseEntity {
  update(deltaTime: number): void {
    // Player-specific update
  }
}
```

### UIComponent Usage
```typescript
export class CustomPanel extends UIComponent {
  private button: HTMLButtonElement;

  render(): void {
    this.button = document.createElement('button');
    this.button.innerText = 'Click me';
    this.container.appendChild(this.button);
  }

  show(): void {
    super.show(); // Calls inherited show()
    this.button.focus();
  }
}
```

### WorldGenerator After Refactoring
```typescript
export class WorldGenerator {
  private biomeManager: BiomeManager;
  private chunkManager: ChunkManager;
  private vegetationSpawner: VegetationSpawner;
  private buildingSpawner: BuildingSpawner;

  async generateChunk(x: number, z: number): Promise<Chunk> {
    const biome = this.biomeManager.getBiome(x, z);
    const chunk = this.chunkManager.createChunk(x, z, biome);

    this.vegetationSpawner.spawnVegetation(chunk, biome);
    this.buildingSpawner.spawnBuildings(chunk, biome);

    return chunk;
  }
}
```

---

## Next Steps

1. **Review this plan** with the team
2. **Approve scope** (all 5 phases or subset?)
3. **Assign developer** (full-time or part-time?)
4. **Create feature branch** (`refactor/client-architecture`)
5. **Start Phase 1** (Week 1)
6. **Track progress** weekly
7. **Adjust scope** if needed

---

**Document Version:** 1.0  
**Last Reviewed:** May 2025  
**Next Review:** Upon completion of Phase 2  
**Maintained By:** Engineering Team
