# Server Architecture — World of Promptcraft

FastAPI + LangGraph + Python 3.11+ backend. **Server-authoritative**: `WorldState` is the single source of truth; every HP change, weather event, and inventory mutation happens here before being reflected to clients.

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
    MA->>WS: WorldState() — load NPC definitions + zone boundaries
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
        JOIN["join\n→ assign player_id\n→ register in WorldState\n→ send join_ok with all NPC data"]
        INTER["player_interaction\n→ _score_attack_quality(prompt)\n→ apply pre-emptive damage to NPC\n→ registry.invoke() → AgentResponse\n→ apply_actions(pending_actions)\n→ broadcast dialogue (r=100)\n→ broadcast actions (r=200)"]
        MOV["player_movement\n→ update WorldState player position\n→ broadcast player_moved to nearby"]
        CHAT["chat_message\n→ broadcast chat_broadcast to nearby"]
        ATK["player_attack\n→ deal direct damage to NPC\n→ broadcast npc_actions"]
        DISC["disconnect\n→ remove from ConnectionManager\n→ broadcast player_left"]
    end

    ConnectionManager --> Handler
```

---

## Agent System — LangGraph StateGraph

Each NPC runs an independent compiled `StateGraph`. The graph is invoked once per player interaction.

```mermaid
flowchart TD
    START([START]) --> reason

    reason["🧠 reason\n────────────\nLLM call\nBuild system prompt:\n• NPC personality\n• world context + player state\n• conversation summary + mood\n• top-3 RAG lore entries\nInvoke llm_with_tools"]

    act["⚙️ act\n────────────\nNo LLM\nExecute each tool_call\nAppend to pending_actions\nReturn ToolMessages"]

    respond["💬 respond\n────────────\nNo LLM\nExtract AIMessage.content\n→ response_text"]

    reflect["🪞 reflect\n────────────\nNo LLM — heuristic\nKeyword token sets:\n• mood update\n• relationship delta [-20,+15]\n• personality_notes (≤300 chars)"]

    summarize["📝 summarize\n────────────\nLLM call — conditional\n2–3 sentence rolling summary\nof last 12 messages\n≤ 500 chars output"]

    END([END])

    reason -->|"tool_calls present"| act
    act -->|"ToolMessages → loop back"| reason
    reason -->|"no tool_calls"| respond
    respond --> reflect
    reflect -->|"human_count < 10\nor count % 3 ≠ 0"| END
    reflect -->|"human_count ≥ 10\nAND count % 3 = 0"| summarize
    summarize --> END

    style reason fill:#4a90d9,color:#fff,stroke:#2c6fad
    style act fill:#e67e22,color:#fff,stroke:#b55c0e
    style respond fill:#27ae60,color:#fff,stroke:#1a7a42
    style reflect fill:#8e44ad,color:#fff,stroke:#6a2f82
    style summarize fill:#c0392b,color:#fff,stroke:#922b21
    style START fill:#2c3e50,color:#fff,stroke:#1a252f
    style END fill:#2c3e50,color:#fff,stroke:#1a252f
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

`MemorySaver` checkpoints per `thread_id = "{npc_id}_{player_id}"`. Persistent fields survive across calls.

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

    style LLM fill:#4a90d9,color:#fff,stroke:#2c6fad
    style pending fill:#e67e22,color:#fff,stroke:#b55c0e
    style worldstate fill:#27ae60,color:#fff,stroke:#1a7a42
    style client fill:#8e44ad,color:#fff,stroke:#6a2f82
```

**Action kinds and effects:**

| Kind | Server Effect | Client Effect |
|------|---------------|---------------|
| `damage` | Reduce player HP in WorldState | Red floating text, screen flash |
| `heal` | Restore player HP | Green floating text, green flash |
| `give_item` | Add to player inventory | Gold floating text, inventory open |
| `take_item` | Remove from inventory | Inventory update |
| `emote` | (none) | NPC animation |
| `move_npc` | (none — client-side) | NPC lerps to position |
| `spawn_effect` | (none) | Particle burst |
| `change_weather` | Update world weather | Scene fog adjust |
| `start_quest` | (client tracks) | Quest banner overlay |
| `complete_quest` | (client tracks) | Quest banner + reward |
| `advance_objective` | (client tracks) | Quest tracker update |

---

## Per-NPC Isolation

Every NPC has fully isolated state. Two players can talk to the same NPC simultaneously with independent memory:

```mermaid
flowchart TD
    registry["AgentRegistry\n(server startup)"]

    subgraph dragon["NPC: dragon_01 — Ignathar the Ancient"]
        direction LR
        g1["StateGraph\nCompiled + MemorySaver"]
        pa1["pending_actions[ ]"]
        ws1["world_snapshot{ }"]
        g1 --- pa1
        g1 --- ws1
    end

    subgraph merchant["NPC: merchant_01 — Thornby the Merchant"]
        direction LR
        g2["StateGraph\nCompiled + MemorySaver"]
        pa2["pending_actions[ ]"]
        ws2["world_snapshot{ }"]
        g2 --- pa2
        g2 --- ws2
    end

    subgraph threads["MemorySaver threads (per player)"]
        t1["dragon_01_alice"]
        t2["dragon_01_bob"]
        t3["merchant_01_alice"]
    end

    registry --> dragon
    registry --> merchant
    dragon --> t1
    dragon --> t2
    merchant --> t3

    style registry fill:#2c3e50,color:#fff,stroke:#1a252f
    style dragon fill:#c0392b22,stroke:#c0392b
    style merchant fill:#27ae6022,stroke:#27ae60
    style threads fill:#4a90d922,stroke:#4a90d9
```

---

## NPC Relationship Model

The `reflect` node updates relationship state with zero LLM cost using keyword token sets:

```mermaid
flowchart TD
    HM["Human messages\n(recent window)"]
    TK["Token set\nlowercase alphanum"]

    subgraph Mood["Mood Update"]
        H["hostile/insult → angry"]
        F["fear words → fearful"]
        S["sad words → sad"]
        FR["friendly words → happy"]
        D["otherwise → decay toward neutral"]
    end

    subgraph Rel["Relationship Score update"]
        D2["delta = f(combat, gifts, quests,\nhostile/friendly word freq)\nclamped [-20, +15] per exchange\naccumulated in [-100, +100]"]
    end

    subgraph Tiers["Relationship Tiers"]
        T1["≤ -50 → ENEMY: hostile, guarded"]
        T2["-50 to -10 → DISTRUSTFUL: wary, curt"]
        T3["-10 to +10 → STRANGER: polite, reserved"]
        T4["+10 to +50 → FRIEND: warm, helpful"]
        T5["> +50 → TRUSTED ALLY: shares secrets, rare quests"]
    end

    subgraph Notes["Personality Notes"]
        N["Accumulate NPC observations\ncapped at 300 chars\ne.g. 'has been aggressive', 'is a quester'"]
    end

    HM --> TK --> Mood
    TK --> Rel --> Tiers
    TK --> Notes
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

    style prompt fill:#4a90d9,color:#fff,stroke:#2c6fad
    style inject fill:#27ae60,color:#fff,stroke:#1a7a42
```

Sub-millisecond keyword retrieval — no vector DB, no embeddings. Covers 47 WoW lore entries spanning races, locations, and characters.

---

## World State

```mermaid
flowchart TD
    subgraph WorldState["WorldState (asyncio.Lock protected)"]
        PD["players: dict[str, PlayerData]\nhp · mana · level · position\ninventory · active_quests"]
        ND["npcs: dict[str, NPCData]\nhp · position · personality\nmood"]
        WE["weather: str\nclear, rain, storm, fog, snow"]
        ZN["zones: list[ZoneBoundary]\nname · min/max XZ coords"]
    end

    subgraph Ops["Key Operations"]
        GA["apply_actions(actions)\nsequential — one action at a time\nunder asyncio.Lock"]
        GC["get_context_for_npc(npc_id, player_id)\nbuilds world_context dict\nfor agent system prompt"]
        UP["update_player(player_id, updates)\npartial field update"]
    end

    subgraph Definitions["Static Definitions"]
        NDF["npc_definitions.py\nNPC_DEFINITIONS: dict[str, dict[str, Any]]\nspawn position, personality archetype, hp"]
        ZDF["zones.py\nZONE_BOUNDARIES: list[ZoneBoundary]"]
    end

    WorldState --> Ops
    Definitions -->|"loaded at startup"| WorldState
```

---

## Full Request Flow

End-to-end: player text input → 3D effect.

```mermaid
sequenceDiagram
    actor Player
    participant C as 🎮 Client
    participant H as handler.py
    participant R as AgentRegistry
    participant G as StateGraph
    participant LLM as 🤖 LLM
    participant WS as WorldState

    Player->>C: types prompt
    C->>H: WebSocket {type:"player_interaction", npcId, prompt, playerState}

    H->>H: _score_attack_quality(prompt) → multiplier, dmg_type
    H->>WS: apply_actions([damage]) — NPC HP reduced under lock

    H->>R: registry.invoke(npc_id, player_id, prompt, player_state)
    R->>R: _populate_world_snapshot() — fill tool closure snapshot
    R->>G: agent.ainvoke(state, thread_id="{npc_id}_{player_id}")

    G->>LLM: reason — system prompt + history + lore
    LLM-->>G: AIMessage with tool_calls

    loop act loop (until no more tool_calls)
        G->>G: act — execute each tool, write to pending_actions[]
        G->>LLM: reason — ToolMessages + updated history
        LLM-->>G: AIMessage plain text → exit loop
    end

    G->>G: respond — store AIMessage.content as response_text
    G->>G: reflect — heuristic mood + relationship update

    opt human_count ≥ 10 AND count % 3 = 0
        G->>LLM: summarize — compress last 12 messages
        LLM-->>G: conversation_summary ≤ 500 chars
    end

    G-->>R: {response_text, pending_actions, mood, relationship_score}
    R->>WS: apply_actions(pending_actions) — sync HP, inventory, weather
    R-->>H: AgentResponse {dialogue, actions[], playerStateUpdate, npcStateUpdate}

    H->>C: send AgentResponse → player sees dialogue + 3D effects
    H->>C: broadcast npc_dialogue to nearby players (radius 100)
    H->>C: broadcast npc_actions to nearby players (radius 200)
```

---

## Cost & Latency Strategy

| Decision | Rationale |
|----------|-----------|
| `reflect` is heuristic (no LLM) | Zero cost per turn — mood/relationship from keyword matching |
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

Switch provider by setting `LLM_PROVIDER=openai` or `LLM_PROVIDER=anthropic` in `.env`.

---

## Adding a New Tool

1. Add the function in `server/src/agents/tools/<category>.py` using the closure pattern:
   ```python
   from typing import Any

   def create_my_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
       @tool
       def my_tool(param: str) -> str:
           """Tool description for the LLM."""
           pending_actions.append({"kind": "my_action", "params": {"param": param}})
           return f"Did {param}"
       return [my_tool]
   ```
   > mypy strict: parameterize all generics — bare `list`/`dict` are `[type-arg]` errors.
2. Register in `get_all_tools()` in `server/src/agents/tools/__init__.py`
3. Add action kind to `client/src/network/MessageProtocol.ts` (discriminated union)
4. Handle in `client/src/systems/ReactionSystem.ts`

## Adding a New NPC Archetype

1. Add personality in `server/src/agents/personalities/templates.py`
2. Add definition in `server/src/world/npc_definitions.py`
3. Agent auto-registers on server start — client spawns from `join_ok.npcs[]`
