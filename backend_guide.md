# World of Promptcraft -- Backend Developer Guide

## 1. Architecture Overview

The backend is a Python application built on four pillars:

```
┌──────────────┐     WebSocket      ┌──────────────────┐
│  Three.js    │◄──────────────────►│  FastAPI Server   │
│  Client      │   JSON messages    │  (main.py)        │
└──────────────┘                    └────────┬─────────┘
                                             │
                                    ┌────────▼─────────┐
                                    │  WebSocket Layer  │
                                    │  handler.py       │
                                    │  protocol.py      │
                                    │  connection_mgr   │
                                    └────────┬─────────┘
                                             │
                           ┌─────────────────┼─────────────────┐
                           ▼                 ▼                 ▼
                    ┌─────────────┐  ┌──────────────┐  ┌─────────────┐
                    │ Agent Layer │  │ World State  │  │ LLM Provider│
                    │ registry.py │  │ world_state  │  │ provider.py │
                    │ npc_agent   │  │ player_state │  │             │
                    │ tools/*     │  │ zones.py     │  │ Claude /    │
                    │ nodes/*     │  │ npc_defs     │  │ OpenAI      │
                    └─────────────┘  └──────────────┘  └─────────────┘
```

### Component Roles

| Component | File(s) | Responsibility |
|-----------|---------|---------------|
| **FastAPI app** | `server/src/main.py` | HTTP server, WebSocket endpoint at `/ws`, health check at `/health`, lifespan startup/shutdown |
| **WebSocket layer** | `server/src/ws/handler.py`, `connection_manager.py`, `protocol.py` | Message routing, connection tracking, Pydantic message schemas |
| **Agent system** | `server/src/agents/registry.py`, `npc_agent.py`, `agent_state.py` | One LangGraph compiled graph per NPC, manages invocation lifecycle |
| **Graph nodes** | `server/src/agents/nodes/reason.py`, `act.py`, `respond.py` | The three steps of the agent loop: think, execute tools, format response |
| **Tool system** | `server/src/agents/tools/*.py` | Closures over shared mutable state that the LLM can call to affect the game world |
| **Personalities** | `server/src/agents/personalities/templates.py` | System prompts defining NPC behavior, archetypes, and rules |
| **World state** | `server/src/world/world_state.py`, `player_state.py`, `npc_definitions.py`, `zones.py` | Singleton authoritative game state with async-locked mutations |
| **LLM provider** | `server/src/llm/provider.py`, `server/src/config.py` | Factory for LangChain chat models (Claude or OpenAI) |

---

## 2. Agent Lifecycle: From Player Prompt to Response

Here is the complete sequence when a player types a prompt in the game:

### Step 1: Client sends WebSocket message

```json
{
  "type": "interaction",
  "npcId": "dragon_01",
  "prompt": "I challenge you to a fight!",
  "playerId": "default",
  "playerState": { "position": [100, 0, -70], "hp": 100, "inventory": [] }
}
```

### Step 2: `handler.py` routes the message

`handle_message()` dispatches to `_handle_interaction()` based on `type: "interaction"`.

```python
# server/src/ws/handler.py
async def handle_message(data: dict) -> dict:
    msg_type = data.get("type")
    if msg_type == "interaction":
        return await _handle_interaction(data)
    if msg_type == "player_move":
        return await _handle_player_move(data)
```

### Step 3: Handler prepares and invokes the agent

`_handle_interaction()`:
1. Extracts `npc_id`, `player_id`, `prompt`, and `player_state` from the message.
2. Ensures the player exists in `WorldState`.
3. Merges any client-sent state into the authoritative `PlayerData`.
4. Calls `registry.invoke(npc_id, player_id, prompt, player_state)`.

### Step 4: `AgentRegistry.invoke()` prepares agent input

In `server/src/agents/registry.py`:
1. Looks up the compiled LangGraph agent for the NPC.
2. Calls `_populate_world_snapshot()` to fill the tool-closure `world_snapshot` dict with current player data, NPC positions, and NPC metadata.
3. Calls `world_state.get_npc_config()` for name + personality.
4. Calls `world_state.get_context_for_npc()` for zone, weather, time, nearby entities.
5. Builds the `input_state` dict (an `NPCAgentState` TypedDict).
6. Invokes the LangGraph agent with `agent.ainvoke(input_state, config)`.

The `config` includes `thread_id = f"{npc_id}_{player_id}"` which enables per-player conversation memory via LangGraph's `MemorySaver` checkpointer.

### Step 5: LangGraph executes the reason -> act -> respond graph

See Section 3 for the full graph structure.

### Step 6: Registry applies actions to world state

After the graph returns:
1. Extracts `pending_actions` from the result.
2. Calls `world_state.apply_actions(pending_actions)` to mutate authoritative state.
3. Reads back updated player and NPC data.
4. Returns `{ dialogue, actions, playerStateUpdate, npcStateUpdate }`.

### Step 7: Handler sends response to client

```json
{
  "type": "agent_response",
  "npcId": "dragon_01",
  "dialogue": "Foolish mortal! Thou darest challenge Ignathar?",
  "actions": [
    { "kind": "emote", "params": { "animation": "threaten" } },
    { "kind": "damage", "params": { "target": "player", "amount": 30, "damageType": "fire" } },
    { "kind": "spawn_effect", "params": { "effectType": "fire", "duration": 3.0 } }
  ],
  "playerStateUpdate": { "hp": 70, "max_hp": 100, ... },
  "npcStateUpdate": { "npc_id": "dragon_01", "hp": 500, ... }
}
```

### Step 8: Client processes response

The Three.js client's `ReactionSystem.handleResponse()` processes each action, updating HP, playing animations, spawning particles, etc.

---

## 3. LangGraph Graph Structure

Each NPC gets its own compiled `StateGraph` built in `server/src/agents/npc_agent.py`.

### Graph Topology

```
START
  │
  ▼
reason ──── (conditional edge) ──── tool_calls? ──── yes ──► act
  ▲              │                                           │
  │              no                                          │
  │              ▼                                           │
  │           respond ──► END                                │
  │                                                          │
  └──────────────────────────────────────────────────────────┘
                    (act always loops back to reason)
```

### State Schema

Defined in `server/src/agents/agent_state.py`:

```python
class NPCAgentState(TypedDict):
    messages: Annotated[list, add_messages]  # Conversation history (auto-appended)
    npc_id: str
    npc_name: str
    npc_personality: str
    player_state: dict          # HP, inventory, position
    world_context: dict         # Nearby entities, time of day, zone
    pending_actions: list[dict] # Actions to execute in the world
    response_text: str          # Final dialogue to send back
```

The `messages` field uses LangGraph's `add_messages` reducer, which appends new messages to the existing list rather than replacing it.

### Node Details

**`reason` node** (`server/src/agents/nodes/reason.py`):
- Builds a system prompt from NPC personality, world context, and player state.
- Prepends the system prompt as a `SystemMessage` to the conversation history.
- Invokes the LLM with tools bound (`llm.bind_tools(tools)`).
- Returns the AI message (which may contain `tool_calls`).

**`act` node** (`server/src/agents/nodes/act.py`):
- Reads `tool_calls` from the last AI message.
- Clears the shared `pending_actions` list.
- Executes each tool call by name lookup.
- Collects `ToolMessage` results.
- Harvests any actions the tools appended to the shared list.
- Returns tool messages + accumulated pending actions.

**`respond` node** (`server/src/agents/nodes/respond.py`):
- Extracts the `content` from the last AI message as the final dialogue text.
- Passes through `pending_actions` unchanged.
- Returns `{ response_text, pending_actions }`.

### Conditional Edge

```python
def _should_act_or_respond(state: NPCAgentState) -> str:
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", [])
    if tool_calls:
        return "act"
    return "respond"
```

If the LLM returned tool calls, go to `act`. Otherwise, go straight to `respond`.

After `act` completes, the graph always loops back to `reason`, giving the LLM a chance to call more tools or produce a final text response.

### Memory / Checkpointing

Each agent uses `MemorySaver()` as its checkpointer. The thread ID is `f"{npc_id}_{player_id}"`, meaning each player has a separate conversation history with each NPC. Conversation persists across interactions within the same server session but is lost on server restart (in-memory only).

---

## 4. Tool System

### 4.1 Factory / Closure Pattern

Tools are created via factory functions that close over two shared mutable objects:

- **`pending_actions: list`** -- Tools append action dicts here. The `act` node harvests them after each tool execution.
- **`world_state: dict`** -- A snapshot dict populated before each invocation with player data, NPC positions, etc. Some tools also mutate this (e.g., `deal_damage` updates `player.hp`).

```python
# Example from server/src/agents/tools/combat.py
def create_combat_tools(pending_actions: list, world_state: dict) -> list:
    @tool
    def deal_damage(target: str, amount: int, damage_type: str = "physical") -> str:
        pending_actions.append({
            "kind": "damage",
            "params": {"target": target, "amount": amount, "damageType": damage_type},
        })
        if target == "player":
            player = world_state.get("player", {})
            current_hp = player.get("hp", 100)
            player["hp"] = max(0, current_hp - amount)
            world_state["player"] = player
        return f"Dealt {amount} {damage_type} damage to {target}"

    # ... more tools ...
    return [deal_damage, defend, flee]
```

### 4.2 Tool Categories

| Category | Factory | File | Tools |
|----------|---------|------|-------|
| **Combat** | `create_combat_tools()` | `tools/combat.py` | `deal_damage`, `defend`, `flee` |
| **Dialogue** | `create_dialogue_tools()` | `tools/dialogue.py` | `emote`, `give_quest`, `complete_quest` |
| **Trade** | `create_trade_tools()` | `tools/trade.py` | `offer_item`, `take_item` |
| **Environment** | `create_environment_tools()` | `tools/environment.py` | `change_weather`, `spawn_effect`, `move_npc` |
| **World Query** | `create_world_query_tools()` | `tools/world_query.py` | `get_nearby_entities`, `check_player_state` |

### 4.3 Tool Registration

All tools are collected by `get_all_tools()` in `server/src/agents/tools/__init__.py`:

```python
_CATEGORY_FACTORIES: dict[str, callable] = {
    "combat": create_combat_tools,
    "dialogue": create_dialogue_tools,
    "environment": create_environment_tools,
    "trade": create_trade_tools,
    "world_query": create_world_query_tools,
}
```

`get_all_tools()` instantiates all categories. `get_tools_by_category()` allows selective instantiation.

### 4.4 How to Add a New Tool

1. **Create or edit a tool factory** in `server/src/agents/tools/`. The function must accept `pending_actions: list` and `world_state: dict`.

2. **Define the tool** using the `@tool` decorator from `langchain_core.tools`:

```python
@tool
def my_new_tool(param1: str, param2: int = 10) -> str:
    """Clear docstring explaining when the LLM should use this tool.

    Args:
        param1: Description of param1.
        param2: Description of param2.
    """
    pending_actions.append({
        "kind": "my_action_kind",
        "params": {"param1": param1, "param2": param2},
    })
    return f"Did something with {param1}"
```

3. **Register the factory** in `server/src/agents/tools/__init__.py`:

```python
from .my_module import create_my_tools

_CATEGORY_FACTORIES["my_category"] = create_my_tools
```

And add it to `get_all_tools()`.

4. **Handle the action on the client** in `ReactionSystem.processAction()`:

```typescript
case "my_action_kind": {
  // React to the action
  break;
}
```

5. **Add the action kind** to `client/src/network/MessageProtocol.ts` in the `Action.kind` union type.

6. **(Optional)** If the action mutates authoritative state, add a handler in `WorldState.apply_actions()`.

---

## 5. World State

### 5.1 Authoritative Server State

`WorldState` in `server/src/world/world_state.py` is a **singleton** (enforced via `__new__`). It holds:

- **`players: dict[str, PlayerData]`** -- keyed by player ID (default: `"default"`)
- **`npcs: dict[str, NPCData]`** -- keyed by NPC ID, loaded from `NPC_DEFINITIONS` at startup
- **`environment: dict`** -- `weather` and `time_of_day`

All mutations go through `async with self._lock` to prevent race conditions from concurrent WebSocket messages.

### 5.2 PlayerData

Defined in `server/src/world/player_state.py`:

```python
@dataclass
class PlayerData:
    hp: int = 100
    max_hp: int = 100
    mana: int = 50
    max_mana: int = 50
    level: int = 1
    inventory: list[str] = field(default_factory=list)
    position: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
```

### 5.3 NPCData

Defined in `server/src/world/world_state.py`:

```python
@dataclass
class NPCData:
    npc_id: str
    name: str
    personality: str   # The full system prompt text
    hp: int = 100
    position: list[float] = field(default_factory=lambda: [0.0, 0.0, 0.0])
    mood: str = "neutral"
```

### 5.4 How Actions Mutate State

`WorldState.apply_actions()` processes a list of action dicts. Currently supported action kinds:

| Action Kind | Parameters | Effect |
|-------------|-----------|--------|
| `damage_player` | `player_id`, `amount` | Reduces player HP (min 0) |
| `heal_player` | `player_id`, `amount` | Increases player HP (max `max_hp`) |
| `give_item` | `player_id`, `item` | Appends item to player inventory |
| `remove_item` | `player_id`, `item` | Removes first matching item from inventory |
| `update_npc_mood` | `npc_id`, `mood` | Sets NPC mood string |
| `damage_npc` | `npc_id`, `amount` | Reduces NPC HP (min 0) |

**Known issue**: The `deal_damage` tool emits `kind: "damage"` but `apply_actions` checks for `kind: "damage_player"`. This means tool-initiated damage does not persist in the authoritative state. The tool does mutate the closure's `world_state` dict, but that's a snapshot copy, not the authoritative `WorldState`.

### 5.5 Zones

Defined in `server/src/world/zones.py`. Four zones with axis-aligned bounding boxes:

| Zone | X Range | Z Range |
|------|---------|---------|
| Elders' Village | -50 to 50 | -50 to 50 |
| Dark Forest | -100 to 100 | 50 to 200 |
| Ember Peaks | 50 to 200 | -100 to 100 |
| Crystal Lake | -200 to -50 | -100 to 100 |

Any position outside these ranges returns `"Wilderness"`.

`get_zone(position)` returns the zone name. `get_zone_description(name)` returns a flavor text string.

---

## 6. NPC Personality System

### 6.1 How System Prompts Work

Each NPC's behavior is driven by a system prompt stored in `server/src/agents/personalities/templates.py` in the `NPC_PERSONALITIES` dict.

The system prompt is injected at the start of every LLM call by the `reason` node:

```python
# server/src/agents/nodes/reason.py
def _build_system_prompt(state: NPCAgentState) -> str:
    parts = [
        f"You are {state['npc_name']}, an NPC in the world of Promptcraft.",
        "",
        "## Your Personality",
        state.get("npc_personality", "You are a helpful villager."),
        "",
        "## Current World Context",
        f"- Zone: {world.get('zone', 'Unknown')}",
        # ... weather, time, nearby entities ...
        "",
        "## Player State",
        f"- HP: {player.get('hp', '?')}/{player.get('max_hp', '?')}",
        # ... mana, level, inventory ...
        "",
        "## Instructions",
        "Respond to the player's prompt. Use tools to take actions in the world.",
    ]
```

### 6.2 Personality Template Structure

Each personality entry contains:

```python
"dragon_01": {
    "name": "Ignathar the Ancient",
    "archetype": "hostile_boss",       # Used for aggro/behavior classification
    "initial_hp": 500,
    "position": [120, 15, -80],
    "system_prompt": "You are Ignathar the Ancient, a colossal fire dragon...",
}
```

The `system_prompt` typically includes four sections:
1. **Identity** -- Who the NPC is, how they speak.
2. **PERSONALITY** -- Core traits and values.
3. **BEHAVIOR RULES** -- Explicit instructions for tool use, conditional on player actions.
4. **ABILITIES / INVENTORY** -- What tools to use and when.

### 6.3 Current NPCs

| ID | Name | Archetype | HP | Location |
|----|------|-----------|-----|----------|
| `dragon_01` | Ignathar the Ancient | `hostile_boss` | 500 | Ember Peaks (120, 15, -80) |
| `merchant_01` | Thornby the Merchant | `friendly_merchant` | 80 | Village (5, 0, 8) |
| `sage_01` | Elyria the Sage | `quest_giver` | 120 | Crystal Lake (-40, 5, -30) |
| `guard_01` | Captain Aldric | `neutral_guard` | 200 | Village entrance (15, 0, 2) |
| `healer_01` | Sister Mira | `friendly_healer` | 100 | Village temple (-5, 0, 12) |

### 6.4 How to Add a New NPC

1. **Add a personality template** in `server/src/agents/personalities/templates.py`:

```python
NPC_PERSONALITIES["my_npc_01"] = {
    "name": "My NPC Name",
    "archetype": "hostile_roamer",  # or "friendly_merchant", "quest_giver", etc.
    "initial_hp": 75,
    "position": [50, 0, 60],
    "system_prompt": (
        "You are My NPC Name, a ...\n\n"
        "PERSONALITY:\n"
        "- ...\n\n"
        "BEHAVIOR RULES:\n"
        "- ...\n"
    ),
}
```

2. **Add an NPC definition** in `server/src/world/npc_definitions.py`:

```python
NPC_DEFINITIONS["my_npc_01"] = {
    "id": "my_npc_01",
    "name": NPC_PERSONALITIES["my_npc_01"]["name"],
    "position": NPC_PERSONALITIES["my_npc_01"]["position"],
    "initial_hp": NPC_PERSONALITIES["my_npc_01"]["initial_hp"],
    "personality_key": "my_npc_01",
}
```

3. **Restart the server**. The NPC will be loaded by `WorldState._load_default_npcs()` and an agent will be created by `AgentRegistry._build_agents()`.

4. **Add the NPC model/mesh on the client** in the entity manager so it appears in the 3D world.

---

## 7. Configuration

### 7.1 Settings

All configuration is in `server/src/config.py` via Pydantic's `BaseSettings`:

```python
class Settings(BaseSettings):
    llm_provider: Literal["claude", "openai"] = "openai"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.1
    max_tokens: int = 4096
    ws_port: int = 8000

    model_config = {"env_file": ["../.env", ".env"], "env_file_encoding": "utf-8"}
```

### 7.2 Environment Variables

Create a `.env` file in the project root or `server/` directory:

```bash
# LLM Provider: "claude" or "openai"
LLM_PROVIDER=openai

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
OPENAI_API_BASE=https://api.openai.com/v1

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Tuning
LLM_TEMPERATURE=0.1
MAX_TOKENS=4096
WS_PORT=8000
```

### 7.3 LLM Provider Setup

`server/src/llm/provider.py` returns either a `ChatAnthropic` or `ChatOpenAI` instance based on `settings.llm_provider`. The factory is called once during app startup in `main.py`.

To use a local model (e.g., via Ollama or LM Studio), set:
```bash
LLM_PROVIDER=openai
OPENAI_API_BASE=http://localhost:1234/v1
OPENAI_API_KEY=not-needed
OPENAI_MODEL=your-local-model
```

---

## 8. Common Issues and Debugging

### 8.1 LLM Not Calling Tools

**Symptoms**: The NPC responds with text but never triggers any game actions (no damage, no items, no effects).

**Root causes and fixes**:

1. **System prompt too vague**: The `BEHAVIOR RULES` section in the personality template must explicitly name tools and their parameters. For example, instead of "attack the player", write "call `deal_damage(target='player', amount=25, damage_type='fire')`".

2. **Tool descriptions unclear**: The `@tool` docstring is what the LLM sees as the tool schema description. Make it specific about *when* to use the tool.

3. **Temperature too high**: High temperature (> 0.3) can cause the LLM to "forget" to use tools. Keep `LLM_TEMPERATURE` at 0.1 for reliable tool use.

4. **Model doesn't support tool calling well**: `gpt-4o-mini` has decent tool support. `claude-sonnet-4-20250514` is excellent. Smaller/local models may struggle.

5. **Too many tools**: The LLM currently receives all 12 tools. Consider providing only relevant tools based on NPC archetype (use `get_tools_by_category()` instead of `get_all_tools()`).

### 8.2 Actions Not Persisting

**Symptom**: `deal_damage` is called but player HP doesn't change on subsequent interactions.

**Root cause**: The `deal_damage` tool emits `kind: "damage"` actions, but `WorldState.apply_actions()` only processes `kind: "damage_player"`. The client-side `ReactionSystem` does process `"damage"` and updates the local `PlayerState`, but the server's authoritative state is unchanged.

**Fix**: Change the tool to emit `"damage_player"` / `"damage_npc"` kinds for authoritative mutations, plus `"damage"` for client-side visual feedback. Or update `apply_actions()` to handle `"damage"` as well.

### 8.3 Conversation Memory Issues

**Symptom**: NPC doesn't remember previous interactions.

**Check**: The `MemorySaver` checkpointer is in-memory only. It works within a single server session. If the server restarts, all conversation history is lost.

**Thread ID**: Memory is keyed by `f"{npc_id}_{player_id}"`. If the client sends different `playerId` values, conversations won't be linked.

### 8.4 World Snapshot Stale Data

**Symptom**: `get_nearby_entities` returns outdated positions.

**Cause**: The `world_snapshot` dict (used by tool closures) is populated once in `_populate_world_snapshot()` before agent invocation. If an agent makes multiple tool calls in sequence, the snapshot reflects the state at invocation time, not after intermediate mutations.

### 8.5 Testing an Agent Manually

You can test agents without the Three.js client by connecting to the WebSocket directly:

```python
import asyncio
import websockets
import json

async def test():
    async with websockets.connect("ws://localhost:8000/ws") as ws:
        await ws.send(json.dumps({
            "type": "interaction",
            "npcId": "dragon_01",
            "prompt": "I challenge you to a duel!",
            "playerId": "test_player",
            "playerState": {"hp": 100, "position": [110, 0, -75], "inventory": []}
        }))
        response = json.loads(await ws.recv())
        print(json.dumps(response, indent=2))

asyncio.run(test())
```

Or use `wscat`:
```bash
wscat -c ws://localhost:8000/ws
> {"type":"interaction","npcId":"merchant_01","prompt":"What do you sell?","playerId":"test"}
```

### 8.6 Enabling Debug Logging

Add to your `.env` or set before running:
```bash
LOG_LEVEL=DEBUG
```

Or modify `server/src/main.py`:
```python
logging.basicConfig(level=logging.DEBUG)
```

This will show LangGraph execution steps including tool calls and their results.

---

## 9. How to Extend

### 9.1 Adding a New Tool Category

1. Create `server/src/agents/tools/my_category.py`:

```python
from langchain_core.tools import tool

def create_my_tools(pending_actions: list, world_state: dict) -> list:
    @tool
    def my_tool(arg: str) -> str:
        """Description of what this tool does and when to use it."""
        pending_actions.append({"kind": "my_action", "params": {"arg": arg}})
        return f"Result: {arg}"

    return [my_tool]
```

2. Register in `server/src/agents/tools/__init__.py`:

```python
from .my_category import create_my_tools

_CATEGORY_FACTORIES["my_category"] = create_my_tools
```

3. Add to `get_all_tools()` body.

4. Handle `"my_action"` in `client/src/systems/ReactionSystem.ts` and add the kind to `MessageProtocol.ts`.

### 9.2 Adding a New Agent Node Type

1. Create `server/src/agents/nodes/my_node.py`:

```python
async def my_node(state: NPCAgentState) -> dict:
    """Custom processing step."""
    # Read from state
    messages = state["messages"]
    pending = state.get("pending_actions", [])

    # Do something
    pending.append({"kind": "my_auto_action", "params": {}})

    return {"pending_actions": pending}
```

2. Add the node to the graph in `server/src/agents/npc_agent.py`:

```python
from .nodes.my_node import my_node

graph.add_node("my_step", my_node)
```

3. Wire it into the graph topology with edges:

```python
graph.add_edge("act", "my_step")      # After act, go to my_step
graph.add_edge("my_step", "reason")    # Then back to reason
```

### 9.3 Adding New Message Types (Client-Server Protocol)

1. **Server-side schema** in `server/src/ws/protocol.py`:

```python
class MyNewMessage(BaseModel):
    type: str = "my_new_type"
    data: str
    model_config = {"populate_by_name": True}
```

2. **Handler** in `server/src/ws/handler.py`:

```python
async def handle_message(data: dict) -> dict:
    msg_type = data.get("type")
    if msg_type == "my_new_type":
        return await _handle_my_new_type(data)
    # ...
```

3. **Client-side type** in `client/src/network/MessageProtocol.ts`:

```typescript
export interface MyNewMessage {
  type: "my_new_type";
  data: string;
}

export type ClientMessage = PlayerInteraction | PlayerMove | MyNewMessage;
```

### 9.4 Selective Tool Assignment Per NPC

Currently all NPCs get all tools. To assign tools based on archetype:

```python
# In registry.py._build_agents()
archetype = npc_data.archetype  # Add this field to NPCData

archetype_tools = {
    "hostile_boss": ["combat", "environment", "world_query"],
    "friendly_merchant": ["dialogue", "trade", "world_query"],
    "quest_giver": ["dialogue", "environment", "world_query"],
    "neutral_guard": ["combat", "dialogue", "world_query"],
    "friendly_healer": ["dialogue", "environment", "world_query"],
}

categories = archetype_tools.get(archetype, list(_CATEGORY_FACTORIES.keys()))
tools = []
for cat in categories:
    tools.extend(get_tools_by_category(cat, pending_actions, world_snapshot))
```

This reduces the tool count the LLM sees, improving reliability and reducing confusion.

---

## Appendix: File Reference

```
server/src/
├── __init__.py
├── config.py                          # Pydantic settings, env var loading
├── main.py                            # FastAPI app, lifespan, WebSocket endpoint
├── agents/
│   ├── __init__.py
│   ├── agent_state.py                 # NPCAgentState TypedDict
│   ├── npc_agent.py                   # LangGraph StateGraph builder
│   ├── registry.py                    # AgentRegistry: agent lifecycle manager
│   ├── nodes/
│   │   ├── __init__.py
│   │   ├── reason.py                  # LLM reasoning + system prompt construction
│   │   ├── act.py                     # Tool execution node
│   │   └── respond.py                 # Final response extraction
│   ├── personalities/
│   │   ├── __init__.py
│   │   └── templates.py               # NPC personality system prompts
│   └── tools/
│       ├── __init__.py                # Tool registry, get_all_tools()
│       ├── combat.py                  # deal_damage, defend, flee
│       ├── dialogue.py                # emote, give_quest, complete_quest
│       ├── environment.py             # change_weather, spawn_effect, move_npc
│       ├── trade.py                   # offer_item, take_item
│       └── world_query.py            # get_nearby_entities, check_player_state
├── llm/
│   ├── __init__.py
│   └── provider.py                    # LLM factory (Claude / OpenAI)
├── world/
│   ├── __init__.py
│   ├── npc_definitions.py             # Static NPC metadata
│   ├── player_state.py                # PlayerData dataclass
│   ├── world_state.py                 # WorldState singleton, action application
│   └── zones.py                       # Zone definitions and position lookup
└── ws/
    ├── __init__.py
    ├── connection_manager.py           # WebSocket connection tracking
    ├── handler.py                      # Message routing and handling
    └── protocol.py                     # Pydantic message schemas
```
