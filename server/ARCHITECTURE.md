# Server Architecture — World of Promptcraft

FastAPI + LangGraph backend with server-authoritative `WorldState`. NPC reasoning is per-NPC/per-player through compiled LangGraph agents managed by `AgentRegistry`.

---

## Layer Overview

```mermaid
flowchart TD
    subgraph Transport["Transport Layer"]
        API["FastAPI main.py"]
        WS["/ws endpoint"]
        CM["ConnectionManager"]
        H["ws/handler.py"]
    end

    subgraph Agent["Agent Layer"]
        REG["AgentRegistry"]
        G["npc_agent StateGraph"]
        RN["reason node"]
        AN["act node"]
        RSP["respond node"]
        RF["reflect node"]
        SUM["summarize node (compiled, not currently routed)"]
    end

    subgraph World["World Layer"]
        WSTATE["WorldState singleton + asyncio.Lock"]
        PDATA["PlayerData"]
        NDATA["NPCData"]
        NDEF["npc_definitions from world_manifest.json"]
    end

    subgraph Tooling["Tool Layer"]
        TOOLS["get_all_tools(...)"]
        C["combat"]
        D["dialogue"]
        E["environment"]
        Q["quest"]
        T["trade"]
        WQ["world_query"]
        M["music"]
    end

    subgraph Knowledge["Knowledge & LLM"]
        RAG["LoreRetriever"]
        KB["knowledge_base.py"]
        LLM["llm/provider.py"]
    end

    API --> WS --> H --> REG --> G
    H --> WSTATE
    REG --> TOOLS
    TOOLS --> C & D & E & Q & T & WQ & M
    G --> RN --> AN --> RSP --> RF
    RN --> RAG --> KB
    RN --> LLM
    TOOLS --> WSTATE
    NDEF --> WSTATE

    style H fill:#4a90d9,color:#fff,stroke:#2c6fad
    style REG fill:#4a90d9,color:#fff,stroke:#2c6fad
    style WSTATE fill:#4a90d9,color:#fff,stroke:#2c6fad
```

---

## Startup & Lifespan

```mermaid
sequenceDiagram
    participant U as uvicorn
    participant M as main.py lifespan
    participant W as WorldState
    participant R as AgentRegistry
    participant H as ws.handler

    U->>M: startup
    M->>W: WorldState() + refresh_npcs()
    M->>R: AgentRegistry(llm, world_state)
    M->>H: init_handler(registry, world_state, manager, world_builder_agent)
    M-->>U: app ready
```

---

## WebSocket Message Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as /ws endpoint
    participant H as handle_message
    participant CM as ConnectionManager
    participant AR as AgentRegistry
    participant W as WorldState

    C->>WS: JSON frame
    WS->>H: asyncio task per message
    H->>CM: registration / send / broadcast_nearby
    H->>W: update player/world state
    H->>AR: invoke(...) for interaction
    AR->>W: apply_actions(...)
    H-->>C: direct response (agent_response, pong, etc.)
    H-->>CM: nearby broadcasts (npc_dialogue, npc_actions, world_update)
```

**Concurrency controls currently in place**
1. Per-message task spawning in websocket receive loop (slow interactions don't block reads).
2. Per-player interaction lock (`_interaction_locks`) in interaction handler.
3. Global semaphore (`_agent_semaphore`) for capped concurrent LLM calls.

---

## Agent Pipeline (LangGraph)

```mermaid
flowchart LR
    START([START]) --> REASON["reason"]
    REASON -->|tool_calls| ACT["act"]
    ACT --> REASON
    REASON -->|no tool_calls| RESPOND["respond"]
    RESPOND --> REFLECT["reflect"]
    REFLECT --> END([END])
    SUM["summarize node exists\nbut no edge routes to it"]

    style REASON fill:#4a90d9,color:#fff,stroke:#2c6fad
    style ACT fill:#4a90d9,color:#fff,stroke:#2c6fad
```

### Node responsibilities
- **reason**: builds compact/full system prompt, injects world context + player state + memory fields, retrieves lore (RAG), binds tools (except short-social path), handles inline tool-call fallback.
- **act**: executes tool calls and harvests shared `pending_actions`.
- **respond**: extracts dialogue text.
- **reflect**: heuristic mood/relationship/personality-notes update (no LLM call).
- **summarize**: implemented but currently not connected in graph routing.

---

## Agent State Schema (`NPCAgentState`)

| Field | Type | Purpose |
|---|---|---|
| `messages` | `list[Any]` | Conversation history for LangGraph |
| `npc_id` / `npc_name` / `npc_personality` | `str` | NPC identity and persona |
| `player_state` | `dict[str, Any]` | HP/inventory/etc for current interaction |
| `world_context` | `dict[str, Any]` | zone/weather/nearby/chat/events |
| `pending_actions` | `list[dict[str, Any]]` | queued gameplay actions |
| `response_text` | `str` | final dialogue |
| `conversation_summary` | `str` | rolling memory summary |
| `mood` | `str` | current emotional state |
| `relationship_score` | `int` | player relationship score |
| `personality_notes` | `str` | compact persistent observations |

---

## Tool Closure Pattern

```mermaid
flowchart LR
    LLM["LLM tool calls"]
    FACT["get_all_tools(pending_actions, world_snapshot)"]
    SNAP["world_snapshot dict"]
    ACTS["pending_actions list"]
    APPLY["WorldState.apply_actions"]

    LLM --> FACT
    FACT --> SNAP
    FACT --> ACTS
    ACTS --> APPLY
```

Tool groups currently loaded: `combat`, `dialogue`, `environment`, `quest`, `trade`, `world_query`, `music`.

---

## RAG & LLM Path

```mermaid
flowchart LR
    P["player prompt"] --> R["LoreRetriever.retrieve(top_k=3)"]
    R --> K["knowledge_base entries"]
    K --> S["reason system prompt"]
    S --> L["provider-selected chat model"]
```

`llm/provider.py` supports `claude`, `openai`, and `ollama`, each with provider-specific timeout/retry settings.

---

## World State Model

```mermaid
flowchart TD
    W["WorldState"]
    P["players: dict[str, PlayerData]"]
    N["npcs: dict[str, NPCData]"]
    E["environment: weather/time_of_day"]
    C["chat_history deque"]
    EV["recent_events deque"]
    A["apply_actions() under lock"]
    CTX["get_context_for_npc()"]

    W --> P
    W --> N
    W --> E
    W --> C
    W --> EV
    W --> A
    W --> CTX

    style W fill:#4a90d9,color:#fff,stroke:#2c6fad
```

---

## Extension Guides

1. **Add a tool**: implement in `server/src/agents/tools/*.py`, include in `get_all_tools`, ensure action shape is handled client-side in `ReactionSystem`.
2. **Add NPC behavior/personality**: update manifest NPC entry and personality templates; refresh/register agents.
3. **Adjust latency behavior**: tune `settings.agent_invoke_timeout_seconds`, `_agent_semaphore`, short-social routing in `reason`, and interaction/chat radii in `handler`.
