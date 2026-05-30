# Server Architecture — World of Promptcraft

FastAPI + LangGraph + Python 3.11+ backend. **Server-authoritative**: `WorldState` is the single source of truth; every HP change, weather event, and inventory mutation happens here before being reflected to clients. Runtime game state is durably persisted in SQLite (`server/data/game_state.db`) for NPC personalities, NPC state, world snapshot, and per-player progress. The world itself uses a **Version 2.1.0 Zonal Hybrid Manifest system** sourced from `shared/data/world_manifest.json`.

---

## Layer Overview

```mermaid
flowchart TD
    subgraph Transport["🌐 Transport Layer"]
        WS["FastAPI /ws\nWebSocket endpoint"]
        CM["ConnectionManager\ndict[playerId, WebSocket]\nbroadcast_nearby by XZ distance"]
        H["handler.py\nmessage routing + attack scoring"]
    end

    subgraph AgentSystem["🤖 Agent System"]
        AR["AgentRegistry\nnpcId → CompiledGraph\n(one per NPC)"]
        AG["NPCAgent (LangGraph)\nStateGraph: reason→act→respond\n→reflect→[summarize]"]
        MS["MemorySaver\nthread_id = npcId_playerId\npersistent mood/relationship/summary"]
    end

    subgraph Tools["🔧 Tool System"]
        TC["closure: get_all_tools(\n  pending_actions, world_state\n)"]
        TK["17 @tool functions:\ncombat · dialogue · trade\nenvironment · world_query · quest"]
    end

    subgraph World["🌍 World Layer"]
        WS2["WorldState (singleton)\nasyncio.Lock\nNPCData · PlayerData\nweather · time_of_day · zones"]
        PD["PlayerData (dataclass)\nhp · mana · level · inventory\nposition · race/faction/skin\nquests · yaw"]
        ND["NPCData (dataclass)\nhp · position · personality\nmood"]
        WM["Manifest Integration\nshared/data/world_manifest.json\nLoads NPC Definitions"]
    end

    subgraph Persistence["💾 Persistence Layer"]
        SQL["SQLiteGameStateStore\nserver/data/game_state.db"]
    end

    subgraph Knowledge["📚 Knowledge Layer"]
        RAG["LoreRetriever\nkeyword scoring over 47 entries\ntop-3 inject into system prompt"]
        KB["knowledge_base.py\n47 WoW lore entries\n(races, locations, characters)"]
    end

    subgraph LLM["🤖 LLM Provider"]
        LP["llm/provider.py\nPydantic Settings\nOpenAI GPT-4o or Anthropic Claude"]
    end

    WS --> CM --> H
    H --> AR
    AR --> AG
    AG --> TC --> TK
    AG --> RAG --> KB
    AG --> LLM --> LP
    TK --> World
    H --> World
    AG --> World
    WM --> World
    World --> SQL
```

---

## Startup & Lifespan

```mermaid
sequenceDiagram
    participant UV as uvicorn
    participant MA as main.py lifespan
    participant WS as WorldState
    participant AR as AgentRegistry
    participant CM as ConnectionManager

    UV->>MA: startup
    MA->>WS: WorldState() — load NPC definitions (from world_manifest.json)
    MA->>AR: AgentRegistry(world_state) — compile one StateGraph per NPC
    Note over AR: For each NPC:<br/>1. pending_actions = []<br/>2. world_snapshot = {}<br/>3. build 17 tools (closed over above)<br/>4. compile LangGraph with MemorySaver
    MA->>CM: ConnectionManager()
    MA-->>UV: app ready — /health + /ws active

    UV->>MA: shutdown
    MA-->>UV: cleanup
```

---

## WebSocket Layer

```mermaid
flowchart TD
    subgraph ConnectionManager["ConnectionManager"]
        AC["active_connections: dict[str, WebSocket]\nkey = player_id"]
        WP["_ws_to_player: dict[int, str]\nkey = id(websocket) — reverse lookup for disconnect"]
        BN["broadcast_nearby(msg, pos, radius)\nfilter by XZ distance ≤ radius\nsend to all players in range"]
    end

    subgraph Handler["handler.py — message routing"]
        JOIN["join\n→ assign player_id\n→ load persisted PlayerData if present\n→ register/update in WorldState\n→ send join_ok with nearby NPC data"]
        INTER["player_interaction\n→ _score_attack_quality(prompt)\n→ apply pre-emptive damage to NPC\n→ registry.invoke() → AgentResponse\n→ apply_actions(pending_actions)\n→ broadcast dialogue (r=100)\n→ broadcast actions (r=200)"]
        MOV["player_movement\n→ update WorldState player position\n→ broadcast player_moved to nearby"]
        CHAT["chat_message\n→ broadcast chat_broadcast to nearby"]
        ATK["player_attack\n→ deal direct damage to NPC\n→ broadcast npc_actions"]
        DISC["disconnect\n→ persist player state to SQLite\n→ remove from ConnectionManager\n→ broadcast player_left\n→ cleanup_player_equipment()"]
    end

    ConnectionManager --> Handler
```

---

## Agent System — LangGraph StateGraph

Each NPC runs an independent compiled `StateGraph`. The graph is invoked once per player interaction.

```mermaid
flowchart TD
    START([START]) --> pre_check

    pre_check["🛡️ pre_check\n────────────\nFast LLM call (Structured Output)\nAnalyzes user prompt to determine:\n• is_ooc (breaks roleplay)\n• fast_intent (attack/trade)"]

    reason["🧠 reason\n────────────\nLLM call\nBuild system prompt:\n• NPC personality\n• world context + player state\n• conversation summary + mood\n• top-3 RAG lore entries\nToken Optimization: Only pass the most recent 6 messages\nInvoke llm_with_tools"]

    act["⚙️ act\n────────────\nNo LLM\nExecute each tool_call\nAppend to pending_actions\nReturn ToolMessages"]

    respond["💬 respond\n────────────\nNo LLM\nExtract AIMessage.content\n→ response_text"]

    reflect["🪞 reflect\n────────────\nLLM call — Structured Output\nAnalyzes recent transcript to output:\n• mood update\n• relationship delta [-20,+20]\n• personality_notes (≤300 chars)"]

    summarize["📝 summarize\n────────────\nLLM call — conditional\n2–3 sentence rolling summary\nof last 12 messages\n≤ 500 chars output"]

    END([END])

    pre_check -->|"is_ooc"| respond
    pre_check -->|"fast_intent = attack/trade\nInject tool call"| act
    pre_check -->|"normal chat"| reason

    reason -->|"tool_calls present"| act
    act -->|"ToolMessages → loop back"| reason
    reason -->|"no tool_calls"| respond
    respond --> reflect
    reflect -->|"human_count < 10\nor count % 3 ≠ 0"| END
    reflect -->|"human_count ≥ 10\nAND count % 3 = 0"| summarize
    summarize --> END
```

---

## Agent State Schema

All data flowing through the graph lives in a single `TypedDict` (`NPCAgentState`):

| Field | Type | Scope | Description |
|-------|------|-------|-------------|
| `messages` | `list` (accumulated) | Conversation | Full history — HumanMessage, AIMessage, ToolMessage |
| `npc_id` | `str` | Static | NPC identifier |
| `npc_name` | `str` | Static | Display name |
| `npc_personality` | `str` | Static | Full personality system prompt |
| `player_state` | `dict[str, Any]` | Per-call | HP, mana, inventory, level |
| `world_context` | `dict[str, Any]` | Per-call | Zone, weather, nearby entities |
| `pending_actions` | `list[dict[str, Any]]` | Accumulated | Tool-queued game actions |
| `response_text` | `str` | Output | Final dialogue string |
| `conversation_summary` | `str` | **Persistent** | Rolling LLM-generated memory |
| `mood` | `str` | **Persistent** | neutral / happy / angry / sad / fearful |
| `relationship_score` | `int` | **Persistent** | -100 (enemy) to +100 (trusted ally) |
| `personality_notes` | `str` | **Persistent** | NPC observations about this player |

---

## Tool System

Tools use a **closure pattern** — `get_all_tools(pending_actions, world_state)` returns `@tool`-decorated functions that share a mutable `pending_actions` list.

```mermaid
flowchart LR
    LLM["🤖 LLM"]

    subgraph closure["Tool Closure — per NPC at startup"]
        direction TB
        combat["combat\ndeal_damage · heal_target\ndefend · flee"]
        dialogue["dialogue\nemote · give_quest\ncomplete_quest"]
        trade["trade\noffer_item · take_item"]
        env["environment\nchange_weather · spawn_effect\nmove_npc"]
        query["world_query\nget_nearby_entities\ncheck_player_state"]
        quest["quest\nstart_quest · advance_objective\ncheck_player_quests"]
    end

    pending["pending_actions[ ]"]
    worldstate["WorldState"]
    client["🎮 Client\nReactionSystem → 3D effects"]

    LLM -->|"tool_calls"| closure
    closure -->|"append action dict"| pending
    closure -->|"read / write snapshot"| worldstate
    pending -->|"apply_actions after graph"| worldstate
    pending -->|"actions in AgentResponse"| client
```

---

## RAG Lore System

```mermaid
flowchart LR
    prompt["Player prompt"]
    tokenize["Keyword tokenization\nlowercase alphanum tokens"]
    score["Score all 47 lore entries\noverlap + 3× topic boost\n+ 1 category bonus"]
    top3["Top-3 entries"]
    inject["Inject as\n'## World Lore'\ninto system prompt"]

    prompt --> tokenize --> score --> top3 --> inject
```

---

## World State & Manifest Integration

The server's WorldState operates on a single truth, heavily influenced by the `shared/data/world_manifest.json`.

```mermaid
flowchart TD
    subgraph WorldState["WorldState (asyncio.Lock protected)"]
        PD["players: dict[str, PlayerData]\nhp · mana · level · position\ninventory · active_quests"]
        ND["npcs: dict[str, NPCData]\nhp · position · personality\nmood"]
        WE["weather: str\nclear, rain, storm, fog, snow"]
    end

    subgraph ManifestSource["world_manifest.json (Version 2.1.0)"]
        ZN["Zones\nbounds · npcs"]
    end

    subgraph Ops["Key Operations"]
        GA["apply_actions(actions)\nsequential — one action at a time\nunder asyncio.Lock"]
        GC["get_context_for_npc(npc_id, player_id)\nbuilds world_context dict\nfor agent system prompt"]
        UP["update_player(player_id, updates)\npartial field update"]
    end

    subgraph Definitions["Data Bridges"]
        NDF["npc_definitions.py\nParses JSON → dict[str, Any]"]
        ZDF["zones.py\nRuntime boundary resolution"]
    end

    WorldState --> Ops
    ManifestSource --> NDF
    NDF -->|"loaded at startup"| WorldState
    ZDF --> GC
```

---

## Cost & Latency Strategy

| Decision | Rationale |
|----------|-----------|
| `reason` token optimization | Prunes the context window to the most recent 6 messages; older context is summarized. Reduces token consumption significantly during long conversations. |
| `reflect` uses Structured Output | Provides high emotional intelligence (accurate mood, relationship tracking, notes) while keeping the output deterministic and tiny. |
| `summarize` conditional (≥10 turns, every 3rd) | Minimises LLM calls while keeping memory bounded |
| RAG is keyword-based (no embeddings) | Sub-millisecond — no vector DB dependency |
| Tools synchronous within one turn | Predictable cost; no parallel LLM calls |
| 30s LLM timeout | Prevents runaway agent calls blocking WebSocket connections |

---

## LLM Provider

```mermaid
flowchart LR
    CFG["config.py\nPydantic Settings\nfrom env/.env"]

    subgraph Providers["Configured Provider"]
        OA["OpenAI\ngpt-4o · gpt-4o-mini"]
        AN["Anthropic\nclaude-sonnet-4-6\nclaude-haiku-4-5"]
    end

    subgraph Binding["llm_with_tools"]
        BT["llm.bind_tools(tools)\nall 17 tools attached"]
    end

    CFG -->|"LLM_PROVIDER env var"| Providers
    Providers --> Binding
    Binding -->|"used in reason node"| RN["reason.py"]
```
