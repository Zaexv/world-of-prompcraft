# Client Architecture — World of Promptcraft

Three.js + TypeScript frontend. No buttons — the text prompt is the entire game interface. The client is a **render mirror**: all authoritative game state lives on the server; the client reflects it visually and ships player input over WebSocket. The world itself is defined by a **Zonal Hybrid Manifest** (`shared/data/world_manifest.json`).

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
        WM["WorldManifest\ndata-driven world definitions (JSON)"]
    end

    subgraph Systems["⚙️ Systems Layer"]
        CS["CollisionSystem\ncannon-es swept AABB\nstatic + dynamic bodies"]
        IS["InteractionSystem\nraycaster · click · hover\npointer lock aware"]
        RS["ReactionSystem\naction dispatch\n3D effect triggers"]
        WG["WorldGenerator\nchunk lifecycle orchestrator\ndelegates to WorldBuilder"]
        WB["WorldBuilder\nspawn manifest landmarks/dungeons"]
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
        TR["Terrain\nheightmap + biome colours (from Manifest)"]
        WA["Water\nanimated plane + reflections"]
        SB["Skybox\nday/night gradient"]
        LT["Lighting\nambient + directional"]
        LM["Landmarks\nManifest-defined POIs"]
        DG["Dungeons\nManifest-defined interior instances"]
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
    SM->>SM: Terrain · Skybox · Lighting · Water · Effects
    M->>SYS: new CollisionSystem(scene)
    M->>SYS: new WorldManifest() (loads JSON)
    M->>SYS: new WorldBuilder(scene, manifest)
    M->>SYS: new WorldGenerator(scene, collisionSystem, manifest, builder)
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

## Data-Driven World (Version 2.1.0 Manifest System)

The game uses a **Zonal Hybrid Manifest** (`shared/data/world_manifest.json`) instead of purely procedural generation. This ensures consistency between client visuals and server authority.

```mermaid
flowchart TD
    POS["Player position"]
    CK["Chunk key = ⌊x/64⌋, ⌊z/64⌋"]
    LOAD["Load 5×5 chunk radius"]
    UNLOAD["Unload chunks outside 7×7"]

    subgraph Manifest["world_manifest.json"]
        MEnv["world.environment\nBiomes (colors, height modifiers)"]
        MTop["world.topology\nVertical features (mountains)"]
        MZones["zones\nBounds, Landmarks, NPCs, Dungeons"]
    end

    subgraph Generation["Chunk Generation"]
        TR["Terrain.ts\nBuilds mesh using Manifest Biome data"]
        WG["WorldGenerator.ts\nQueries Manifest for Landmarks in chunk"]
        WB["WorldBuilder.ts\nInstantiates 3D Landmark models"]
    end

    POS --> CK --> LOAD
    LOAD --> Generation
    Manifest --> Generation
    LOAD --> UNLOAD
```

---

## Mesh Catalog & Registry (`client/src/meshes/`)

Every placeable object — buildings, props, and vegetation — is a **class in its own
file** under `client/src/meshes/`, registered in a central catalog. Geometry ("what it
looks like") is fully separated from placement ("where/when it appears"). There are
**no `switch` statements** mapping a type string to a builder — the registry does that
lookup, and `buildObject()` is a thin wrapper over it (unknown types render a marker).

```mermaid
flowchart TD
    subgraph Catalog["meshes/ — geometry catalog"]
        BASE["core/Mesh.ts\nabstract base: static type/category (+aliases)\nbuild(ctx): Object3D"]
        REG["core/MeshRegistry.ts\ntype → instance map\nregisterMesh · buildMesh · meshTypes"]
        MAL["buildings/malaka/*\n11 Andalusian classes + MalakaKit"]
        STR["buildings/structures/*\n9 generic classes (Moonwell, Tower, Road…)"]
        BIO["buildings/biome/*\n19 procedural classes + BiomeKit\n+ BiomeBuildings (biome→type[] table)"]
        PROP["props/*\n3 furniture + 20 biome props\n+ BiomeProps (biome→type[] table)"]
        VEG["vegetation/*\n3 LOD classes (AncientTree, Mushroom, Crystal)"]
    end

    subgraph Placement["Placement layer — where/when"]
        WB["WorldBuilder.spawnObject()\nauthored landmarks → buildObject()"]
        PP["ProceduralPopulator\nselectBiomeBuildingType / selectBiomePropType"]
        FO["Forest.ts\nmoonwell / pavilion / bonfire set-pieces"]
    end

    MAL & STR & BIO & PROP & VEG -->|"registerMesh() at import"| REG
    BASE --> MAL & STR & BIO & PROP & VEG
    WB -->|"buildMesh(type, ctx)"| REG
    PP -->|"buildMesh(type, ctx)"| REG
    FO -->|"buildMesh(type, ctx)"| REG
```

**Key points**
- **One mesh = one class = one file.** Each `extends Mesh`, declares `static readonly type`
  / `static readonly category` (`building` | `prop` | `vegetation`), implements
  `build(ctx: BuildContext): THREE.Object3D`, and calls `registerMesh(...)` at the bottom of its file.
- **Self-registration.** `meshes/index.ts` side-effect-imports `buildings/`, `props/`, and
  `vegetation/`, which import every class file. Importing the catalog registers everything; nothing
  else needs editing.
- **Aliases.** A class may expose `static readonly aliases` to answer to legacy/synonym type
  strings (e.g. `AncientTree` also serves `tree` / `pine` / `ancient_tree_cluster`).
- **`build()` is pure geometry.** No scene insertion, collision registration, or persistence —
  those stay in the placement layer (`WorldBuilder` / `WorldGenerator` / `ProceduralPopulator`).
- **Procedural selection is a data table.** `BiomeBuildings.ts` / `BiomeProps.ts` map each biome to
  its building/prop `type[]`; `selectBiomeBuildingType()` / `selectBiomePropType()` pick one with the
  seeded RNG (preserving deterministic layouts), then `buildMesh()` constructs it.
- **Shared kits.** `MalakaKit` (Andalusian material cache + architectural helpers) and `BiomeKit`
  (`m`/`solid`/`deco` helpers + material cache) are imported by the classes so textures and materials
  are created once and reused. Biome props reuse `BiomeKit` too.

> **Scope:** buildings, props, and vegetation are migrated. The remaining geometry outside the
> catalog is **encounter set-pieces** (`worldbuilder/objects/encounterBuilders.ts` — multi-object
> compositions placed by the encounter system, a different layer) and **NPC body meshes**
> (`entities/`). Both can adopt the same `Mesh` base + registry in a later pass.

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
        T1["wall.userData.isCollider = true   → blocks"]
        T2["arch.userData.isCollider = false  → pass-through"]
    end

    Registration --> Update
    Tags --> ACF
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
