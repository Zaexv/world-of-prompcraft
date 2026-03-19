---
date: "2026-03-19T10:00:55.932050+00:00"
git_commit: d509c9a3642e1c7a0c32c212bf49d79cb16d406f
branch: main
topic: "Multiplayer System Enablement and Current Bug Inventory"
tags: [research, codebase, multiplayer, networking, websocket, bugs, state-management]
status: complete
---

# Research: Multiplayer System Enablement and Current Bug Inventory

## Research Question
How can a multiplayer system be enabled, and what are the current bugs that need fixing?

## Summary

The codebase has a **single-player architecture with multi-player-aware data structures**. The server tracks players in a `dict[str, PlayerData]` keyed by `player_id`, and `ConnectionManager` has a `broadcast()` method, but neither is actively used for multiplayer. All clients currently share the hardcoded identity `"default"`. Enabling multiplayer requires: (1) player identity assignment at login, (2) associating WebSocket connections with player IDs, (3) broadcasting world state changes to all relevant clients, and (4) rendering remote players on each client.

Additionally, there are several concrete bugs: the server returns errors for every client heartbeat ping, the `PlayerInteraction` message lacks a `playerId` field, NPC definitions are duplicated client/server, and client state (player position) is never synced back to `PlayerState`.

---

## Detailed Findings

### 1. Current Networking Architecture

#### Server WebSocket Endpoint (`server/src/main.py:49-59`)
- Single `/ws` endpoint accepts all connections
- Each connection loops: `receive_json() → handle_message() → send_json()`
- Responses are sent **only** to the requesting client (no broadcast)
- `ConnectionManager` is instantiated at module level (line 41) but its `broadcast()` method is never called

#### ConnectionManager (`server/src/ws/connection_manager.py:1-18`)
- Maintains `active_connections: list[WebSocket]`
- Has `connect()`, `disconnect()`, and `broadcast(data)` methods
- **No player_id ↔ WebSocket mapping exists** — connections are anonymous
- `broadcast()` sends to all connections indiscriminately (no area-of-interest filtering)

#### WebSocketClient (`client/src/network/WebSocketClient.ts:1-107`)
- Connects to `ws://localhost:8000/ws` on construction (line 23)
- Auto-reconnect with exponential backoff (1s → 30s max)
- Heartbeat: sends `{"type": "ping"}` every 30s (line 96)
- `send()` silently drops messages if disconnected (line 32-34)
- No message queue or retry mechanism

#### Message Protocol (`client/src/network/MessageProtocol.ts:1-69`)
- `PlayerInteraction`: has `npcId`, `prompt`, `playerState` but **no `playerId` field** (lines 3-12)
- `PlayerMove`: has `position` but **no `playerId` field** (lines 14-17)
- Server protocol (`server/src/ws/protocol.py`): `PlayerInteraction` model has `player_id` with alias `"playerId"` and default `"default"` (line 8)

### 2. Player Identity

#### Login Flow (`client/src/ui/LoginScreen.ts`)
- The LoginScreen is purely visual — a title screen with an "Enter World" button
- No username input, no authentication, no player ID generation
- `onEnterWorld` callback simply hides the screen and calls `initGame()` (main.ts:26-29)

#### Hardcoded Player ID
- `main.ts:174` — `playerId: 'default'` in `use_item` messages
- `main.ts:203` — `playerId: 'default'` in `equip_item` messages
- `main.ts:249-259` — `interaction` message **omits playerId entirely**
- Server handler (`handler.py:247`) falls back: `data.get("playerId", data.get("player_id", "default"))`

#### Server Player Tracking (`server/src/world/world_state.py:77-80`)
- `get_player(player_id)` lazily creates `PlayerData` on first access
- Players stored in `self.players: dict[str, PlayerData]`
- Currently all clients map to `players["default"]` — they share the same server-side player state

### 3. What Exists for Multi-Player Support

| Component | Multi-Player Ready? | Details |
|-----------|---------------------|---------|
| `WorldState.players` dict | Yes | Keyed by `player_id`, supports N players |
| `ConnectionManager.broadcast()` | Partial | Sends to all, but no player_id mapping |
| Agent memory thread IDs | Yes | Uses `f"{npc_id}_{player_id}"` — each player gets separate NPC conversation history (`server/src/agents/registry.py:147`) |
| `PlayerData` dataclass | Yes | Stateless per-player (no identity stored internally) |
| Client rendering | No | Only renders local player + NPCs; no "other player" entity type |
| Client message protocol | No | `PlayerInteraction` and `PlayerMove` lack `playerId` |
| Login/auth | No | No identity mechanism exists |

### 4. World State Synchronization

#### Server → Client State Flow
1. Client sends `interaction` with `prompt` + `playerState` snapshot
2. Server invokes NPC agent, which may produce actions (damage, heal, give_item, etc.)
3. Server applies actions to `WorldState` via `apply_actions()` (`world_state.py:131-193`)
4. Server returns `AgentResponse` with `dialogue`, `actions[]`, `npcStateUpdate`
5. Client `ReactionSystem` processes actions locally (visual effects + state mutations)
6. Client `PlayerState.merge()` applies any `playerStateUpdate` from server

#### What Is NOT Synchronized
- **Player position**: `PlayerController.position` is never sent to server (the `player_move` message type exists in protocol but is never used in `main.ts`)
- **PlayerState.position**: Initialized to `[0,0,0]` and never updated from `PlayerController` (`PlayerState.ts:40`)
- **NPC deaths**: When an NPC dies, the client removes it from the scene but no death event is broadcast to other clients
- **Weather/time changes**: `change_weather` actions mutate server state but only the requesting client processes the visual change
- **Inventory state**: Server copy can become stale; client syncs inventory on `use_item` calls but not continuously

### 5. NPC State Management

#### Server NPCs (`server/src/world/npc_definitions.py`)
- 6 predefined NPCs with IDs, names, positions, HP, personality keys
- Loaded into `WorldState.npcs` at startup via `_load_default_npcs()` (`world_state.py:59-73`)

#### Dynamic NPCs (WorldGenerator)
- Client generates NPCs procedurally per chunk (`WorldGenerator.ts:538-648`)
- Sends `explore_area` message with NPC data to server
- Server creates `NPCData` and registers agent (`handler.py:377-404`)
- NPC IDs are deterministic: `gen_{chunkX}_{chunkZ}`, `citizen_{cx}_{cz}_{i}`
- **No deduplication**: If two clients explore the same chunk, the second `explore_area` is silently ignored (server checks `npc_id not in _world_state.npcs`)

### 6. Agent Architecture (`server/src/agents/registry.py`)
- Each NPC gets a compiled LangGraph `StateGraph` with 3 nodes: reason → act → respond
- Agent memory uses `MemorySaver` with thread_id `f"{npc_id}_{player_id}"` — separate conversation history per player per NPC
- Tools are created via closure pattern: `create_X_tools(pending_actions, world_state)` — each invocation gets a fresh `pending_actions` list
- After agent completes, `pending_actions` are applied to `WorldState` and returned to client

---

## Current Bugs

### Bug 1: Server Returns Error for Every Ping (Critical)
- **Client**: `WebSocketClient.ts:96` sends `{"type": "ping"}` every 30 seconds
- **Server**: `handler.py:242` has no case for `"ping"` message type
- **Result**: Server returns `{"type": "error", "message": "Unknown message type: ping"}` every 30 seconds per connected client
- **Impact**: Wasted bandwidth, noisy logs, client receives error responses it doesn't handle

### Bug 2: Missing playerId in Interaction Messages
- **Client**: `main.ts:249-259` sends `interaction` message without `playerId`
- **Server**: `handler.py:247` falls back to `"default"` via `data.get("playerId", data.get("player_id", "default"))`
- **Impact**: All players share the same server-side identity; same NPC conversation history and player state

### Bug 3: PlayerState.position Never Updated
- **Client**: `PlayerState.position` is `[0, 0, 0]` forever (`PlayerState.ts:40`)
- **Client**: `PlayerController.position` has the real position but never syncs to `PlayerState`
- **Impact**: Any code using `playerState.position` gets stale data; interaction messages send `playerController.position` directly as a workaround (`main.ts:254`)

### Bug 4: Player Move Messages Never Sent
- **Protocol**: `PlayerMove` type defined (`MessageProtocol.ts:14-17`)
- **Server**: `_handle_player_move()` handler exists (`handler.py:364-374`)
- **Client**: No code ever sends `player_move` messages
- **Impact**: Server has no knowledge of player position (except from `interaction` message snapshots)

### Bug 5: NPC Definitions Duplicated Client/Server
- **Client**: `main.ts:56-63` hardcodes 6 NPC configs (id, name, position, color)
- **Server**: `npc_definitions.py` defines the same 6 NPCs independently
- **Impact**: Changing an NPC position on one side creates a mismatch; no single source of truth

### Bug 6: No Error Response Handling on Client
- **Protocol**: `ErrorResponse` type defined (`MessageProtocol.ts:64-67`)
- **Client**: `main.ts:272-408` only handles `agent_response` and `use_item_result` types
- **Impact**: Server errors (including ping errors) are silently ignored by the client

### Bug 7: Unvalidated Player State from Client
- **Server**: `handler.py:265-268` applies client-sent `hp`, `position`, `inventory` to server state via whitelist
- **No validation**: No type checking, range clamping, or integrity verification
- **Impact**: Client can set arbitrary HP (e.g., `hp: 999999`) or inject items

### Bug 8: WebSocket Reconnection Race Condition
- **Client**: `WebSocketClient.ts:49-56` — `this.ws.close()` is async but new WebSocket is created immediately
- **Impact**: On rapid reconnects, multiple WebSocket connections can be active simultaneously

### Bug 9: Effects Array Grows Without Proper Bounds
- **Client**: `ReactionSystem.ts:317-322` caps at 20 effects but only removes one at a time
- **Impact**: During rapid combat, many Three.js objects (sprites, geometries, materials) accumulate, causing GPU pressure

### Bug 10: NPC Interaction Possible After NPC Death
- **Client**: `ReactionSystem` removes dead NPCs from scene but `InteractionPanel` stays open
- **Impact**: Player can continue sending prompts to a dead NPC; server processes them (NPC HP is already 0)

---

## Code References

### Server - Networking
- `server/src/main.py:41` — ConnectionManager instantiation
- `server/src/main.py:49-59` — WebSocket endpoint (no broadcast)
- `server/src/ws/connection_manager.py:4-17` — ConnectionManager class (broadcast unused)
- `server/src/ws/handler.py:223-242` — Message router (missing ping handler)
- `server/src/ws/handler.py:245-361` — Interaction handler
- `server/src/ws/protocol.py:4-35` — Pydantic message models

### Server - State
- `server/src/world/world_state.py:34-44` — WorldState singleton
- `server/src/world/world_state.py:51` — `players: dict[str, PlayerData]`
- `server/src/world/world_state.py:77-80` — Lazy player creation
- `server/src/world/world_state.py:131-193` — Action application (thread-safe)
- `server/src/world/player_state.py:6-25` — PlayerData dataclass
- `server/src/agents/registry.py:147` — Thread ID: `f"{npc_id}_{player_id}"`

### Client - Networking
- `client/src/network/WebSocketClient.ts:23-26` — Connection setup
- `client/src/network/WebSocketClient.ts:92-98` — Heartbeat ping
- `client/src/network/MessageProtocol.ts:3-12` — PlayerInteraction (no playerId)
- `client/src/main.ts:249-259` — Interaction send (no playerId)
- `client/src/main.ts:174,203` — Hardcoded `playerId: 'default'`

### Client - State
- `client/src/state/PlayerState.ts:33-41` — Constructor (position=[0,0,0])
- `client/src/state/PlayerState.ts:52-65` — merge() from server
- `client/src/state/NPCState.ts` — NPC state registry (Map-based)
- `client/src/ui/LoginScreen.ts` — No identity mechanism

### Client - Systems
- `client/src/systems/ReactionSystem.ts:93-164` — Response handler
- `client/src/systems/WorldGenerator.ts:538-648` — NPC spawning + explore_area message
- `client/src/entities/EntityManager.ts:57-78` — Distance-based NPC culling

---

## Architecture Documentation

### Current Data Flow (Single-Player)
```
Client                          Server
──────                          ──────
LoginScreen → initGame()
  ↓
PlayerController (movement)     [position unknown to server]
  ↓
Click NPC → InteractionPanel
  ↓
ws.send({interaction})  ──────→ handler.py → _handle_interaction()
                                  ↓
                                WorldState.get_player("default")
                                  ↓
                                AgentRegistry.invoke(npc_id, "default", prompt)
                                  ↓
                                LangGraph Agent (reason → act → respond)
                                  ↓
                                WorldState.apply_actions(pending_actions)
                                  ↓
ws.onMessage ←──────────────── AgentResponse {dialogue, actions[], npcStateUpdate}
  ↓
ReactionSystem.handleResponse()
  ↓
PlayerState mutations + visual effects
```

### What Multiplayer Would Need
```
Client A                        Server                         Client B
────────                        ──────                         ────────
Login(username) ──────────────→ Assign player_id               Login(username)
                                Map ws ↔ player_id             ←──────────────

Move ─────────────────────────→ Update position
                                broadcast(player_positions) ──→ Render Player A

Interact(npc, prompt) ────────→ Route to NPC agent
                                Apply actions
                                Send response to A
                                broadcast(npc_state) ─────────→ Update NPC HP

                                                               Interact(npc, prompt)
                                ←───────────────────────────────
                                Route to same NPC
                                Apply actions
broadcast(npc_state) ←────────  Send response to B
Update NPC HP
```

### Key Components That Need Changes for Multiplayer

1. **ConnectionManager**: Add `player_id ↔ WebSocket` mapping; replace anonymous `list[WebSocket]` with `dict[str, WebSocket]`
2. **LoginScreen**: Add username input; generate or assign unique `player_id`
3. **MessageProtocol**: Add `playerId` to `PlayerInteraction` and `PlayerMove`
4. **main.ts**: Send `playerId` in all messages; send `player_move` periodically
5. **WebSocket endpoint**: After login, broadcast world state diffs to all connected clients
6. **Client entities**: Add "RemotePlayer" entity type rendered from server broadcasts
7. **WorldState**: Already supports multiple players; needs broadcast triggers on mutation

---

## Open Questions

1. **Authentication model**: Should multiplayer use simple username-based identity, session tokens, or OAuth? The server has no auth middleware currently.
2. **State broadcast frequency**: How often should player positions be broadcast? Every frame (60 Hz) is expensive; every 100ms is common in MMOs.
3. **Area of interest**: Should all players receive all state updates, or only those within a certain range? The `get_context_for_npc()` already does 50-unit radius filtering.
4. **NPC agent concurrency**: What happens when two players interact with the same NPC simultaneously? The current `MemorySaver` uses `thread_id = f"{npc_id}_{player_id}"` so each player gets separate conversation state, but NPC HP mutations are shared.
5. **Dynamic NPC ownership**: When Player A explores a chunk and generates NPCs, should Player B see the same NPCs? Currently `explore_area` deduplicates by ID, so the second client's request is silently handled.
6. **Authoritative movement**: Should the server validate player positions, or remain client-authoritative? Client-authoritative is simpler but allows teleportation exploits.
