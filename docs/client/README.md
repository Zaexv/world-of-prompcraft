# Client-Side Architecture & Planning

This directory contains documentation for World of Promptcraft's Three.js frontend architecture.

## Documents

### 📋 [architectural-refactoring-plan.md](./architectural-refactoring-plan.md)
**Comprehensive refactoring strategy for the client codebase**

A detailed, 815-line plan created by analyzing the entire client (88 TypeScript files, 20.5K LOC). This document covers:

- **Current State Analysis**: Metrics, pain points, god objects (NPC.ts 1552, WorldGenerator.ts 856, LoginScreen.ts 862)
- **Proposed Architecture**: New folder structure with 7 major groups (config/, entities/, rendering/, systems/, ui/, state/, network/)
- **Core Design Changes**: Base class patterns (UIComponent, BaseEntity) and decomposition strategies
- **5-Phase Implementation Plan**: Phased approach over 6 weeks:
  - Phase 1: Foundation (8 hours) — config, UIComponent, folder skeleton
  - Phase 2: LoginScreen refactoring (8 hours) — extract form and selector
  - Phase 3: NPC refactoring (16 hours) — decompose into appearance, factory, core
  - Phase 4: WorldGenerator refactoring (20 hours) — extract biome, chunk, vegetation, building, cave managers
  - Phase 5: Polish (12 hours) — helpers, utils reorganization, migration
- **Execution Checklist**: Detailed tasks with validation steps
- **Risk Assessment**: Mitigation strategies, success criteria, FAQ

**Key Insight**: Low-risk, high-impact refactoring focused on **folder organization and responsibility separation**, not architectural patterns (no ECS, no event bus in Phase 1).

---

## Quick Navigation

| Question | Answer |
|----------|--------|
| **What's wrong with the current code?** | See [Current State Analysis](./architectural-refactoring-plan.md#current-state-analysis) |
| **What's the new structure?** | See [Proposed Architecture](./architectural-refactoring-plan.md#proposed-architecture) |
| **How long will refactoring take?** | 6 weeks full-time, 12-14 weeks part-time (see [5-Phase Plan](./architectural-refactoring-plan.md#5-phase-implementation-plan)) |
| **What files change first?** | LoginScreen.ts, NPC.ts, WorldGenerator.ts (see [Phase prioritization](./architectural-refactoring-plan.md#execution-checklist)) |
| **Will this break the game?** | No. All tests pass, zero breaking changes (see [Migration Strategy](./architectural-refactoring-plan.md#migration-strategy)) |
| **Should we do this all at once?** | No. Do it phase-by-phase, validating at each step (see [Per-Phase Approach](./architectural-refactoring-plan.md#per-phase-approach)) |
| **What's the main design pattern?** | Base classes (UIComponent for UI, BaseEntity for entities) to eliminate boilerplate (see [Base Classes Pattern](./architectural-refactoring-plan.md#1-base-classes-pattern)) |

---

## Implementation Status

**Current**: Planning phase  
**Next**: Phase 1 (Week 1) — Foundation setup  
**Timeline**: 6 weeks to completion

Track progress in the main refactoring plan document using the [Execution Checklist](./architectural-refactoring-plan.md#execution-checklist).

---

## Quick Reference

### Folder Structure Overview
```
client/src/
├── config/       ← NEW: Centralized GameConfig, AssetPaths, UIConfig
├── entities/     ← REFACTORED: base/, player/, npc/, remote/
├── rendering/    ← RESTRUCTURED: terrain/, environment/, effects/, atmosphere/
├── systems/      ← REFACTORED: world/, collision/, interaction/, animation/, physics/
├── ui/           ← REFACTORED: core/, screens/, hud/, inventory/, dialogs/, helpers/
├── state/        ← UNCHANGED
├── network/      ← UNCHANGED
├── utils/        ← REFACTORED: math/, asset/, debug/
└── main.ts       ← UNCHANGED
```

### God Objects Being Decomposed
- **NPC.ts** (1552 → 400 LOC): Split into NPCAppearance, NPCFactory, NPC
- **WorldGenerator.ts** (856 → 300 LOC): Split into BiomeManager, ChunkManager, VegetationSpawner, BuildingSpawner, CaveSpawner
- **LoginScreen.ts** (862 → 400 LOC): Split into LoginForm, ServerSelector

### Key Numbers
- **88 files** total in client/
- **20,553 LOC** total
- **3,000+ LOC** of boilerplate UI (solved with UIComponent base class)
- **1,600 LOC** in god objects (NPC + WorldGenerator combined)
- **6 weeks** estimated to complete all phases
- **0 breaking changes** to gameplay or server API

---

## For Team Members

### First Time Reading?
1. Start with [Executive Summary](./architectural-refactoring-plan.md#executive-summary)
2. Skim [Proposed Architecture](./architectural-refactoring-plan.md#proposed-architecture) folder structure
3. Review [5-Phase Implementation Plan](./architectural-refactoring-plan.md#5-phase-implementation-plan) overview
4. Check [FAQ](./architectural-refactoring-plan.md#faq) for your questions

### Planning a Phase?
1. Go to the specific phase section
2. Review tasks and effort estimates
3. Check [Execution Checklist](./architectural-refactoring-plan.md#execution-checklist) for validation steps
4. Use the commit messages as guides

### Concerned About Risk?
1. Read [Risk Assessment](./architectural-refactoring-plan.md#risk-assessment)
2. Review [Migration Strategy](./architectural-refactoring-plan.md#migration-strategy)
3. See [Rollback Plan](./architectural-refactoring-plan.md#rollback-plan)

---

## Document Metadata

- **Version**: 1.0
- **Created**: May 2025
- **Last Reviewed**: May 2025
- **Next Review**: Upon completion of Phase 2
- **Scope**: Three.js + TypeScript frontend (client/src/)
- **Status**: Planning complete, ready for execution

---

*For questions or updates, refer to the main refactoring plan document.*
