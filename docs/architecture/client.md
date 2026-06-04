# Client Architecture — World of Promptcraft

Three.js + TypeScript frontend. The client is a render/runtime mirror around server-authoritative state, with local simulation for movement, camera, effects, and UI.

---

## Layer Overview

```mermaid
flowchart TD
    subgraph Boot["Bootstrap Layer"]
        M["main.ts"]
        GB["core/GameBootstrapper.ts"]
        GE["core/GameEngine.ts"]
        WSH["core/WebSocketHandler.ts"]
    end

    subgraph Scene["Scene Layer"]
        SM["SceneManager"]
        TR["Terrain"]
        LT["Lighting"]
        WA["Water"]
        FX["Effects"]
    end

    subgraph Runtime["Runtime Systems"]
        PC["PlayerController"]
        EM["EntityManager"]
        COL["CollisionSystem"]
        WG["WorldGenerator + ProceduralPopulator"]
        WB["WorldBuilder"]
        RE["ReactionSystem"]
        ZT["ZoneTracker + ZoneAtmosphere"]
        DUN["DungeonSystem"]
    end

    subgraph State["State Layer"]
        PS["PlayerState (singleton)"]
        NS["NPCStateStore"]
        WS["WorldState (client aggregate)"]
        WM["WorldManifest"]
        RT["RuntimeState"]
    end

    subgraph Net["Network Layer"]
        WSC["WebSocketClient"]
        MP["MessageProtocol types"]
    end

    subgraph UI["UI Layer"]
        UIM["UIManager"]
        IP["InteractionPanel"]
        CH["CombatHUD + CombatLog"]
        MM["Minimap"]
        CP["ChatPanel + ChatBubbleSystem"]
    end

    M --> GB --> GE
    GB --> WSH
    GB --> SM
    GB --> Runtime
    GB --> State
    GE --> Runtime
    GE --> UIM
    WSH --> RE
    WSC --> WSH
    MP --> WSC
    UIM --> WSC

    style GB fill:#4a90d9,color:#fff,stroke:#2c6fad
    style GE fill:#4a90d9,color:#fff,stroke:#2c6fad
    style WSH fill:#4a90d9,color:#fff,stroke:#2c6fad
    style RE fill:#4a90d9,color:#fff,stroke:#2c6fad
```

---

## Bootstrap Flow

```mermaid
sequenceDiagram
    participant L as LoginScreen
    participant M as main.ts
    participant B as bootstrap()
    participant W as WebSocketClient
    participant H as WebSocketHandler
    participant E as GameEngine

    L->>M: onEnterWorld(username,race,faction,skin)
    M->>B: bootstrap(config, app, overlay, loginScreen)
    B->>B: Build SceneManager + systems + UI + state stores
    B->>W: new WebSocketClient(ws://.../ws)
    B->>H: new WebSocketHandler(deps)
    B->>E: new GameEngine(deps)
    M->>E: start()
    W-->>H: join_ok / world_update / agent_response / npc_actions
    H-->>B: update entities/state/UI/effects
```

---

## Runtime Tick (GameEngine)

```mermaid
flowchart TD
    RAF["requestAnimationFrame"]
    SC["SceneManager.tick()"]
    PC["PlayerController.update(delta)"]
    PL["Player model update"]
    TR["Terrain.update(playerX, playerZ)"]
    WB["WorldBuilder.update()"]
    WG["WorldGenerator.update()"]
    EM["EntityManager.update()"]
    COL["CollisionSystem.update()"]
    RE["ReactionSystem.tick()"]
    ZS["ZoneTracker/ZoneAtmosphere update"]
    UI["UI updates (minimap, bubbles, HUD)"]
    NET["player_move send (10Hz)"]

    RAF --> SC --> PC --> PL --> TR --> WB --> WG --> EM --> COL --> RE --> ZS --> UI --> NET --> RAF

    style SC fill:#4a90d9,color:#fff,stroke:#2c6fad
    style RE fill:#4a90d9,color:#fff,stroke:#2c6fad
```

---

## Network & Message Handling

```mermaid
flowchart LR
    subgraph Outbound["Client → Server"]
        JOIN["join"]
        MOVE["player_move"]
        INT["interaction"]
        CHAT["chat_message"]
        ITEM["use_item / equip_item"]
        MOD["world_modify"]
    end

    subgraph Inbound["Server → Client"]
        JOK["join_ok / join_error"]
        WUP["world_update / player_joined / player_left"]
        ADR["agent_response"]
        NPA["npc_actions / npc_dialogue"]
        QUEST["quest_update / use_item_result"]
        WMOD["world_modify_start/chunk/end/response"]
    end

    WSC["WebSocketClient\nreconnect + heartbeat"] --> WSH["WebSocketHandler"]
    WSH --> EM["EntityManager"]
    WSH --> RE["ReactionSystem"]
    WSH --> UIM["UIManager"]

    Outbound --> WSC
    WSC --> Inbound

    style WSC fill:#4a90d9,color:#fff,stroke:#2c6fad
    style WSH fill:#4a90d9,color:#fff,stroke:#2c6fad
```

---

## Data-Driven World

`WorldManifest` is loaded in bootstrap and injected into terrain/biome/dungeon systems. `WorldGenerator` uses chunk callbacks from `Terrain` and delegates procedural spawn work to `ProceduralPopulator`, while authored objects are built through `WorldBuilder`.

```mermaid
flowchart TD
    WM["WorldManifest (shared/data/world_manifest.json)"]
    TER["Terrain chunk callbacks"]
    WG["WorldGenerator"]
    PP["ProceduralPopulator"]
    WB["WorldBuilder.spawnObject"]
    CS["CollisionSystem.addCollidableFiltered"]
    MM["Minimap waypoints"]

    WM --> WG
    TER --> WG
    WG --> PP
    WG --> WB
    WB --> CS
    WG --> MM

    style WG fill:#4a90d9,color:#fff,stroke:#2c6fad
    style WB fill:#4a90d9,color:#fff,stroke:#2c6fad
```

---

## Mesh Catalog & Registry (`client/src/meshes/`)

All reusable buildings/props/vegetation are class-based meshes registered via `registerMesh(...)`, then instantiated by type through the mesh registry.

```mermaid
flowchart LR
    BASE["Mesh base class"]
    REG["MeshRegistry\nregisterMesh/buildMesh"]
    BLD["buildings/*"]
    PRP["props/*"]
    VEG["vegetation/*"]
    PLC["WorldBuilder / ProceduralPopulator"]

    BASE --> BLD
    BASE --> PRP
    BASE --> VEG
    BLD --> REG
    PRP --> REG
    VEG --> REG
    PLC --> REG
```

---

## ReactionSystem — Action Dispatch

`ReactionSystem` maps `actions[]` to visual and state effects (damage/heal/items/quests/weather/move/emotes/world modifications/music), while avoiding double-application against partial `playerStateUpdate`.

```mermaid
flowchart TD
    AR["agent_response.actions[]"]
    DMG["damage/heal -> PlayerState + floating text + flashes"]
    NPC["npcStateUpdate -> NPCStateStore + nameplate"]
    FX["spawn_effect/change_weather/play_music"]
    Q["start/advance/complete quest banners"]
    WORLD["world_spawn/world_remove -> WorldBuilder"]

    AR --> DMG
    AR --> NPC
    AR --> FX
    AR --> Q
    AR --> WORLD
```
