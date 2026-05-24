# World of Promptcraft — Agentic Workflow

This document describes the LangGraph-powered NPC agent system: how player prompts flow through the graph, how agents reason and act, and how memory, mood, and relationship state persist across sessions.

---

## Overview

Each NPC runs an independent LangGraph `StateGraph`. When a player sends a text prompt, the server invokes that NPC's compiled graph with the player's message and world context. The graph reasons about the situation, optionally calls tools to take game actions, produces a dialogue response, then updates its internal memory state — all before returning to the client.

```
Player Prompt
     │
     ▼
┌─────────────┐     tool_calls?    ┌──────────┐
│   reason    │ ─────────────────▶ │   act    │
│  (LLM call) │                    │ (tools)  │
└─────────────┘ ◀─────────────────└──────────┘
     │ no tool_calls                   │ feeds ToolMessages back
     ▼
┌─────────────┐
│   respond   │  Extract dialogue text from last AIMessage
└─────────────┘
     │ always
     ▼
┌─────────────┐
│   reflect   │  Heuristic update: mood, relationship score, notes
└─────────────┘
     │ human_count ≥ 10 AND count % 3 == 0
     ▼
┌─────────────┐
│  summarize  │  LLM: rolling 2-3 sentence memory summary
└─────────────┘
     │
     ▼
  Response to client: { dialogue, actions[], playerStateUpdate, npcStateUpdate }
```

---

## Agent State (`NPCAgentState`)

All data flowing through the graph lives in a single `TypedDict`:

| Field | Type | Scope | Description |
|-------|------|-------|-------------|
| `messages` | `list` (accumulated) | Conversation | Full conversation history — `HumanMessage`, `AIMessage`, `ToolMessage` |
| `npc_id` | `str` | Static | NPC identifier |
| `npc_name` | `str` | Static | Display name injected into system prompt |
| `npc_personality` | `str` | Static | Full personality system prompt for this archetype |
| `player_state` | `dict` | Per-call | HP, mana, inventory, level — sent by client each interaction |
| `world_context` | `dict` | Per-call | Zone, weather, nearby entities, recent events, recent chat |
| `pending_actions` | `list[dict]` | Accumulated | Game actions queued by tool calls during this invocation |
| `response_text` | `str` | Output | Final dialogue string extracted by `respond` |
| `conversation_summary` | `str` | Persistent | Rolling LLM-generated summary of past conversations |
| `mood` | `str` | Persistent | Current emotional state: `neutral` / `happy` / `angry` / `sad` / `fearful` |
| `relationship_score` | `int` | Persistent | -100 (enemy) to +100 (trusted ally) |
| `personality_notes` | `str` | Persistent | NPC-specific observations about this player (max 300 chars) |

`MemorySaver` checkpoints state per `thread_id = "{npc_id}_{player_id}"`. Persistent fields survive across invocations.

---

## Nodes

### `reason` — LLM Reasoning

**File:** `server/src/agents/nodes/reason.py`  
**LLM call:** Yes

Builds the system prompt by combining:
- NPC personality (from `templates.py`)
- World context: zone, weather, nearby entities, recent events, recent chat
- Player state: HP, mana, level, inventory
- Persistent memory: conversation summary, mood, relationship tier, personality notes
- RAG lore: top-3 keyword-matched lore entries from `knowledge_base.py` injected when relevant

Then invokes `llm_with_tools` (LLM bound to all 14 tools). If the LLM decides to call tools, it returns an `AIMessage` with `tool_calls`; otherwise it returns a plain text `AIMessage`.

**Routing:** `_should_act_or_respond` reads `tool_calls` on the last message:
- `tool_calls` present → route to `act`
- empty → route to `respond`

### `act` — Tool Execution

**File:** `server/src/agents/nodes/act.py`  
**LLM call:** No

Executes each tool call from the LLM's last message in sequence. Tools write to a shared `pending_actions` list (closure pattern — see Tool System below). After execution:
- Appends new actions to `state["pending_actions"]`
- Returns `ToolMessage` results so the LLM can see outcomes
- Loops back to `reason` (multi-step reasoning allowed)

### `respond` — Dialogue Extraction

**File:** `server/src/agents/nodes/respond.py`  
**LLM call:** No

Reads `content` from the last `AIMessage` and stores it as `response_text`. This is the dialogue string returned to the client. Also carries forward `pending_actions` unchanged.

### `reflect` — Heuristic State Update

**File:** `server/src/agents/nodes/reflect.py`  
**LLM call:** No (zero-cost heuristic)

Analyzes recent human messages using keyword token sets to update:
- **Mood**: hostile/insult words → `angry`; fear words → `fearful`; sad words → `sad`; friendly/happy words → `happy`; otherwise decays toward `neutral`
- **Relationship score**: combat actions, item gifts, quests, hostile/friendly word frequency each contribute delta, clamped to [-20, +15] per exchange, accumulated in [-100, +100]
- **Personality notes**: accumulates NPC observations about the player (e.g., "has been aggressive", "is a quester") capped at 300 chars

Relationship tiers shown in system prompt:

| Score | Tier | Behavior |
|-------|------|----------|
| ≤ -50 | ENEMY | Hostile, guarded |
| -10 to -50 | DISTRUSTFUL | Wary, curt |
| -10 to +10 | STRANGER | Polite, reserved |
| +10 to +50 | FRIEND | Warm, helpful |
| > +50 | TRUSTED ALLY | Shares secrets, offers rare quests |

### `summarize` — Memory Compression

**File:** `server/src/agents/nodes/summarize.py`  
**LLM call:** Yes (conditional)

Fires when `human_count >= 10 AND human_count % 3 == 0` to keep memory bounded. Uses the LLM to produce a 2-3 sentence rolling summary of the last 12 messages, prepended with the previous summary. Output capped at 500 chars to avoid prompt bloat.

This is the **only second LLM call** in the pipeline and fires roughly every 3 turns after the first 10 — keeping cost predictable.

---

## Tool System

**File:** `server/src/agents/tools/`

Tools use a **closure pattern**: `get_all_tools(pending_actions, world_state)` returns `@tool`-decorated functions that share a mutable `pending_actions` list. When the LLM calls a tool, it appends an action dict to this list and optionally reads/mutates the `world_state` snapshot.

### Tool Categories

| Category | File | Tools |
|----------|------|-------|
| Combat | `combat.py` | `deal_damage`, `defend`, `flee`, `heal_target` |
| Dialogue | `dialogue.py` | `emote`, `give_quest`, `complete_quest` |
| Trade | `trade.py` | `offer_item`, `take_item` |
| Environment | `environment.py` | `change_weather`, `spawn_effect`, `move_npc` |
| World Query | `world_query.py` | `get_nearby_entities`, `check_player_state` |

### Action Flow

```
LLM calls tool → tool appends to pending_actions[]
                       │
                       ▼ (after graph completes)
              registry.apply_actions(pending_actions)
                       │
                       ├── Mutates server WorldState (HP, inventory, etc.)
                       └── Sends actions[] to client → ReactionSystem → 3D effects
```

### Action Kinds

| Kind | Server Effect | Client Effect |
|------|---------------|---------------|
| `damage` | Reduces player HP in `WorldState` | Red floating text, screen flash |
| `heal` | Restores player HP | Green floating text, green flash |
| `give_item` | Adds item to player inventory | Gold floating text, inventory update |
| `take_item` | Removes item from player inventory | Inventory update |
| `emote` | (none) | NPC plays animation |
| `move_npc` | (none, NPC moves client-side) | NPC lerps to new position |
| `spawn_effect` | (none) | Particle burst at position |
| `change_weather` | Updates world weather | Scene fog adjustment |
| `start_quest` | (quest tracking via client state) | Quest banner overlay |
| `complete_quest` | (quest tracking via client state) | Quest banner + reward |
| `advance_objective` | (quest tracking via client state) | Quest tracker update |

---

## Per-NPC Agent Registry

**File:** `server/src/agents/registry.py`

`AgentRegistry` owns one compiled graph per NPC. On startup it calls `_build_agents()` which:
1. Reads all NPCs from `WorldState`
2. For each NPC, creates isolated `pending_actions` and `world_snapshot` dicts
3. Builds the 14 tools (closed over those dicts)
4. Compiles the LangGraph with a `MemorySaver` checkpointer

Dynamic NPCs (spawned by `WorldGenerator` at runtime) are registered via `register_dynamic_npc()` which follows the same pattern.

**Thread safety:** Each `invoke()` call scopes conversation memory to `thread_id = "{npc_id}_{player_id}"`, so two players can talk to the same NPC concurrently with independent memory.

---

## RAG Lore System

**File:** `server/src/rag/`

When `reason` builds its system prompt, it calls `get_retriever().retrieve(player_prompt, top_k=3)`. The `LoreRetriever` does keyword matching against 47 WoW lore entries in `knowledge_base.py`. Matched entries are injected as a `## World Lore` section so the NPC responds with lore-accurate context (Elune, Teldrassil, Night Elves, etc.).

```
Player prompt → keyword tokenization → score all 47 entries
    → top-3 by (keyword_overlap + topic_boost) → inject into system prompt
```

---

## Cost & Latency Strategy

| Decision | Rationale |
|----------|-----------|
| `reflect` is heuristic (no LLM) | Zero cost per turn; mood/relationship updates are fast keyword matching |
| `summarize` is conditional (≥10 turns, every 3rd) | Minimizes LLM calls while keeping memory bounded |
| RAG is keyword-based (no embeddings) | Sub-millisecond retrieval; no vector DB dependency |
| Tools are synchronous within one turn | Avoids parallel LLM calls; predictable cost per player prompt |
| 30s LLM timeout | Prevents runaway agent calls from blocking WebSocket connections |

---

## Adding a New Tool

1. Add the tool function in the appropriate `server/src/agents/tools/` file using the closure pattern:
   ```python
   def create_my_tools(pending_actions: list, world_state: dict):
       @tool
       def my_tool(param: str) -> str:
           """Tool description for the LLM."""
           pending_actions.append({"kind": "my_action", "params": {"param": param}})
           return f"Did {param}"
       return [my_tool]
   ```
2. Register in `get_all_tools()` in `server/src/agents/tools/__init__.py`
3. Add the action kind to `client/src/network/MessageProtocol.ts` (new discriminated union member)
4. Handle it in `client/src/systems/ReactionSystem.ts`

---

## Adding a New NPC Archetype

1. Add personality in `server/src/agents/personalities/templates.py`
2. Add definition in `server/src/world/npc_definitions.py`
3. Agent auto-registers on server start — client spawns NPC from `join_ok.npcs[]`
