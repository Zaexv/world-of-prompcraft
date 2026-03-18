# World of Promptcraft — Architecture

A Three.js + LangGraph game where players interact with AI-powered NPCs in a 3D fantasy world.

---

## 1. System Overview

```mermaid
graph TB
    subgraph Client ["Client (Browser)"]
        direction TB
        ThreeJS["Three.js 3D Engine"]
        UI["UI Overlays"]
        WSClient["WebSocket Client"]
    end

    subgraph Server ["Server (Python)"]
        direction TB
        FastAPI["FastAPI App"]
        WSHandler["WebSocket Handler"]
        Registry["Agent Registry"]
        LangGraph["LangGraph Agents"]
        WorldState["World State"]
    end

    subgraph External ["External Services"]
        OpenAI["OpenAI API<br/>(gpt-4o-mini)"]
        Anthropic["Anthropic API<br/>(claude-sonnet-4)"]
    end

    Client <-->|"WebSocket<br/>ws://localhost:8000/ws"| Server
    LangGraph -->|"LLM calls"| OpenAI
    LangGraph -->|"LLM calls"| Anthropic

    style Client fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
    style Server fill:#0a1628,stroke:#4488cc,color:#b8d8f8
    style External fill:#1a0a28,stroke:#aa66ff,color:#d8b8f8
```

The system follows a client-server architecture connected by a single WebSocket. The client renders the 3D world and manages player input; the server runs LangGraph agent graphs that reason about player prompts, invoke tools, and return structured responses with dialogue and game actions.

---

## 2. Client Architecture

```mermaid
graph TB
    Main["main.ts<br/>Game Init & Loop"]

    Main --> SM["SceneManager<br/>Renderer, Bloom Post-processing"]
    Main --> PC["PlayerController<br/>WASD, Pointer Lock, Jump,<br/>Water + Raycaster Collision"]
    Main --> P["Player<br/>Night Elf Model + Cape"]
    Main --> EM["EntityManager<br/>NPC Registry + Wandering AI"]
    Main --> IS["InteractionSystem<br/>Raycaster + Click"]
    Main --> RS["ReactionSystem<br/>Actions → 3D Effects + Death"]
    Main --> CS["CollisionSystem<br/>Raycaster-based, 3 heights"]
    Main --> WG["WorldGenerator<br/>Chunk-based tree/NPC spawning"]
    Main --> UM["UIManager<br/>All HUD Overlays"]
    Main --> WS["WebSocketClient<br/>Auto-reconnect + Queue"]

    subgraph State ["State Stores"]
        PS["PlayerState (Singleton)<br/>isDead, onDeath, respawn()"]
        NS["NPCStateStore"]
        WState["WorldState"]
    end

    Main --> PS & NS & WState

    SM --> Terrain["Terrain<br/>Infinite chunks (64x64)"]
    SM --> Water["Water<br/>Reflective (Three.js Water)"]
    SM --> Buildings["Buildings<br/>Elven: moonwell, tree-house,<br/>sentinel tower, pavilion"]
    SM --> Vegetation["Vegetation<br/>Massive trees, mushrooms,<br/>ferns, vines"]
    SM --> Skybox["Skybox<br/>CubeTexture: stars, moons, nebula"]
    SM --> Lighting["Lighting<br/>Moonlight + 3 moonbeam spots"]
    SM --> Effects["Effects<br/>Wisps, particles, glow, leaves"]

    subgraph UI ["UI Panels"]
        LS["LoginScreen<br/>Dark Portal + Enter World"]
        IP["InteractionPanel<br/>Chat + Action Buttons per NPC"]
        SB["StatusBars<br/>HP/Mana + Gold frames"]
        INV["InventoryPanel<br/>WoW-style 4x5 grid (I key)"]
        CL["CombatLog<br/>Timestamped, color-coded"]
        CH["CombatHUD<br/>Unit frames + combat log"]
        DP["DamagePopup<br/>Screen-space floating numbers"]
        IUE["ItemUseEffect<br/>Potion glow + particles"]
        DS["DeathScreen<br/>Game Over + Respawn"]
        CTR["ControlsHelp<br/>Keybinding reference (H key)"]
    end

    UM --> UI

    EM --> NPC["NPC Entities<br/>Wander AI + Role accessories"]
    NPC --> NA["NPCAnimator<br/>idle/walk/attack/emote"]
    NPC --> NP["Nameplate<br/>Gold text + HP bar sprite"]
    NPC --> AI["ActionIcon<br/>Floating emoji status"]

    IS -->|"onNPCClick"| UM
    IP -->|"onSendMessage"| WS
    WS -->|"agent_response"| RS & IP & CH & CL
    WS -->|"use_item_result"| RS & IUE & CL
    RS --> PS & NS
    PC --> CS
    Terrain -->|"onChunkLoaded"| WG

    style Main fill:#c5a55a,stroke:#8b6914,color:#1a1108
    style State fill:#1a2808,stroke:#88aa44,color:#c8e8a8
    style UI fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
```

**Game loop** (`animate()`): SceneManager renders (bloom post-processing), PlayerController updates (skip if dead), Player model follows, EntityManager ticks NPCs (wandering AI + terrain following), ReactionSystem processes active effects, Terrain loads/unloads chunks around player.

---

## 3. Server Architecture

```mermaid
graph TB
    subgraph FastAPI ["FastAPI Application"]
        App["main.py<br/>Lifespan Init"]
        Health["/health endpoint"]
        WSEndpoint["/ws endpoint"]
    end

    subgraph WebSocket ["WebSocket Layer"]
        ConnMgr["ConnectionManager<br/>Active connections list"]
        Handler["handler.py<br/>Message Router"]
    end

    subgraph Agents ["Agent System"]
        Registry["AgentRegistry<br/>1 graph per NPC"]
        GraphFactory["npc_agent.py<br/>Graph Factory"]
        AgentState["NPCAgentState<br/>TypedDict"]
    end

    subgraph Nodes ["LangGraph Nodes"]
        Reason["reason<br/>LLM + System Prompt"]
        Act["act<br/>Tool Execution"]
        Respond["respond<br/>Extract Dialogue"]
    end

    subgraph Tools ["Tool Categories"]
        Combat["combat<br/>deal_damage, defend,<br/>flee, heal_target"]
        Dialogue["dialogue<br/>emote, give_quest,<br/>complete_quest"]
        Trade["trade<br/>offer_item, take_item"]
        Environment["environment<br/>change_weather,<br/>spawn_effect, move_npc"]
        WorldQuery["world_query<br/>get_nearby_entities,<br/>check_player_state"]
    end

    subgraph World ["World Layer"]
        WorldState["WorldState<br/>(Singleton)"]
        NPCDefs["NPC Definitions"]
        Personalities["Personality Templates"]
        Zones["Zone System"]
        PlayerData["PlayerData"]
    end

    subgraph LLM ["LLM Provider"]
        Provider["provider.py<br/>Factory"]
        OpenAI["ChatOpenAI"]
        Claude["ChatAnthropic"]
    end

    App --> ConnMgr
    App --> Registry
    App --> Provider
    WSEndpoint --> ConnMgr
    WSEndpoint --> Handler
    Handler --> Registry

    Registry --> GraphFactory
    GraphFactory --> Reason
    GraphFactory --> Act
    GraphFactory --> Respond

    Act --> Combat
    Act --> Dialogue
    Act --> Trade
    Act --> Environment
    Act --> WorldQuery

    Registry --> WorldState
    WorldState --> NPCDefs
    NPCDefs --> Personalities
    WorldState --> Zones
    WorldState --> PlayerData

    Provider --> OpenAI
    Provider --> Claude
    Reason --> Provider

    style FastAPI fill:#0a1628,stroke:#4488cc,color:#b8d8f8
    style Agents fill:#1a0a28,stroke:#aa66ff,color:#d8b8f8
    style Tools fill:#281a0a,stroke:#cc8833,color:#f8d8b8
    style World fill:#1a2808,stroke:#88aa44,color:#c8e8a8
```

On startup, the `lifespan` handler creates the LLM instance, `WorldState`, and `AgentRegistry`. The registry builds one compiled LangGraph graph per NPC, each with its own tool closures and `MemorySaver` checkpointer for conversation history.

---

## 4. Agent Lifecycle

```mermaid
sequenceDiagram
    participant Player as Player (Browser)
    participant UI as InteractionPanel
    participant WS as WebSocketClient
    participant Server as FastAPI /ws
    participant Handler as WS Handler
    participant Registry as AgentRegistry
    participant Graph as LangGraph Agent
    participant LLM as LLM Provider
    participant Tools as Tool Functions
    participant World as WorldState
    participant Reaction as ReactionSystem

    Player->>UI: Click NPC, type prompt
    UI->>WS: send({type: "interaction", npcId, prompt, playerState})
    WS->>Server: JSON over WebSocket
    Server->>Handler: handle_message(data)
    Handler->>World: get_player(), merge client state
    Handler->>Registry: invoke(npc_id, player_id, prompt, player_state)

    Registry->>World: get_npc_config(), get_context_for_npc()
    Registry->>Registry: populate_world_snapshot()
    Registry->>Graph: ainvoke({messages, npc_personality, player_state, world_context})

    loop Reason-Act Loop
        Graph->>LLM: System prompt + messages + tool schemas
        LLM-->>Graph: AIMessage (with optional tool_calls)

        alt Has tool_calls
            Graph->>Tools: Execute tool functions
            Tools->>Tools: Append to pending_actions[]
            Tools-->>Graph: ToolMessage results
            Note over Graph: Loop back to Reason
        else No tool_calls
            Graph->>Graph: respond node extracts dialogue
        end
    end

    Graph-->>Registry: {response_text, pending_actions}
    Registry->>World: apply_actions(pending_actions)
    Registry-->>Handler: {dialogue, actions, playerStateUpdate, npcStateUpdate}
    Handler-->>Server: Response dict
    Server-->>WS: JSON over WebSocket
    WS-->>UI: hideThinking(), addMessage()
    WS-->>Reaction: handleResponse(response)
    Reaction->>Reaction: Apply state updates, spawn effects
    Reaction->>Player: Floating text, particles, screen flash
```

---

## 5. LangGraph Agent Graph

```mermaid
stateDiagram-v2
    [*] --> reason

    reason --> act: LLM returned tool_calls
    reason --> respond: No tool_calls (pure dialogue)

    act --> reason: Tool results fed back

    respond --> [*]: Extract dialogue,<br/>return pending_actions

    state reason {
        [*] --> BuildSystemPrompt
        BuildSystemPrompt --> InvokeLLM
        InvokeLLM --> ReturnAIMessage
        ReturnAIMessage --> [*]
    }

    state act {
        [*] --> LookupTools
        LookupTools --> ExecuteToolCalls
        ExecuteToolCalls --> HarvestPendingActions
        HarvestPendingActions --> ReturnToolMessages
        ReturnToolMessages --> [*]
    }

    state respond {
        [*] --> ExtractContent
        ExtractContent --> SetResponseText
        SetResponseText --> [*]
    }
```

The conditional edge `_should_act_or_respond` checks whether the last AI message contains `tool_calls`. If so, it routes to `act` which executes the tools and loops back to `reason`. This allows multi-step reasoning (e.g., check player state, then decide to heal). When the LLM produces a plain text response, `respond` extracts the dialogue and the graph terminates.

**Agent State Schema (`NPCAgentState`):**

| Field | Type | Purpose |
|-------|------|---------|
| `messages` | `Annotated[list, add_messages]` | Conversation history (accumulates) |
| `npc_id` | `str` | NPC identifier |
| `npc_name` | `str` | Display name |
| `npc_personality` | `str` | System prompt personality text |
| `player_state` | `dict` | HP, inventory, position |
| `world_context` | `dict` | Zone, weather, nearby entities |
| `pending_actions` | `list[dict]` | Accumulated game actions |
| `response_text` | `str` | Final dialogue output |

---

## 6. Tool System

```mermaid
flowchart TB
    subgraph Factory ["Tool Factory Pattern"]
        GAT["get_all_tools(pending_actions, world_state)"]
        GAT --> CCT["create_combat_tools()"]
        GAT --> CDT["create_dialogue_tools()"]
        GAT --> CTT["create_trade_tools()"]
        GAT --> CET["create_environment_tools()"]
        GAT --> CWT["create_world_query_tools()"]
    end

    subgraph Closures ["Shared Mutable Closures"]
        PA["pending_actions: list<br/>(tools append here)"]
        WSnap["world_state: dict<br/>(tools read/write)"]
    end

    CCT --> PA
    CDT --> PA
    CTT --> PA
    CET --> PA
    CWT --> WSnap

    subgraph ToolList ["All 14 Tools"]
        T1["deal_damage → damage action"]
        T2["defend → emote action"]
        T3["flee → move_npc action"]
        T4["heal_target → heal action"]
        T5["emote → emote action"]
        T6["give_quest → start_quest action"]
        T7["complete_quest → complete_quest + give_item"]
        T8["offer_item → give_item action"]
        T9["take_item → take_item action"]
        T10["change_weather → change_weather action"]
        T11["spawn_effect → spawn_effect action"]
        T12["move_npc → move_npc action"]
        T13["get_nearby_entities → read-only query"]
        T14["check_player_state → read-only query"]
    end

    PA --> Actions["Actions sent to client"]

    subgraph ClientEffects ["Client ReactionSystem"]
        Actions --> DMG["damage → HP change, floating text, screen flash"]
        Actions --> HEAL["heal → HP restore, green text"]
        Actions --> ITEM["give_item → inventory add, golden text"]
        Actions --> EMOTE["emote → NPC animation"]
        Actions --> MOVE["move_npc → lerp NPC position"]
        Actions --> FX["spawn_effect → particle burst"]
        Actions --> WX["change_weather → fog/storm"]
        Actions --> QST["start/complete_quest → banner"]
    end

    style Factory fill:#281a0a,stroke:#cc8833,color:#f8d8b8
    style Closures fill:#1a0a28,stroke:#aa66ff,color:#d8b8f8
    style ClientEffects fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
```

Each tool factory returns `@tool`-decorated functions that close over shared `pending_actions` and `world_state` references. When a tool is invoked by the LLM, it appends an action dict to `pending_actions` and optionally mutates the `world_state` snapshot (e.g., `deal_damage` reduces player HP). The `act` node harvests these after each tool round.

---

## 7. State Management

```mermaid
flowchart TB
    subgraph ServerAuth ["Server (Authoritative)"]
        SWS["WorldState (Singleton)"]
        SPD["PlayerData<br/>hp, max_hp, mana, max_mana,<br/>level, inventory, position"]
        SND["NPCData<br/>npc_id, name, hp,<br/>position, mood, personality"]
        ENV["Environment<br/>weather, time_of_day"]

        SWS --> SPD
        SWS --> SND
        SWS --> ENV
    end

    subgraph ClientMirror ["Client (Mirror)"]
        CPS["PlayerState (Singleton)<br/>hp, maxHp, mana, maxMana,<br/>level, inventory, position"]
        CNS["NPCStateStore<br/>Map&lt;npcId, NPCStateData&gt;"]
        CWS["WorldState<br/>weather, timeOfDay"]
    end

    SWS -->|"agent_response:<br/>playerStateUpdate"| CPS
    SWS -->|"agent_response:<br/>npcStateUpdate"| CNS
    SWS -->|"change_weather action"| CWS

    CPS -->|"interaction msg:<br/>playerState"| SWS

    CPS -->|"onChange callback"| StatusBars["StatusBars UI"]
    CWS -->|"weather setter"| SceneFog["Scene Fog"]

    style ServerAuth fill:#0a1628,stroke:#4488cc,color:#b8d8f8
    style ClientMirror fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
```

The server's `WorldState` is the single source of truth. After every agent invocation, `apply_actions()` mutates server state, then the full `playerStateUpdate` and `npcStateUpdate` are sent to the client. The client's `PlayerState.merge()` and `NPCStateStore.updateState()` apply the patches and trigger UI updates via callbacks.

Player position is client-authoritative (controlled by `PlayerController`) and sent to the server via `player_move` messages.

---

## 8. 3D Scene Hierarchy

```mermaid
graph TB
    Scene["THREE.Scene"]

    Scene --> Skybox["Skybox<br/>(background color/texture)"]
    Scene --> Lighting["Lighting<br/>DirectionalLight + AmbientLight"]
    Scene --> TerrainGroup["Terrain<br/>Procedural heightmap mesh"]
    Scene --> WaterPlane["Water<br/>Animated plane at fixed Y"]
    Scene --> BuildingGroups["Buildings<br/>Multiple building groups"]
    Scene --> VegGroup["Vegetation<br/>Trees, mushrooms,<br/>placed avoiding buildings"]
    Scene --> EffectsGroup["Effects<br/>Wisps, particles, glow"]

    Scene --> PlayerGroup["Player Group<br/>Procedural character model"]
    Scene --> NPC1["NPC: Ignathar<br/>Dragon (wings)"]
    Scene --> NPC2["NPC: Thornby<br/>Merchant (backpack)"]
    Scene --> NPC3["NPC: Elyria<br/>Sage (staff + orb)"]
    Scene --> NPC4["NPC: Captain Aldric<br/>Guard (shield)"]
    Scene --> NPC5["NPC: Sister Mira<br/>Healer (halo)"]

    subgraph NPCMesh ["NPC Mesh Structure (each)"]
        Body["Body (Cylinder)"]
        Head["Head (Sphere)"]
        Shoulders["Shoulders (Spheres)"]
        Belt["Belt (Torus)"]
        Legs["Left/Right Leg (Boxes)"]
        Hat["Hat (Cone)"]
        Accessory["Role Accessory"]
        NameplateSprite["Nameplate (Sprite)"]
    end

    NPC1 --> NPCMesh

    Scene --> DynSprites["Dynamic Sprites<br/>Floating text, particle bursts<br/>(added/removed by ReactionSystem)"]

    subgraph PostProcess ["Post-Processing"]
        Composer["EffectComposer"]
        RenderPass["RenderPass"]
        BloomPass["UnrealBloomPass<br/>strength=0.35, threshold=0.8"]
        Composer --> RenderPass
        Composer --> BloomPass
    end

    style Scene fill:#0a0612,stroke:#6644cc,color:#d8b8f8
    style NPCMesh fill:#281a0a,stroke:#cc8833,color:#f8d8b8
    style PostProcess fill:#1a0a28,stroke:#aa66ff,color:#d8b8f8
```

The renderer uses `ACESFilmicToneMapping` with exposure 1.6, `PCFSoftShadowMap`, and capped pixel ratio at 2x. The Bloom pass runs at half resolution for performance.

---

## 9. Message Protocol

```mermaid
flowchart LR
    subgraph ClientToServer ["Client → Server"]
        INT["interaction<br/>{type, npcId, prompt,<br/>playerState: {position}}"]
        MOV["player_move<br/>{type, position: [x,y,z]}"]
        USE["use_item<br/>{type, playerId, item}"]
        EXP["explore_area<br/>{type, position, npcs[]}"]
        PING["ping<br/>{type: 'ping'}"]
    end

    subgraph ServerToClient ["Server → Client"]
        AGR["agent_response<br/>{type, npcId, dialogue,<br/>actions[], playerStateUpdate,<br/>npcStateUpdate}"]
        UIR["use_item_result<br/>{type, success, message,<br/>actions[], playerStateUpdate}"]
        ERR["error<br/>{type, message}"]
        ACK["ack<br/>{type, status}"]
    end

    INT -->|"Attack detection +<br/>LangGraph agent"| AGR
    MOV -->|"Update position"| ACK
    USE -->|"Validate + apply"| UIR
    EXP -->|"Register dynamic NPCs"| ACK
    PING -.->|"heartbeat 30s"| Server

    style ClientToServer fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
    style ServerToClient fill:#0a1628,stroke:#4488cc,color:#b8d8f8
```

**Security:** Input validation whitelist (only `position` accepted from client). 30s LLM timeout. Rate limiting (max 10 msgs/3s). Tool output clamped (0-100 damage/heal).

**Action kinds** (within `agent_response.actions[]`):

| Kind | Params | Client Effect |
|------|--------|---------------|
| `damage` | `amount`, `target`, `damageType` | HP reduction, red floating text, screen flash |
| `heal` | `amount`, `target` | HP restore, green floating text, green flash |
| `give_item` | `item` | Inventory add, golden floating text |
| `take_item` | `item` | Inventory remove |
| `emote` | `animation` | NPC animation (bow, wave, laugh, etc.) |
| `move_npc` | `position`, `duration` | Smooth lerp of NPC mesh |
| `spawn_effect` | `effectType`, `color`, `count` | Particle burst at position |
| `change_weather` | `weather` | Scene fog adjustment |
| `start_quest` | `questName`, `description` | Quest banner overlay |
| `complete_quest` | `questName`, `reward` | Quest banner overlay |

---

## 10. NPC System

```mermaid
flowchart TB
    subgraph Definitions ["NPC Definitions Layer"]
        Templates["personalities/templates.py<br/>NPC_PERSONALITIES dict"]
        NDefs["npc_definitions.py<br/>NPC_DEFINITIONS dict"]
        NDefs -->|"personality_key"| Templates
    end

    subgraph ServerInit ["Server Initialization"]
        WS["WorldState._load_default_npcs()"]
        WS -->|"reads"| NDefs
        WS -->|"reads system_prompt"| Templates
        WS --> NPCData1["NPCData(dragon_01)<br/>hp=500, Ember Peaks"]
        WS --> NPCData2["NPCData(merchant_01)<br/>hp=80, Village"]
        WS --> NPCData3["NPCData(sage_01)<br/>hp=120, Crystal Lake"]
        WS --> NPCData4["NPCData(guard_01)<br/>hp=200, Village"]
        WS --> NPCData5["NPCData(healer_01)<br/>hp=100, Village"]
    end

    subgraph AgentBuild ["Agent Registry Build"]
        AR["AgentRegistry._build_agents()"]
        AR -->|"per NPC"| Tools["get_all_tools()<br/>14 tools with closures"]
        AR -->|"per NPC"| Graph["create_npc_agent()<br/>Compiled LangGraph"]
        Graph --> Check["MemorySaver Checkpointer<br/>(per-NPC conversation memory)"]
    end

    subgraph Archetypes ["NPC Archetypes"]
        A1["hostile_boss<br/>Ignathar — attacks with fire,<br/>guards Ember Crown"]
        A2["friendly_merchant<br/>Thornby — sells items,<br/>haggles, flees from combat"]
        A3["quest_giver<br/>Elyria — offers 3 quests,<br/>speaks in riddles"]
        A4["neutral_guard<br/>Aldric — enforces law,<br/>can be bribed"]
        A5["friendly_healer<br/>Mira — heals freely,<br/>never fights"]
    end

    Templates --> A1
    Templates --> A2
    Templates --> A3
    Templates --> A4
    Templates --> A5

    subgraph ClientNPCs ["Client NPC Rendering"]
        CNPC["NPC class<br/>Procedural mesh + animator"]
        EM["EntityManager<br/>Map&lt;id, NPC&gt;"]
        CNPC -->|"color-based"| Wings["Red → Wings (dragon)"]
        CNPC -->|"color-based"| Pack["Green → Backpack (merchant)"]
        CNPC -->|"color-based"| Staff["Purple → Staff (sage)"]
        CNPC -->|"color-based"| Shield["Gray → Shield (guard)"]
        CNPC -->|"color-based"| Halo["Yellow → Halo (healer)"]
    end

    style Definitions fill:#1a2808,stroke:#88aa44,color:#c8e8a8
    style Archetypes fill:#281a0a,stroke:#cc8833,color:#f8d8b8
    style ClientNPCs fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
```

**Static NPCs** are defined in `NPC_PERSONALITIES` → `NPC_DEFINITIONS` → `NPC_CONFIGS`. **Dynamic NPCs** are generated by `WorldGenerator` when new terrain chunks load (20% chance per chunk, >100 units from origin) and registered server-side via `registry.register_dynamic_npc()`.

### RAG Lore System

```mermaid
flowchart LR
    PP["Player Prompt"] --> RT["LoreRetriever<br/>keyword matching"]
    RT --> KB["knowledge_base.py<br/>47 WoW lore entries"]
    RT -->|"top 3 matches"| SP["System Prompt<br/>WORLD LORE section"]
    SP --> LLM["LLM Call"]
```

When a player mentions lore topics (Elune, Teldrassil, Night Elves, etc.), the RAG retriever injects relevant WoW lore into the NPC's system prompt so responses reference actual game lore.

---

## 11. CI/CD & Quality Pipeline

```mermaid
flowchart TB
    subgraph Trigger ["Trigger"]
        Push["Push to main"]
        PR["Pull Request"]
    end

    Push --> GHA
    PR --> GHA

    subgraph GHA ["GitHub Actions CI (.github/workflows/ci.yml)"]
        direction TB

        subgraph ClientJobs ["Client Jobs (parallel)"]
            CL["Lint<br/>ESLint + typescript-eslint"]
            CT["Typecheck<br/>tsc --noEmit"]
            CV["Tests<br/>Vitest (18 tests)"]
        end

        subgraph ServerJobs ["Server Jobs (parallel)"]
            SL["Lint<br/>Ruff check + format"]
            SM["Typecheck<br/>mypy --strict"]
            SP["Tests<br/>pytest (42 tests)"]
        end
    end

    subgraph Local ["Local Development"]
        Make["make check<br/>(lint + typecheck + tests)"]
        Hook["Stop Hook<br/>Auto-runs on Claude task end"]
        PreCommit[".pre-commit-config.yaml<br/>Ruff + ESLint + tsc"]
    end

    style GHA fill:#0a1628,stroke:#4488cc,color:#b8d8f8
    style ClientJobs fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
    style ServerJobs fill:#1a0a28,stroke:#aa66ff,color:#d8b8f8
    style Local fill:#1a2808,stroke:#88aa44,color:#c8e8a8
```

### CI Pipeline (GitHub Actions)

All 6 jobs run **in parallel** with dependency caching:

| Job | Tool | What it checks |
|-----|------|----------------|
| **Client Lint** | ESLint 9 + `typescript-eslint` | No `any`, unused vars, no bare `console.log` |
| **Client Typecheck** | `tsc --noEmit` (strict mode) | Full TypeScript type safety |
| **Client Tests** | Vitest | `MathHelpers`, `PlayerState`, `MessageProtocol` |
| **Server Lint** | Ruff (check + format) | PEP8, isort, bugbear, simplify, pyupgrade |
| **Server Typecheck** | mypy | Strict type annotations |
| **Server Tests** | pytest + pytest-asyncio | WorldState, Combat, Zones, Protocol, RAG, Personalities |

### Local Quality Tools

| Command | Scope | Purpose |
|---------|-------|---------|
| `make check` | All | Lint + typecheck + tests (both sides) |
| `make lint` | All | Lint only |
| `make test` | All | Tests only |
| `make format` | All | Auto-fix formatting |
| `npm run check` | Client | Client lint + typecheck + tests |

### Test Coverage Map

```mermaid
flowchart LR
    subgraph ClientTests ["Client Tests (Vitest)"]
        T1["MathHelpers.test.ts<br/>lerp, clamp, lerpAngle,<br/>smoothDamp"]
        T2["PlayerState.test.ts<br/>singleton, damage,<br/>death, merge, respawn"]
        T3["MessageProtocol.test.ts<br/>interaction shape,<br/>response actions"]
    end

    subgraph ServerTests ["Server Tests (pytest)"]
        T4["test_world_state.py<br/>singleton, NPCs, damage,<br/>heal, items, weather"]
        T5["test_combat_tools.py<br/>deal_damage, heal_target,<br/>defend, flee"]
        T6["test_protocol.py<br/>Pydantic aliases,<br/>serialization"]
        T7["test_zones.py<br/>zone lookup,<br/>descriptions"]
        T8["test_retriever.py<br/>keyword matching,<br/>top_k, topic boost"]
        T9["test_personalities.py<br/>required fields,<br/>tool rules"]
        T10["test_player_state.py<br/>defaults, to_dict,<br/>inventory isolation"]
    end

    style ClientTests fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
    style ServerTests fill:#0a1628,stroke:#4488cc,color:#b8d8f8
```

### Linting Configuration

```mermaid
flowchart LR
    subgraph ClientLint ["Client: eslint.config.js"]
        E1["typescript-eslint/recommended"]
        E2["no-explicit-any: warn"]
        E3["no-unused-vars: warn<br/>(ignore _prefixed)"]
        E4["no-console: warn<br/>(allow warn, error)"]
    end

    subgraph ServerLint ["Server: ruff.toml"]
        R1["E/W: pycodestyle"]
        R2["F: pyflakes"]
        R3["I: isort"]
        R4["N: pep8-naming"]
        R5["UP: pyupgrade"]
        R6["B: flake8-bugbear"]
        R7["SIM: flake8-simplify"]
        R8["RUF: ruff-specific"]
    end

    subgraph TypeCheck ["Type Checking"]
        TC1["Client: tsconfig.json<br/>strict: true"]
        TC2["Server: mypy.ini<br/>disallow_untyped_defs"]
    end

    style ClientLint fill:#1a1108,stroke:#c5a55a,color:#e8dcc8
    style ServerLint fill:#1a0a28,stroke:#aa66ff,color:#d8b8f8
    style TypeCheck fill:#1a2808,stroke:#88aa44,color:#c8e8a8
```

---

## 12. File Structure

```
world-of-prompcraft/
├── CLAUDE.md                        # Project conventions for Claude Code
├── Makefile                         # make check / lint / test / format
├── docker-compose.yml
├── .gitignore
├── .pre-commit-config.yaml          # Pre-commit hooks (ruff, eslint, tsc)
│
├── .github/
│   └── workflows/
│       └── ci.yml                   # GitHub Actions: lint + typecheck + tests
│
├── client/                          # Vite + TypeScript + Three.js
│   ├── index.html                   # Entry HTML
│   ├── package.json                 # Dependencies + lint/test/check scripts
│   ├── tsconfig.json                # TypeScript config (strict mode)
│   ├── vite.config.ts               # Vite build config
│   ├── vitest.config.ts             # Vitest test runner config
│   ├── eslint.config.js             # ESLint + typescript-eslint (flat config)
│   └── src/
│       ├── main.ts                  # Game init, main loop, wiring
│       │
│       ├── __tests__/               # Client unit tests (Vitest)
│       │   ├── MathHelpers.test.ts  # lerp, clamp, lerpAngle, smoothDamp
│       │   ├── PlayerState.test.ts  # Singleton, damage, death, merge
│       │   └── MessageProtocol.test.ts # Message shape validation
│       │
│       ├── scene/                   # 3D world rendering
│       │   ├── SceneManager.ts      # Renderer, camera, post-processing
│       │   ├── Terrain.ts           # Procedural heightmap (infinite chunks)
│       │   ├── Water.ts             # Animated reflective water plane
│       │   ├── Skybox.ts            # CubeTexture: stars, moons, nebula
│       │   ├── Lighting.ts          # Moonlight + 3 moonbeam spots
│       │   ├── Buildings.ts         # Elven village structures
│       │   ├── Vegetation.ts        # Trees, mushrooms, ferns, vines
│       │   ├── Biomes.ts            # Biome generation per chunk
│       │   └── Effects.ts           # Wisps, ambient particles, glow
│       │
│       ├── entities/                # Game entities
│       │   ├── Player.ts            # Night Elf model + cape
│       │   ├── PlayerController.ts  # WASD + mouse, pointer lock, collision
│       │   ├── NPC.ts               # NPC model + role accessories + wander AI
│       │   ├── NPCAnimator.ts       # Procedural NPC animations
│       │   └── EntityManager.ts     # NPC registry + lifecycle
│       │
│       ├── systems/                 # Game systems
│       │   ├── InteractionSystem.ts # Raycaster NPC click/hover
│       │   ├── ReactionSystem.ts    # Agent response → 3D effects + NPC death
│       │   ├── CollisionSystem.ts   # Raycaster-based, 3-height collision
│       │   ├── WorldGenerator.ts    # Chunk-based tree/NPC spawning
│       │   └── AnimationSystem.ts   # Generic tick system
│       │
│       ├── ui/                      # HTML/CSS overlays (all DOM, no framework)
│       │   ├── UIManager.ts         # Root container + all panels
│       │   ├── InteractionPanel.ts  # Chat + per-NPC action buttons
│       │   ├── StatusBars.ts        # HP/Mana with gold frames
│       │   ├── LoginScreen.ts       # Dark Portal + Enter World
│       │   ├── InventoryPanel.ts    # WoW-style 4x5 grid (I key)
│       │   ├── CombatLog.ts         # Timestamped combat entries
│       │   ├── CombatHUD.ts         # Unit frames + combat log
│       │   ├── DamagePopup.ts       # Screen-space floating numbers
│       │   ├── ItemUseEffect.ts     # Potion/buff visual effects
│       │   ├── DeathScreen.ts       # Game Over + Respawn
│       │   ├── Nameplate.ts         # Billboard sprite (name + HP)
│       │   └── ActionIcon.ts        # Floating emoji action status
│       │
│       ├── network/                 # Server communication
│       │   ├── WebSocketClient.ts   # WS with auto-reconnect + heartbeat
│       │   └── MessageProtocol.ts   # TypeScript message type definitions
│       │
│       ├── state/                   # Client state mirrors
│       │   ├── PlayerState.ts       # Singleton player state
│       │   ├── NPCState.ts          # NPC state store (Map)
│       │   └── WorldState.ts        # Weather, time aggregator
│       │
│       └── utils/                   # Helpers
│           ├── MathHelpers.ts       # clamp, lerp, lerpAngle, smoothDamp
│           └── AssetLoader.ts       # Asset loading helpers
│
└── server/                          # FastAPI + LangGraph (Python)
    ├── pyproject.toml               # Dependencies + pytest config
    ├── ruff.toml                    # Ruff linter + formatter config
    ├── mypy.ini                     # mypy strict type checking config
    │
    ├── tests/                       # Server unit tests (pytest)
    │   ├── conftest.py              # Shared fixtures
    │   ├── test_player_state.py     # PlayerData defaults, to_dict
    │   ├── test_world_state.py      # Singleton, NPCs, damage, heal, items
    │   ├── test_zones.py            # Zone lookup, descriptions
    │   ├── test_combat_tools.py     # deal_damage, heal, defend, flee
    │   ├── test_protocol.py         # Pydantic aliases, serialization
    │   ├── test_retriever.py        # Keyword matching, top_k, boost
    │   └── test_personalities.py    # Required fields, tool rules
    │
    └── src/
        ├── main.py                  # FastAPI app, lifespan, /ws endpoint
        ├── config.py                # Pydantic settings (LLM provider, keys)
        │
        ├── ws/                      # WebSocket layer
        │   ├── handler.py           # Message routing + response building
        │   ├── protocol.py          # Pydantic models for messages
        │   └── connection_manager.py # Active connection tracking
        │
        ├── agents/                  # AI agent system
        │   ├── registry.py          # AgentRegistry — 1 graph per NPC
        │   ├── npc_agent.py         # LangGraph graph factory
        │   ├── agent_state.py       # NPCAgentState TypedDict
        │   │
        │   ├── nodes/               # Graph nodes
        │   │   ├── reason.py        # LLM reasoning (system prompt builder)
        │   │   ├── act.py           # Tool execution + action harvesting
        │   │   └── respond.py       # Final dialogue extraction
        │   │
        │   ├── tools/               # NPC tool categories (14 tools)
        │   │   ├── __init__.py      # Tool registry + get_all_tools()
        │   │   ├── combat.py        # deal_damage, defend, flee, heal_target
        │   │   ├── dialogue.py      # emote, give_quest, complete_quest
        │   │   ├── trade.py         # offer_item, take_item
        │   │   ├── environment.py   # change_weather, spawn_effect, move_npc
        │   │   └── world_query.py   # get_nearby_entities, check_player_state
        │   │
        │   └── personalities/       # NPC personality configs
        │       └── templates.py     # System prompts + _TOOL_RULES_PREAMBLE
        │
        ├── world/                   # Game world state
        │   ├── world_state.py       # Authoritative WorldState singleton
        │   ├── player_state.py      # PlayerData dataclass
        │   ├── npc_definitions.py   # Static NPC metadata (6 NPCs)
        │   └── zones.py             # Zone boundaries + descriptions
        │
        ├── rag/                     # RAG lore system
        │   ├── knowledge_base.py    # 47 WoW lore entries
        │   └── retriever.py         # Keyword-based lore retriever
        │
        └── llm/                     # LLM abstraction
            └── provider.py          # Factory: OpenAI or Anthropic
```

---

## 13. Zone Map

```mermaid
graph TB
    subgraph Map ["World Zones (X/Z coordinates)"]
        DF["Dark Forest<br/>x: -100..100, z: 50..200<br/><i>Shadows and whispers</i>"]
        EV["Elders' Village<br/>x: -50..50, z: -50..50<br/><i>Merchant, Guard, Healer</i>"]
        EP["Ember Peaks<br/>x: 50..200, z: -100..100<br/><i>Ignathar the Dragon</i>"]
        CL["Crystal Lake<br/>x: -200..-50, z: -100..100<br/><i>Elyria the Sage</i>"]
        W["Wilderness<br/><i>Everything else</i>"]
    end

    DF --- EV
    EV --- EP
    EV --- CL
    EV --- W

    style EV fill:#1a2808,stroke:#88aa44,color:#c8e8a8
    style EP fill:#281008,stroke:#cc3300,color:#f8c8a8
    style CL fill:#0a1628,stroke:#4488cc,color:#b8d8f8
    style DF fill:#0a0a0a,stroke:#444444,color:#aaaaaa
```
