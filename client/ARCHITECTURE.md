# Client Architecture — World of Promptcraft

Three.js + TypeScript frontend. No buttons — the text prompt is the entire game interface. The client is a **render mirror**: all authoritative game state lives on the server; the client reflects it visually and ships player input over WebSocket.

---

## Layer Overview

```mermaid
flowchart TD
    subgraph Network["🌐 Network Layer"]
        WS["WebSocketClient\nws://localhost:8000/ws\nauto-reconnect · heartbeat"]
        Proto["MessageProtocol\ndiscriminated union types"]
    end

    subgraph State["📦 State Layer"]
        PS["PlayerState (singleton)\nhp · mana · level · inventory\nquests · isDead"]
        WS2["WorldState\nrender mirror of server"]
        NS["NPCState\ncached NPC metadata"]
        QD["QuestDefinitions\nquest templates"]
    end

    subgraph Systems["⚙️ Systems Layer"]
        CS["CollisionSystem\ncannon-es swept AABB\nstatic + dynamic bodies"]
        IS["InteractionSystem\nraycaster · click · hover\npointer lock aware"]
        RS["ReactionSystem\naction dispatch\n3D effect triggers"]
        WG["WorldGenerator\n64×64 chunks\nbiome NPC spawning"]
        DS["DungeonSystem\nprocedural dungeon layout"]
        ZT["ZoneTracker\nzone boundary detection"]
    end

    subgraph Entities["🧑 Entity Layer"]
        PL["Player\nmodel · animation · movement"]
        NPC["NPC\nwander AI · HP bar · dialogue"]
        RP["RemotePlayer\ninterpolated remote positions"]
        EM["EntityManager\nMap<id, NPC | RemotePlayer>\nscene lifecycle"]
        PC["PlayerController\npointer lock · WASD · camera orbit"]
    end

    subgraph Scene["🎨 Scene Layer"]
        SM["SceneManager\nWebGLRenderer + PerspectiveCamera\nEffectComposer (UnrealBloom)"]
        TR["Terrain\nheightmap + biome colours"]
        WA["Water\nanimated plane + reflections"]
        SB["Skybox\nday/night gradient"]
        LT["Lighting\nambient + directional"]
        BL["Buildings\nElders' Village structures"]
        FM["FortMalaka\nMediterranean fortress"]
        VG["Vegetation\nprocedural trees"]
        EF["Effects\nparticles · floating text"]
    end

    subgraph UI["🖼️ UI Layer"]
        LP["LoginScreen"]
        IH["InteractionPanel\nfree-text prompt input"]
        CH["CombatHUD\nhp/mana bars"]
        IV["InventoryPanel"]
        QL["QuestLog"]
        CP["ChatPanel\nmultiplayer chat"]
        MM["Minimap"]
        DS2["DeathScreen"]
    end

    WS -->|"JSON messages"| Proto
    Proto --> State
    State --> Systems
    State --> Entities
    Systems --> Entities
    Entities --> Scene
    Scene --> SM
    UI -->|"player input"| WS
    WS -->|"AgentResponse\nactions[]"| RS
    RS --> EF
```

---

## Bootstrap Flow

```mermaid
sequenceDiagram
    participant L as LoginScreen
    participant M as main.ts
    participant SM as SceneManager
    participant WS as WebSocketClient
    participant SYS as Systems

    L->>M: onLogin(playerName)
    M->>SM: new SceneManager()
    SM->>SM: WebGLRenderer + EffectComposer (UnrealBloom)
    SM->>SM: Terrain · Skybox · Lighting · Water · Buildings · FortMalaka · Vegetation · Effects
    M->>SYS: new CollisionSystem(scene)
    M->>SYS: new WorldGenerator(scene, collisionSystem)
    M->>SYS: new InteractionSystem(camera, scene, ...)
    M->>SYS: new ReactionSystem(scene, ...)
    M->>SYS: new ZoneTracker()
    M->>WS: new WebSocketClient(url)
    WS-->>M: onOpen → send join {playerName}
    WS-->>M: join_ok {playerId, npcs[], worldState}
    M->>M: EntityManager.init(npcs)
    M->>M: requestAnimationFrame → render loop
```

---

## Render Loop

```mermaid
flowchart TD
    RAF["requestAnimationFrame"]
    DT["delta = clock.getDelta()"]
    PC["PlayerController.update(delta)\nWASD movement · camera orbit · pointer lock"]
    COL["CollisionSystem.update(delta)\nwall-slide · terrain follow\ndynamic NPC bodies sync"]
    WG["WorldGenerator.update(playerPos)\nchunk generation / despawn"]
    ZT["ZoneTracker.update(playerPos)\nzone change events"]
    IS["InteractionSystem.update()\nhover highlight · click detection"]
    ENT["EntityManager.update(delta)\nNPC wander AI · remote player lerp"]
    SC["SceneManager.tick()\nwater/effects update + adaptive quality\nThree.js renderer + EffectComposer"]
    WS["WebSocket\nposition broadcast (throttled)"]

    RAF --> DT --> PC --> COL --> WG --> ZT --> IS --> ENT --> SC --> WS --> RAF
```

---

## Scene Layer

```mermaid
flowchart LR
    subgraph SceneManager["SceneManager"]
        R["WebGLRenderer\nshadows ON · ACES tonemapping\nadaptive pixel ratio (0.9..1.5)"]
        C["PerspectiveCamera\nfov 60 · near 0.1 · far 1600"]
        EC["EffectComposer\nRenderPass + UnrealBloomPass\nhalf-resolution bloom"]
    end

    subgraph Subscenes["Scene Objects"]
        TR["Terrain\nchunked procedural mesh (64×64)\nheightmap noise · biome vertex colours"]
        WA["Water (ThreeWater)\nplanar reflections · animated normal map\ny=−1 · clipBias 0.003"]
        SB["Skybox\nLargeBoxGeometry · gradient\nclouds procedural"]
        LT["Lighting\nDirectionalLight 1.2\nAmbientLight 0.4\nHemisphereLight"]
        BL["Buildings\nElders' Village huts · well · shrine"]
        FM["FortMalaka\ntowers · walls · gateway · torches"]
        VG["Vegetation\nprocedural trees + instancing\ncollision tags + distance shadow tags"]
        EF["Effects\nParticleSystem · FloatingText"]
    end

    SceneManager --> Subscenes
```

---

## Entity System

```mermaid
flowchart TD
    EM["EntityManager\nMap&lt;string, NPC&gt;\nMap&lt;string, RemotePlayer&gt;"]

    subgraph NPC["NPC"]
        NM["BoxGeometry model\nHP bar (CSS2DObject)\n_healthBar DOM element"]
        NW["Wander AI\nrandom target within radius\npause between waypoints"]
        NH["Hover highlight\nmesh.material.emissive"]
    end

    subgraph RP["RemotePlayer"]
        RPM["CapsuleGeometry\ncolour from player name hash\nname label (CSS2DObject)"]
        RPI["Position interpolation\nlerpFactor = 0.15/frame"]
    end

    subgraph PL["Player (local)"]
        PLM["CapsuleGeometry\nhead + body segments"]
        PLC["PlayerController\npointer lock · WASD · sprint"]
        PLX["WoW-style camera\norbit around head y+1.6\ndual collision: terrain + raycaster\ninstant pull-in · smooth pull-out"]
    end

    EM --> NPC
    EM --> RP
    EM --> PL
```

---

## Collision System

The game uses **cannon-es swept AABB** with tag-based geometry filtering so decorative mesh parts (canopies, arches) don't block movement.

```mermaid
flowchart TD
    subgraph Registration["Collision Registration"]
        AC["addCollidable(mesh)\nwhole mesh → static body"]
        ACF["addCollidableFiltered(group)\nonly userData.isCollider=true meshes"]
        DS["setDynamicSource(npcId, getPos)\nNPC hitbox — position polled each frame"]
    end

    subgraph Update["Per-Frame Update"]
        AABB["Collect all static bodies\n+ dynamic NPC positions"]
        SWEEP["Swept AABB\nplayerBox + velocity * dt"]
        SLIDE["Wall sliding\n3 iterations: X → Z → XZ\nskin width = 0.05"]
        TF["Terrain follow\ngetHeightAt(x,z) → y clamp"]
    end

    subgraph Tags["Tag-Based Filtering"]
        T1["trunk.userData.isCollider = true  → blocks"]
        T2["canopy.userData.isCollider = false → pass-through"]
        T3["wall.userData.isCollider = true   → blocks"]
        T4["arch.userData.isCollider = false  → pass-through"]
    end

    Registration --> Update
    Tags --> ACF
```

**What has collision:**

| Category | Method | Blocks |
|----------|--------|--------|
| Buildings / Fort walls | `addCollidablesFiltered()` | Pillars, walls, tower bodies |
| Trees (procedural) | `addCollidableFiltered()` | Trunk meshes only |
| Massive trees | `addCollidablesFiltered()` | Trunk + root base |
| Towns (procedural) | `addCollidableFiltered()` | Hut walls, well base |
| Caves | `addCollidable()` | Whole entrance |
| NPCs | `setDynamicSource()` | Body hitbox (synced each frame) |
| Terrain | `getHeightAt()` | Heightmap ground follow |

---

## Procedural World

```mermaid
flowchart TD
    POS["Player position"]
    CK["Chunk key = ⌊x/64⌋, ⌊z/64⌋"]
    LOAD["Load 5×5 chunk radius"]
    UNLOAD["Unload chunks outside 7×7"]

    subgraph Biomes["Biome Assignment"]
        B1["forest — trees, friendly NPCs (merchant/guard/healer)"]
        B2["tundra — snow trees, tundra hostiles"]
        B3["plains — sparse trees, mixed"]
        B4["ember — lava rocks, ember hostiles (dragon, fire_mage)"]
        B5["dark — dead trees, dark hostiles"]
    end

    subgraph Spawn["Per-Chunk Spawning"]
        T["Trees — 8–15 per chunk\ntrunk collision registered"]
        N["NPCs — 1–3 per chunk\nbiome NPC pool"]
        C["Cave — 8% chance"]
        TW["Town — 2% chance\nhuts + well"]
    end

    POS --> CK --> LOAD --> Biomes --> Spawn
    LOAD --> UNLOAD
```

---

## Network Layer

```mermaid
flowchart LR
    subgraph Client["Client"]
        WSC["WebSocketClient\nws://localhost:8000/ws"]
        MP["MessageProtocol\ndiscriminated union:\nPlayerInteraction\nPlayerMovement\nChatMessage\n…"]
    end

    subgraph Server["Server"]
        FE["FastAPI /ws endpoint"]
    end

    subgraph Reconnect["Auto-Reconnect"]
        EB["Exponential backoff\n1s → 2s → 4s … max 30s"]
        HB["Heartbeat ping every 30s\ndetects silent drops"]
    end

    WSC -->|"JSON send()"| MP
    MP -->|"WebSocket frame"| FE
    FE -->|"AgentResponse\nnpc_dialogue\nnpc_actions\nplayer_moved"| WSC
    WSC --> EB
    WSC --> HB
```

**Outbound message types (client → server):**

| Type | Payload | When |
|------|---------|------|
| `join` | `{playerName}` | On connect |
| `player_interaction` | `{npcId, prompt, playerState}` | NPC text submit |
| `player_movement` | `{position, rotation}` | Every 100 ms |
| `chat_message` | `{message}` | Chat panel submit |
| `player_attack` | `{npcId, damage}` | Direct attack action |

**Inbound message types (server → client):**

| Type | Effect |
|------|--------|
| `join_ok` | Initialises world, spawns NPCs |
| `agent_response` | Shows NPC dialogue, triggers 3D actions |
| `npc_dialogue` | Nearby broadcast — shows chat bubble |
| `npc_actions` | Nearby broadcast — triggers effects |
| `player_moved` | Interpolates remote player position |
| `chat_broadcast` | Shows message in chat panel |
| `world_event` | Zone change, weather update |

---

## UI Layer

```mermaid
flowchart TD
    subgraph Always["Always Present"]
        CH["CombatHUD\nhp/mana bars · level badge"]
        MM["Minimap\ncanvas 2D · dot per entity"]
        CP["ChatPanel\nmultiplayer chat"]
    end

    subgraph Contextual["Contextual"]
        IP["InteractionPanel\nfree-text input on NPC click/hover\nhidden until interaction starts"]
        IV["InventoryPanel\ngrid layout · drag-drop"]
        QL["QuestLog\nactive/completed quests"]
    end

    subgraph Screens["Full-Screen Overlays"]
        LS["LoginScreen\ncharacter name + server URL"]
        DS["DeathScreen\nrespawn button"]
        QB["QuestBanner\nquest start/complete overlay"]
    end

    subgraph Floating["World-Space Floating"]
        FT["FloatingText\ndamage · heal · loot numbers"]
        HB["HP Bars (CSS2DObject)\nabove NPC heads"]
        NL["Name Labels (CSS2DObject)\nremote player names"]
    end
```

---

## State Management

```mermaid
flowchart LR
    subgraph Singleton["Singletons (module-level)"]
        PS["PlayerState\nhp · mana · level · inventory\nequipped · activeQuests · isDead\nxp · gold"]
    end

    subgraph PerSession["Per-Session (class instances)"]
        WS["WorldState\nnpcs Map · weather · zone\nrender mirror only"]
        NS["NPCState\nnpcId → {hp, mood, name}\nupdated on agent_response"]
    end

    subgraph Static["Static Data"]
        QD["QuestDefinitions\nquest templates: objectives, rewards\nloaded at startup"]
    end

    PS -->|"serialised as playerState{}"| Net["WebSocket send"]
    Net -->|"playerStateUpdate{}"| PS
    WS -->|"join_ok → npcs[]"| EM["EntityManager"]
```

---

## ReactionSystem — Action Dispatch

When the server returns `agent_response.actions[]`, `ReactionSystem` translates each `kind` into a 3D effect:

```mermaid
flowchart TD
    AR["AgentResponse\nactions: Action[]"]

    subgraph Kinds["Action Kinds"]
        DMG["damage\n→ reduce PlayerState.hp\n→ red FloatingText + screen flash"]
        HEAL["heal\n→ restore PlayerState.hp\n→ green FloatingText + green flash"]
        GIVE["give_item\n→ PlayerState.inventory.push()\n→ gold FloatingText + inventory open"]
        TAKE["take_item\n→ PlayerState.inventory.splice()\n→ inventory update"]
        EMOTE["emote\n→ NPC animation trigger"]
        MOVE["move_npc\n→ NPC lerp to new position"]
        EFFECT["spawn_effect\n→ ParticleSystem.burst(position)"]
        WEATHER["change_weather\n→ scene fog density adjust"]
        QUEST_S["start_quest\n→ QuestLog.add()\n→ QuestBanner overlay"]
        QUEST_C["complete_quest\n→ QuestLog.complete()\n→ QuestBanner + reward"]
        QUEST_A["advance_objective\n→ QuestLog.updateObjective()\n→ tracker update"]
    end

    AR --> Kinds
```

---

## Refactoring: New Folder Organization (In Progress)

The architecture is being refactored to improve maintainability and testability. This is a **phased, non-breaking refactoring** that preserves all game logic while reorganizing code around clear responsibility boundaries.

### New Folder Structure

```
client/src/
├── config/              ← NEW: Centralized configuration (Phase 1 ✓)
│   ├── GameConfig.ts   (gravity, speed, combat values)
│   ├── AssetPaths.ts   (all asset URIs)
│   ├── UIConfig.ts     (colors, dimensions, fonts, z-index)
│   ├── NetworkConfig.ts (server endpoints, reconnect strategy)
│   └── index.ts
│
├── entities/           ← REFACTORED: Cleaner composition (Phase 1 ✓)
│   ├── base/          (Base classes: BaseEntity, BaseCharacter)
│   ├── player/        (Player, PlayerController)
│   ├── npc/           (NPC, NPCFactory, NPCAppearance) [Phase 3]
│   ├── remote/        (RemotePlayer)
│   ├── EntityManager.ts
│   └── index.ts
│
├── rendering/         ← RESTRUCTURED: Grouped by visual layer (Phase 1 ✓)
│   ├── terrain/       (Terrain, ChunkManager)
│   ├── environment/   (Water, Skybox, Lighting, VegetationSpawner)
│   ├── effects/       (ParticleSystem, EffectsRenderer)
│   ├── atmosphere/    (Weather, Fog)
│   ├── RenderQueue.ts
│   └── index.ts
│
├── systems/           ← REFACTORED: One job per system (Phase 1 ✓)
│   ├── world/         (WorldGenerator, BiomeManager, ChunkManager, etc.) [Phase 4]
│   ├── collision/     (CollisionSystem)
│   ├── interaction/   (InteractionSystem, ReactionSystem)
│   ├── animation/     (CharacterAnimator, NPCAnimator, AnimationMixer)
│   ├── physics/       (PhysicsEngine)
│   ├── ZoneTracker.ts
│   └── index.ts
│
├── ui/                ← REFACTORED: Base classes + organized panels (Phase 1 ✓)
│   ├── core/          (UIComponent base class, UIManager)
│   ├── screens/       (LoginScreen, LoginForm, ServerSelector) [Phase 2]
│   ├── hud/           (InteractionPanel, CombatHUD, Nameplate, Minimap)
│   ├── inventory/     (InventoryPanel, EquipmentSlot)
│   ├── dialogs/       (QuestDialog, TradeDialog, ConfirmDialog)
│   ├── helpers/       (ButtonFactory, FormValidator)
│   └── index.ts
│
├── state/             ← UNCHANGED: Already clean
│   ├── PlayerState.ts
│   ├── WorldState.ts
│   └── index.ts
│
├── network/           ← UNCHANGED: Already focused
│   ├── WebSocketClient.ts
│   ├── MessageProtocol.ts
│   └── index.ts
│
├── utils/             ← REFACTORED: Organized into categories (Phase 1 ✓)
│   ├── math/          (MathHelpers, vector utilities)
│   ├── asset/         (AssetLoader, TextureCache)
│   ├── debug/         (DebugOverlay, dev tools)
│   └── index.ts
│
├── main.ts            (Unchanged bootstrap)
└── ARCHITECTURE.md    (This file)
```

### Refactoring Phases

**Phase 1: Foundation** ✓ COMPLETE
- Created `/config/` with GameConfig, AssetPaths, UIConfig, NetworkConfig
- Created `UIComponent` base class in `/ui/core/`
- Created folder skeleton for new structure
- All tests passing

**Phase 2: LoginScreen Refactoring** ✓ COMPLETE
- Extract `LoginForm.ts` from LoginScreen (370 LOC)
- Extract `ServerSelector.ts` from LoginScreen (pending, not needed yet)
- Refactor LoginScreen.ts to delegate (862 → 597 LOC, 30.8% reduction)
- Time: ~8 hours | Risk: Low
- Status: Done — all tests pass, LoginForm extends UIComponent

**Phase 3: NPC Refactoring** (Week 3)
- Extract `NPCAppearance.ts` (mesh, skeleton, materials)
- Extract `NPCFactory.ts` (creation, pooling)
- Refactor NPC.ts (behavior, AI, dialogue)
- Time: ~16 hours | Risk: Medium

**Phase 4: WorldGenerator Refactoring** (Week 4-5)
- Extract `BiomeManager.ts`, `ChunkManager.ts`, `VegetationSpawner.ts`
- Extract `BuildingSpawner.ts`, `CaveSpawner.ts`
- Refactor WorldGenerator.ts as orchestrator
- Time: ~20 hours | Risk: Medium-High

**Phase 5: Polish & Optimization** (Week 5-6)
- Create `BaseEntity` base class
- Extract UI helpers (ButtonFactory, FormValidator)
- Reorganize utils/ into math/, asset/, debug/
- Migrate UI panels to UIComponent
- Update documentation
- Time: ~12 hours | Risk: Low

**Total: 6 weeks full-time | 12-14 weeks part-time | 64 hours effort**

### Key Design Patterns

**Base Classes**:
- `UIComponent` — All UI panels extend this (reduces ~50% boilerplate)
- `BaseEntity` — All game entities extend this (composition-friendly)
- `BaseCharacter` — Entities with movement & animation

**Factories**:
- `NPCFactory` — Instantiate and pool NPCs
- `ButtonFactory` — Create styled buttons (helpers)

**Configuration**:
- All constants centralized in `/config/`
- Import from one place, change everywhere
- Environment-aware (dev vs. prod)

### Quality Metrics Preserved

- ✓ **TypeScript Strict Mode** — No `any` types
- ✓ **ESLint** — All existing rules enforced
- ✓ **Tests** — All pass, no new failures
- ✓ **Game Behavior** — Identical, zero breaking changes
- ✓ **Server API** — Unchanged, backward compatible

### Progress Tracking

See `docs/client/architectural-refactoring-plan.md` for detailed phase breakdowns, execution checklists, and code examples.

**Status**: Phase 1 & Phase 2 complete. Ready for Phase 3 (NPC refactoring)  
**Last Updated**: May 2025  
**Next Review**: After Phase 3
