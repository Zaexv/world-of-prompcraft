---
date: "2026-03-19T10:07:55.191519+00:00"
git_commit: d509c9a3642e1c7a0c32c212bf49d79cb16d406f
branch: main
topic: "Multiplayer System with Chat, Character Creation, and Race Models"
tags: [plan, multiplayer, chat, character-creation, websocket, networking, ui]
status: approved
---

# Multiplayer System with Chat, Character Creation, and Race Models

## Overview

Transform the single-player World of Promptcraft into a real-time multiplayer game with:
- Character creation screen (faction + race selection + unique username)
- 4 playable races (Alliance: Human, Night Elf; Horde: Orc, Undead)
- Real-time player position broadcasting and remote player rendering
- Proximity-based chat with floating speech bubbles above heads
- NPC dialogue visible to nearby players
- NPCs aware of all server-wide chat (can react to conversations happening anywhere)

## Current State Analysis

### What Exists
- **Single `/ws` endpoint** accepting anonymous connections (`main.py:49-59`)
- **ConnectionManager** with unused `broadcast()` method (`connection_manager.py:4-17`)
- **WorldState.players** dict keyed by `player_id` — supports N players already (`world_state.py:51`)
- **Agent memory** already uses `f"{npc_id}_{player_id}"` thread IDs — separate conversations per player (`registry.py:147`)
- **LoginScreen** is purely visual with no identity input (`LoginScreen.ts`)
- **Player model** is a Night Elf mesh (`Player.ts:26-113`)
- **InteractionPanel** has per-NPC chat history with player/NPC message bubbles (`InteractionPanel.ts:292-320`)
- **ReactionSystem.createFloatingText()** creates sprite-based floating text above positions (`ReactionSystem.ts:325-377`)

### Key Discoveries
- `playerId` is hardcoded to `"default"` in `main.ts:174,203` and missing entirely from interaction messages (`main.ts:249`)
- Server returns error for every 30s ping — no `"ping"` handler in `handler.py:242`
- `PlayerState.position` is always `[0,0,0]` — never synced from `PlayerController` (`PlayerState.ts:40`)
- `player_move` message type defined but never sent (`MessageProtocol.ts:14-17`)
- NPC definitions duplicated in client (`main.ts:56-63`) and server (`npc_definitions.py`)

## Desired End State

Players open the game and see a character creation screen where they pick Alliance or Horde, then one of two races per faction, then type a unique username. On entering the world, they see other players moving in real time (with race-appropriate models and floating nameplates). A chat panel in the bottom-left lets players type messages visible to others within ~100 units. Chat messages appear as floating speech bubbles above the sender's head. When a player talks to an NPC, the NPC's dialogue appears in nearby players' chat and as a bubble above the NPC. NPCs on the server are aware of all chat messages server-wide.

### UI Mockups

#### Character Creation Screen (replaces current LoginScreen button area)
```
+------------------------------------------------------------------+
|                                                                    |
|                    WORLD OF PROMPTCRAFT                            |
|                    Powered by LangGraph                            |
|                                                                    |
|         [  ALLIANCE  ]          [   HORDE   ]                      |
|          (selected)                                                |
|                                                                    |
|     +------------+    +------------+                               |
|     |            |    |            |                                |
|     |   HUMAN    |    | NIGHT ELF  |                               |
|     |  (model)   |    |  (model)   |                               |
|     |            |    |            |                                |
|     +--selected--+    +------------+                               |
|                                                                    |
|              Username: [_______________]                            |
|                                                                    |
|                    [ Enter World ]                                  |
|              "Username already taken" (error, if any)              |
|                                                                    |
+------------------------------------------------------------------+
```

#### Chat Panel (bottom-left, always visible in-game)
```
+-------------------------------+
| [World] [Say]                 |  <- tab buttons (Say = proximity)
|-------------------------------|
| [Arthas]: Anyone near the     |
|   dragon?                     |
| [Thornby the Merchant]: Come  |
|   browse my wares!            |
| [You]: heading there now      |
|-------------------------------|
| [Type a message... ] [Send]   |
+-------------------------------+
```

#### Chat Bubble (above player/NPC head)
```
        +-------------------+
        | heading there now |
        +--------+----------+
                 V
            [Player Model]
```
Bubble is a rounded-rect canvas sprite, fades after 5 seconds, max ~60 chars truncated with "...".

## What We're NOT Doing

- Player-vs-player combat (only player-vs-NPC)
- Persistent accounts or passwords (username is session-only)
- Server-authoritative movement validation (stays client-authoritative)
- Voice chat or emote system
- Party/group system
- Inventory trading between players
- Different starting zones per faction (all players spawn at origin)

## Cross-Plan Dependencies (Thursday Plan)

This plan **MUST execute before** the Thursday plan (`thursday_plan.md` — Dungeon System, Quest System, Zone Display & El Tito Quest Line). The multiplayer plan changes fundamental architecture that the Thursday plan's agents must build on top of.

### Execution Order

```
Multiplayer Plan (this plan)          Thursday Plan
═══════════════════════════           ══════════════════════
Phase 1: Bug Fixes ───────────────┐
Phase 2: Character Creation       │
Phase 3: Race Models              │  ← Thursday agents MUST wait
Phase 4: Position Broadcasting    │    for ALL 6 phases to complete
Phase 5: Chat System              │    before starting Wave 1
Phase 6: NPC Dialogue Broadcasting│
══════════════════════════════════─┘
                                      Wave 1: Agent 1, 6, 8
                                      Wave 2: Agent 2, 3, 9
                                      Wave 3: Agent 4, 5, 7
                                      Wave 4: Agent 10
```

### Breaking Changes Thursday Agents Must Adapt To

#### 1. `handler.py` — Signature change (affects Thursday Agent 7)
This plan changes:
```python
# OLD (current):
async def handle_message(data: dict) -> dict:

# NEW (after this plan):
async def handle_message(data: dict, websocket: WebSocket, manager: ConnectionManager) -> dict | None:
```
**Thursday Agent 7** must use the new signature when adding `dungeon_enter`, `dungeon_exit`, `quest_update` handlers. Handlers that don't need broadcast can ignore `websocket`/`manager` and return a `dict`. Handlers that are fire-and-forget return `None`.

#### 2. `main.ts` — Player identity (affects Thursday Agent 10)
This plan replaces hardcoded `'default'` with `localPlayerId` (module-level variable set during join). **Thursday Agent 10** must use `localPlayerId` in all `ws.send()` calls for dungeon/quest messages:
```typescript
// Thursday agents must use:
ws.send({ type: 'dungeon_enter', dungeonId, playerId: localPlayerId });
// NOT:
ws.send({ type: 'dungeon_enter', dungeonId, playerId: 'default' });
```

#### 3. `player_state.py` — Additional fields (affects Thursday Agent 2)
This plan adds `username`, `race`, `faction`, `yaw`, and `to_public_dict()` to `PlayerData`. **Thursday Agent 2** adds `active_quests`, `completed_quests`, `kill_count`. These are additive — no logical conflict, but `to_dict()` must include ALL fields from both plans.

#### 4. `PlayerState.ts` — Additional fields (affects Thursday Agent 3)
This plan adds `playerId`, `race`, `faction`. **Thursday Agent 3** adds `activeQuests`, `completedQuests`, quest methods. Additive, no conflict.

#### 5. `UIManager.ts` — Additional panels (affects Thursday Agent 10)
This plan adds `chatPanel`. **Thursday Agent 10** adds `questLog`, `questTracker`, `zoneDisplay`. Additive.

#### 6. `npc_agent.py` — System prompt additions (affects Thursday Agent 9)
This plan appends recent chat history to the NPC system prompt. **Thursday Agent 9** adds quest tools. Both modify different parts of the prompt/tool setup — no conflict, but both must be present in the final code.

### Design Decision: Dungeons + Multiplayer
The Thursday plan states "No instanced multiplayer dungeons — single-player zones." With multiplayer enabled, when a player enters a dungeon they should be **hidden from world_update broadcasts** (as if they left the world temporarily). On dungeon exit, they reappear. This avoids the need for instanced multiplayer dungeons while keeping both plans compatible.

### Shared File Conflict Matrix

| File | Multiplayer Phases | Thursday Agents | Conflict |
|------|-------------------|-----------------|----------|
| `server/src/ws/handler.py` | 1, 2, 4, 5, 6 | Agent 7 | **HIGH** — signature change |
| `client/src/main.ts` | 1, 2, 4, 5, 6 | Agent 10 | **HIGH** — merge order |
| `server/src/world/player_state.py` | 2 | Agent 2 | LOW — additive fields |
| `client/src/state/PlayerState.ts` | 1, 2 | Agent 3 | LOW — additive fields |
| `client/src/ui/UIManager.ts` | 5 | Agent 10 | LOW — additive panels |
| `server/src/agents/npc_agent.py` | 6 | Agent 9 | LOW — different areas |

---

## Implementation Approach

Incremental phases: fix bugs first, then add identity, then models, then broadcasting, then chat. Each phase produces a testable state. The server remains authoritative for player identity and NPC state; client is authoritative for movement (unchanged).

**This plan must complete ALL 6 phases before the Thursday plan begins.** The Thursday plan's agents depend on the new handler signature, player identity system, and `main.ts` architecture established here.

## Architecture and Code Reuse

### Reusable Patterns
- `ReactionSystem.createFloatingText()` — adapt for chat bubbles (wider canvas, longer duration, speech-bubble bg)
- `Player.ts` mesh construction — extract into race-specific builder functions
- `InteractionPanel.ts` message rendering (`addMessage`) — reuse styling for ChatPanel
- `ConnectionManager.broadcast()` — already exists, needs player_id mapping
- `NPC.ts` nameplate (`Nameplate` class) — reuse for remote player nameplates
- `EntityManager` add/remove/update pattern — extend for remote players

### Third-Party Libraries
- No new dependencies needed. All rendering uses Three.js (already installed). All networking uses native WebSocket (already in use).

### Architecture Diagram
```
Client                              Server
──────                              ──────
CharacterCreation
  │ join {username, race, faction}
  ├──────────────────────────────→  ConnectionManager.connect(ws, player_id)
  │                                 WorldState.add_player(id, race, faction)
  │  join_ok {playerId, players[]}
  ←──────────────────────────────┤  broadcast(player_joined, to=all)
  │
  │ player_move {pos, yaw}
  ├──────────────────────────────→  WorldState.update_player(pos)
  │                                 broadcast(world_update{players[]}, to=nearby, 10Hz)
  │  world_update {players[]}
  ←──────────────────────────────┤
  │
  │ chat_message {text}
  ├──────────────────────────────→  broadcast(chat, to=within 100 units)
  │                                 feed to NPC agent context (server-wide)
  │  chat_broadcast {sender,text}
  ←──────────────────────────────┤
  │
  │ interaction {npcId, prompt}
  ├──────────────────────────────→  AgentRegistry.invoke()
  │  agent_response {dialogue}      broadcast(npc_dialogue, to=nearby)
  ←──────────────────────────────┤
```

### File Tree (affected files with comments)
```
client/src/
  main.ts                    # Wire playerId everywhere, add chat, add move sender, request NPC list from server
  network/
    WebSocketClient.ts       # Add playerId field, onConnect callback with join message
    MessageProtocol.ts       # Add join, chat_message, world_update, player_joined/left types
  ui/
    LoginScreen.ts           # Replace with character creation (faction, race, username)
    ChatPanel.ts             # NEW: proximity chat panel UI
    UIManager.ts             # Add ChatPanel, wire show/hide
    InteractionPanel.ts      # Feed NPC dialogue into ChatPanel
  entities/
    Player.ts                # Extract into RaceModels.ts, keep as local player wrapper
    RaceModels.ts            # NEW: buildHuman(), buildNightElf(), buildOrc(), buildUndead()
    RemotePlayer.ts          # NEW: remote player entity with nameplate + race model
    EntityManager.ts         # Add remote player tracking (addRemotePlayer, removeRemotePlayer, updateRemotePlayers)
    ChatBubble.ts            # NEW: speech bubble sprite above heads
  state/
    PlayerState.ts           # Add playerId, race, faction fields

server/src/
  main.py                    # Pass manager to handler, handle join/disconnect lifecycle
  ws/
    connection_manager.py    # Player-WebSocket mapping, broadcast_nearby(), broadcast_except()
    handler.py               # Add join, ping, chat_message handlers; broadcast NPC dialogue
    protocol.py              # Add JoinRequest, ChatMessage, WorldUpdate models
  world/
    player_state.py          # Add username, race, faction, yaw fields
    world_state.py           # Add player lifecycle (add/remove), get_nearby_players()
```

---

## Phase 1: Bug Fixes & Foundation

### Overview
Fix the blocking bugs that would interfere with multiplayer: add ping handler, add `playerId` to all messages, sync `PlayerState.position` from `PlayerController`.

### Changes Required:

#### [ ] 1.1 Add ping handler to server
**File**: `server/src/ws/handler.py`
**Changes**: Add `"ping"` case in `handle_message()` before the error fallback (around line 242)

```python
if msg_type == "ping":
    return {"type": "pong"}
```

#### [ ] 1.2 Add `playerId` to `PlayerInteraction` protocol (client)
**File**: `client/src/network/MessageProtocol.ts`
**Changes**: Add `playerId: string` to `PlayerInteraction` and `PlayerMove` interfaces

```typescript
export interface PlayerInteraction {
  type: "interaction";
  npcId: string;
  prompt: string;
  playerId: string;  // NEW
  playerState: {
    position: [number, number, number];
    hp: number;
    inventory: string[];
  };
}

export interface PlayerMove {
  type: "player_move";
  playerId: string;  // NEW
  position: [number, number, number];
}
```

#### [ ] 1.3 Send `playerId` in all client messages
**File**: `client/src/main.ts`
**Changes**:
- Add a module-level `let localPlayerId = 'default';` that will be set during join (Phase 2)
- Include `playerId: localPlayerId` in all `ws.send()` calls (lines 172-177, 201-208, 249-259)

#### [ ] 1.4 Sync `PlayerState.position` from `PlayerController`
**File**: `client/src/main.ts`
**Changes**: In the `animate()` loop (around line 426), after `playerController.update(delta)`, sync position:

```typescript
playerState.position = [
  playerController.position.x,
  playerController.position.y,
  playerController.position.z,
];
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd client && npx tsc --noEmit` passes
- [ ] `cd client && npm run lint` passes
- [ ] `cd server && ruff check src tests` passes
- [ ] `cd client && npm test` passes
- [ ] `cd server && pytest` passes

---

## Phase 2: Character Creation & Player Identity

### Overview
Replace the LoginScreen's "Enter World" button with a character creation flow (faction → race → username). Server validates username uniqueness and assigns identity. `ConnectionManager` maps `player_id ↔ WebSocket`.

### Changes Required:

#### [ ] 2.1 Add server-side player fields
**File**: `server/src/world/player_state.py`
**Changes**: Add `username`, `race`, `faction`, `yaw` fields to `PlayerData`

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
    username: str = ""      # NEW
    race: str = "human"     # NEW: human, night_elf, orc, undead
    faction: str = "alliance"  # NEW: alliance, horde
    yaw: float = 0.0        # NEW: facing direction in radians

    def to_dict(self) -> dict:
        return {
            "hp": self.hp, "maxHp": self.max_hp,
            "mana": self.mana, "maxMana": self.max_mana,
            "level": self.level, "inventory": list(self.inventory),
            "position": list(self.position),
            "username": self.username, "race": self.race,
            "faction": self.faction, "yaw": self.yaw,
        }

    def to_public_dict(self) -> dict:
        """Minimal data broadcast to other players (no inventory/mana)."""
        return {
            "playerId": self.username,
            "username": self.username,
            "position": list(self.position),
            "race": self.race,
            "faction": self.faction,
            "hp": self.hp, "maxHp": self.max_hp,
            "yaw": self.yaw,
        }
```

#### [ ] 2.2 Upgrade `ConnectionManager` with player mapping
**File**: `server/src/ws/connection_manager.py`
**Changes**: Replace `list[WebSocket]` with `dict[str, WebSocket]` + utility methods

```python
from __future__ import annotations
import logging
from typing import TYPE_CHECKING
from fastapi import WebSocket

if TYPE_CHECKING:
    from ..world.world_state import WorldState

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: dict[str, WebSocket] = {}  # player_id -> ws
        self._ws_to_player: dict[int, str] = {}  # id(ws) -> player_id

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()

    def register(self, websocket: WebSocket, player_id: str) -> None:
        self.active_connections[player_id] = websocket
        self._ws_to_player[id(websocket)] = player_id

    def disconnect(self, websocket: WebSocket) -> str | None:
        player_id = self._ws_to_player.pop(id(websocket), None)
        if player_id:
            self.active_connections.pop(player_id, None)
        return player_id

    def get_player_id(self, websocket: WebSocket) -> str | None:
        return self._ws_to_player.get(id(websocket))

    def is_username_taken(self, username: str) -> bool:
        return username in self.active_connections

    async def send_to(self, player_id: str, data: dict) -> None:
        ws = self.active_connections.get(player_id)
        if ws:
            await ws.send_json(data)

    async def broadcast(self, data: dict, exclude: str | None = None) -> None:
        for pid, ws in self.active_connections.items():
            if pid != exclude:
                await ws.send_json(data)

    async def broadcast_nearby(
        self, data: dict, origin: list[float], radius: float,
        world_state: WorldState, exclude: str | None = None,
    ) -> None:
        for pid, ws in self.active_connections.items():
            if pid == exclude:
                continue
            player = world_state.players.get(pid)
            if player and _distance(player.position, origin) <= radius:
                await ws.send_json(data)

def _distance(a: list[float], b: list[float]) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5
```

#### [ ] 2.3 Add `join` handler and update WebSocket lifecycle
**File**: `server/src/main.py`
**Changes**: Pass `manager` into `init_handler()`, update WebSocket endpoint to handle join/disconnect lifecycle

```python
init_handler(registry, world_state, manager)  # add manager param

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await manager.connect(websocket)
    try:
        while True:
            data: dict[str, Any] = await websocket.receive_json()
            response = await handle_message(data, websocket, manager)
            if response is not None:
                await websocket.send_json(response)
    except WebSocketDisconnect:
        player_id = manager.disconnect(websocket)
        if player_id and _world_state:
            # Remove from world state and notify others
            _world_state.players.pop(player_id, None)
            await manager.broadcast(
                {"type": "player_left", "playerId": player_id}
            )
```

**File**: `server/src/ws/handler.py`
**Changes**: Add `_manager` reference, update `init_handler` signature, add `_handle_join()`:

```python
_manager: ConnectionManager | None = None

def init_handler(registry, world_state, manager) -> None:
    global _registry, _world_state, _manager
    _registry = registry
    _world_state = world_state
    _manager = manager

async def handle_message(data: dict, websocket: WebSocket, manager: ConnectionManager) -> dict | None:
    msg_type = data.get("type")

    if msg_type == "join":
        return await _handle_join(data, websocket, manager)
    if msg_type == "ping":
        return {"type": "pong"}
    # ... existing handlers unchanged ...

async def _handle_join(data: dict, websocket: WebSocket, manager: ConnectionManager) -> dict:
    username = data.get("username", "").strip()
    race = data.get("race", "human")
    faction = data.get("faction", "alliance")

    if not username or len(username) > 20:
        return {"type": "join_error", "message": "Username must be 1-20 characters"}
    if manager.is_username_taken(username):
        return {"type": "join_error", "message": "Username already taken"}
    if race not in ("human", "night_elf", "orc", "undead"):
        return {"type": "join_error", "message": "Invalid race"}
    if faction not in ("alliance", "horde"):
        return {"type": "join_error", "message": "Invalid faction"}

    manager.register(websocket, username)
    player = _world_state.get_player(username)
    player.username = username
    player.race = race
    player.faction = faction

    # Send current players + NPCs to the joining player
    other_players = [
        p.to_public_dict()
        for pid, p in _world_state.players.items()
        if pid != username
    ]
    npc_list = [
        {**npc.to_dict(), "personality_key": npc.npc_id}
        for npc in _world_state.npcs.values()
    ]

    # Notify existing players
    await manager.broadcast(
        {"type": "player_joined", "player": player.to_public_dict()},
        exclude=username,
    )

    return {
        "type": "join_ok",
        "playerId": username,
        "players": other_players,
        "npcs": npc_list,
    }
```

#### [ ] 2.4 Character creation UI on client
**File**: `client/src/ui/LoginScreen.ts`
**Changes**: Add faction buttons, race cards, and username input between title and "Enter World" button. The existing portal animation stays. Add new properties and methods:

- `selectedFaction: 'alliance' | 'horde'` — default `'alliance'`
- `selectedRace: string` — default `'human'`
- `usernameInput: HTMLInputElement` — text field
- `errorText: HTMLDivElement` — shows "Username already taken"
- `onEnterWorld` callback signature changes to `(username: string, race: string, faction: string) => void`
- Faction toggle buttons styled like WoW tabs (gold highlight for selected)
- Race cards are 2 clickable boxes per faction showing race name + colored icon
- "Enter World" button disabled until username is 1+ chars
- On click, fires `onEnterWorld(username, race, faction)`

Race card colors:
- Human: warm tan/brown (#c4a882)
- Night Elf: purple/silver (#8866cc)
- Orc: green (#44aa44)
- Undead: pale gray/teal (#88aaaa)

#### [ ] 2.5 Client join flow
**File**: `client/src/main.ts`
**Changes**:
- `loginScreen.onEnterWorld` now receives `(username, race, faction)`
- After `initGame()`, send `join` message via WebSocket
- Handle `join_ok` response: set `localPlayerId`, store player list, spawn NPCs from server list
- Handle `join_error`: show error on LoginScreen (don't hide it)
- Handle `player_joined`/`player_left` messages

```typescript
loginScreen.onEnterWorld = (username: string, race: string, faction: string) => {
  initGame(username, race, faction);
};

function initGame(username: string, race: string, faction: string) {
  // ... existing setup ...

  ws.onConnectionChange = (connected) => {
    if (connected) {
      ws.send({ type: 'join', username, race, faction });
    }
  };

  ws.onMessage = (data) => {
    if (data.type === 'join_ok') {
      loginScreen.hide();
      localPlayerId = data.playerId;
      // Spawn existing remote players from data.players
      // NPCs from data.npcs (replace hardcoded NPC_CONFIGS)
    }
    if (data.type === 'join_error') {
      loginScreen.showError(data.message);
      return;
    }
    // ... rest of message handling ...
  };
}
```

#### [ ] 2.6 Add client-side state fields
**File**: `client/src/state/PlayerState.ts`
**Changes**: Add `playerId`, `race`, `faction` fields

```typescript
playerId: string = '';
race: string = 'human';
faction: string = 'alliance';
```

#### [ ] 2.7 Add new message types to client protocol
**File**: `client/src/network/MessageProtocol.ts`
**Changes**: Add interfaces for join, player_joined, player_left, world_update

```typescript
export interface JoinRequest {
  type: "join";
  username: string;
  race: string;
  faction: string;
}

export interface JoinOk {
  type: "join_ok";
  playerId: string;
  players: RemotePlayerData[];
  npcs: NPCInitData[];
}

export interface JoinError {
  type: "join_error";
  message: string;
}

export interface RemotePlayerData {
  playerId: string;
  username: string;
  position: [number, number, number];
  race: string;
  faction: string;
  hp: number;
  maxHp: number;
  yaw: number;
}

export interface PlayerJoined {
  type: "player_joined";
  player: RemotePlayerData;
}

export interface PlayerLeft {
  type: "player_left";
  playerId: string;
}

export interface WorldUpdate {
  type: "world_update";
  players: RemotePlayerData[];
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd client && npx tsc --noEmit` passes
- [ ] `cd client && npm run lint` passes
- [ ] `cd server && ruff check src tests` passes
- [ ] `cd server && pytest` passes

#### Manual Verification:
- [ ] Character creation screen shows faction toggle, race cards, and username input
- [ ] Clicking "Enter World" with a valid username connects and enters the game
- [ ] Entering a duplicate username shows an error message without entering the game
- [ ] Server logs show player join with correct username, race, and faction

> **Thursday Plan Gate**: After this phase completes, the `handler.py` signature is finalized as `handle_message(data, websocket, manager) -> dict | None`. Thursday Agent 7 must use this signature. The `localPlayerId` variable in `main.ts` is established — Thursday Agent 10 must use it.

---

## Phase 3: Race Models

### Overview
Create 4 distinct player mesh builders (Human, Night Elf, Orc, Undead) as functions in a new `RaceModels.ts`. Extract the current `Player.ts` Night Elf mesh into `buildNightElf()`, then create 3 more race builders with unique proportions, colors, and accessories. Update `Player.ts` to accept a `race` parameter.

### Changes Required:

#### [ ] 3.1 Create race model builders
**File**: `client/src/entities/RaceModels.ts` (NEW)
**Changes**: Export 4 functions that each return a `THREE.Group` with the race's mesh

Each race builder follows the same pattern as current `Player.ts` (body, head, legs, arms) but with race-specific traits:

```typescript
export function buildHumanModel(): THREE.Group { ... }
export function buildNightElfModel(): THREE.Group { ... }  // extract from current Player.ts
export function buildOrcModel(): THREE.Group { ... }
export function buildUndeadModel(): THREE.Group { ... }
export function buildRaceModel(race: string): THREE.Group { ... }  // dispatcher
```

**Human** (Alliance):
- Body: tan/brown armor (#8B7355), stocky proportions
- Head: light skin tone, no pointed ears
- Hair: short brown box on head
- Cape: blue Alliance tabard (#2244aa)
- Pauldrons: small shoulder pads

**Night Elf** (Alliance — current model):
- Extract existing mesh from `Player.ts` lines 26-113
- Keep: indigo body, pointed ears, silver hair, purple cloak

**Orc** (Horde):
- Body: green skin (#2d5a1e), wider/bulkier proportions (1.2x body width)
- Head: larger, green, pronounced jaw (box below head)
- Hair: black top-knot (thin tall cone)
- Shoulders: large spiked pauldrons (cones on shoulders)
- Loincloth: red Horde tabard (#aa2222)

**Undead** (Horde):
- Body: pale gray-green (#7a8a7a), gaunt/thin proportions (0.8x width)
- Head: skull-like (slightly smaller, exposed jaw bone box)
- Glowing eyes: small emissive spheres (#44ffaa)
- Tattered cloak: dark gray, with transparency
- Bones: small white cylinders at elbows/knees

#### [ ] 3.2 Update Player.ts to accept race
**File**: `client/src/entities/Player.ts`
**Changes**:
- Constructor accepts `race: string` parameter
- Replace hardcoded mesh construction with `buildRaceModel(race)`
- Keep animation logic (walk/swim cycles work on any humanoid mesh as long as part names match)
- Each race builder must use consistent part names: `body`, `head`, `leftLeg`, `rightLeg`, `leftArm`, `rightArm`, `cloak`

```typescript
export class Player {
  group: THREE.Group;
  private body: THREE.Mesh;
  private head: THREE.Mesh;
  private leftLeg: THREE.Mesh;
  private rightLeg: THREE.Mesh;
  private leftArm: THREE.Mesh;
  private rightArm: THREE.Mesh;
  private cloak: THREE.Mesh;
  // ... animation state unchanged ...

  constructor(race: string = 'night_elf') {
    this.group = buildRaceModel(race);
    // Look up parts by name for animation
    this.body = this.group.getObjectByName('body') as THREE.Mesh;
    this.head = this.group.getObjectByName('head') as THREE.Mesh;
    // ... etc for all parts ...
  }
  // update() method unchanged — animates named parts
}
```

#### [ ] 3.3 Wire race into game init
**File**: `client/src/main.ts`
**Changes**: Pass `race` to `Player` constructor

```typescript
const player = new Player(race);  // was: new Player()
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd client && npx tsc --noEmit` passes
- [ ] `cd client && npm run lint` passes
- [ ] `cd client && npm test` passes

#### Manual Verification:
- [ ] Selecting each race on character creation shows the correct model in-game
- [ ] Walk/swim animations work for all 4 races
- [ ] Each race is visually distinct (different colors, proportions, accessories)

---

## Phase 4: Position Broadcasting & Remote Players

### Overview
Client sends `player_move` at ~10Hz. Server broadcasts a `world_update` with all nearby player positions. Client renders remote players with race-appropriate models and floating nameplates.

### Changes Required:

#### [ ] 4.1 Client sends `player_move` at 10Hz
**File**: `client/src/main.ts`
**Changes**: In `animate()` loop, every ~100ms send position + yaw

```typescript
let moveSendTimer = 0;
const MOVE_SEND_INTERVAL = 0.1; // 10Hz

// Inside animate():
moveSendTimer += delta;
if (moveSendTimer >= MOVE_SEND_INTERVAL) {
  moveSendTimer = 0;
  ws.send({
    type: 'player_move',
    playerId: localPlayerId,
    position: [playerController.position.x, playerController.position.y, playerController.position.z],
    yaw: playerController.yaw,
  });
}
```

#### [ ] 4.2 Server broadcasts `world_update`
**File**: `server/src/ws/handler.py`
**Changes**: Update `_handle_player_move()` to broadcast positions to nearby players

```python
async def _handle_player_move(data: dict) -> dict | None:
    player_id = data.get("playerId", data.get("player_id", ""))
    position = data.get("position", [0.0, 0.0, 0.0])
    yaw = data.get("yaw", 0.0)

    if _world_state is not None and player_id:
        player = _world_state.get_player(player_id)
        player.position = position
        player.yaw = yaw

        # Broadcast world_update to nearby players
        nearby_players = _world_state.get_nearby_players(position, radius=200.0)
        update = {
            "type": "world_update",
            "players": [
                p.to_public_dict()
                for pid, p in nearby_players.items()
                if pid != player_id
            ],
        }
        if _manager:
            await _manager.broadcast_nearby(
                update, position, 200.0, _world_state, exclude=player_id,
            )

    return None  # No direct response needed for moves
```

**File**: `server/src/world/world_state.py`
**Changes**: Add `get_nearby_players()` method

```python
def get_nearby_players(self, position: list[float], radius: float) -> dict[str, PlayerData]:
    nearby: dict[str, PlayerData] = {}
    for pid, player in self.players.items():
        dist = sum((a - b) ** 2 for a, b in zip(position, player.position)) ** 0.5
        if dist <= radius:
            nearby[pid] = player
    return nearby
```

#### [ ] 4.3 Create `RemotePlayer` entity
**File**: `client/src/entities/RemotePlayer.ts` (NEW)
**Changes**: Entity that renders another player's model + nameplate, with position interpolation

```typescript
export class RemotePlayer {
  readonly playerId: string;
  readonly username: string;
  readonly race: string;
  readonly faction: string;
  readonly group: THREE.Group;
  private nameplate: Nameplate;
  private targetPosition: THREE.Vector3;
  private targetYaw: number;

  constructor(data: RemotePlayerData) { ... }

  /** Smooth lerp toward latest server position. */
  update(delta: number): void { ... }

  /** Set new target from server broadcast. */
  setTarget(position: [number, number, number], yaw: number): void { ... }

  dispose(): void { ... }
}
```

Uses `buildRaceModel(race)` from `RaceModels.ts` for the mesh.
Uses the existing `Nameplate` class pattern (canvas texture above head) showing `username` and a faction-colored name (blue for Alliance, red for Horde).

#### [ ] 4.4 Extend `EntityManager` for remote players
**File**: `client/src/entities/EntityManager.ts`
**Changes**: Add `remotePlayers: Map<string, RemotePlayer>`, with add/remove/update methods

```typescript
private remotePlayers = new Map<string, RemotePlayer>();

addRemotePlayer(data: RemotePlayerData): void { ... }
removeRemotePlayer(playerId: string): void { ... }
getRemotePlayer(playerId: string): RemotePlayer | undefined { ... }

/** Called with world_update data — update existing, add new, remove stale. */
updateRemotePlayers(players: RemotePlayerData[]): void { ... }

// In existing update() method, also call remotePlayer.update(delta) for each
```

#### [ ] 4.5 Handle `world_update`, `player_joined`, `player_left` in client
**File**: `client/src/main.ts`
**Changes**: Add handlers in `ws.onMessage`

```typescript
if (data.type === 'world_update') {
  entityManager.updateRemotePlayers(data.players);
}
if (data.type === 'player_joined') {
  entityManager.addRemotePlayer(data.player);
}
if (data.type === 'player_left') {
  entityManager.removeRemotePlayer(data.playerId);
}
```

#### [ ] 4.6 Add `PlayerMove` yaw field to protocol
**File**: `client/src/network/MessageProtocol.ts`
**Changes**: Add `yaw: number` to `PlayerMove` interface

### Success Criteria:

#### Automated Verification:
- [ ] `cd client && npx tsc --noEmit` passes
- [ ] `cd client && npm run lint` passes
- [ ] `cd server && ruff check src tests` passes
- [ ] `cd server && pytest` passes

#### Manual Verification:
- [ ] Open two browser tabs, log in with different usernames
- [ ] Moving in one tab shows the player moving in the other tab (with smooth interpolation)
- [ ] Remote player has the correct race model and floating username
- [ ] Closing one tab removes that player from the other tab's view
- [ ] Players far apart (>200 units) don't see each other

---

## Phase 5: Chat System with Bubbles

### Overview
Add a ChatPanel UI (bottom-left), `chat_message` WebSocket type, server broadcasts to players within ~100 units, and speech bubbles appear above the sender's head.

### Changes Required:

#### [ ] 5.1 Create `ChatBubble` class
**File**: `client/src/entities/ChatBubble.ts` (NEW)
**Changes**: Canvas-based speech bubble sprite that attaches above an entity

```typescript
export class ChatBubble {
  private sprite: THREE.Sprite;
  private lifetime: number = 5;
  private elapsed: number = 0;

  constructor(scene: THREE.Scene, text: string, position: THREE.Vector3) {
    // Create canvas with rounded-rect background, word-wrapped text
    // Max ~60 chars, truncate with "..."
    // Background: rgba(0, 0, 0, 0.7), border-radius, white text
    // Sprite positioned above entity head (y + 3.5)
  }

  /** Returns false when expired. */
  update(dt: number): boolean {
    this.elapsed += dt;
    // Fade out in last 1s
    if (this.elapsed > this.lifetime - 1) {
      this.sprite.material.opacity = (this.lifetime - this.elapsed);
    }
    if (this.elapsed >= this.lifetime) {
      this.dispose();
      return false;
    }
    return true;
  }

  dispose(): void { /* remove from scene, dispose texture/material */ }
}
```

#### [ ] 5.2 Create `ChatPanel` UI
**File**: `client/src/ui/ChatPanel.ts` (NEW)
**Changes**: Bottom-left scrollable chat panel with input field

```typescript
export class ChatPanel {
  readonly element: HTMLDivElement;
  private messages: HTMLDivElement;
  private input: HTMLInputElement;

  /** Fired when user sends a chat message. */
  onSendMessage: ((text: string) => void) | null = null;

  constructor() {
    // Dark panel, 320px wide, 200px tall, bottom-left
    // Cinzel font, gold border (#c5a55a), dark bg (rgba(10,8,4,0.85))
    // Scrollable message area
    // Input field at bottom with Enter to send
    // Messages styled: [Username]: text
    // Different colors: player=white, NPC=#c5a55a, system=#888888
  }

  addMessage(sender: string, text: string, color?: string): void { ... }
  addSystemMessage(text: string): void { ... }  // gray, for join/leave
  show(): void { ... }
  hide(): void { ... }
}
```

Style rules:
- Player messages: `[Username]: text` in white
- NPC messages: `[NPC Name]: text` in gold (#c5a55a)
- System messages: italic gray (#888888) — "PlayerX has joined", "PlayerX has left"
- Own messages: slightly brighter or bold name
- Auto-scroll to bottom unless user has scrolled up

#### [ ] 5.3 Add `ChatPanel` to `UIManager`
**File**: `client/src/ui/UIManager.ts`
**Changes**: Instantiate `ChatPanel`, add to overlay, expose via property

```typescript
readonly chatPanel: ChatPanel;

// In constructor:
this.chatPanel = new ChatPanel();
this.overlay.appendChild(this.chatPanel.element);
```

#### [ ] 5.4 Add `chat_message` server handler
**File**: `server/src/ws/handler.py`
**Changes**: Add handler that broadcasts to nearby players

```python
if msg_type == "chat_message":
    return await _handle_chat_message(data, websocket, manager)

async def _handle_chat_message(data: dict, websocket: WebSocket, manager: ConnectionManager) -> dict | None:
    player_id = manager.get_player_id(websocket)
    if not player_id or _world_state is None:
        return None

    text = data.get("text", "").strip()
    if not text or len(text) > 500:
        return None

    player = _world_state.get_player(player_id)

    # Store in recent chat for NPC context (server-wide)
    _world_state.add_chat_message(player_id, text)

    # Broadcast to players within 100 units
    broadcast_data = {
        "type": "chat_broadcast",
        "sender": player_id,
        "text": text,
        "position": list(player.position),
    }
    await manager.broadcast_nearby(
        broadcast_data, player.position, 100.0, _world_state,
        exclude=player_id,
    )

    return None  # Sender already shows their own message
```

**File**: `server/src/world/world_state.py`
**Changes**: Add chat history ring buffer

```python
from collections import deque

# In __init__:
self.chat_history: deque[dict] = deque(maxlen=50)

def add_chat_message(self, player_id: str, text: str) -> None:
    self.chat_history.append({"player": player_id, "text": text})

def get_recent_chat(self, limit: int = 10) -> list[dict]:
    return list(self.chat_history)[-limit:]
```

#### [ ] 5.5 Add chat message types to protocol
**File**: `client/src/network/MessageProtocol.ts`
**Changes**: Add chat types

```typescript
export interface ChatMessage {
  type: "chat_message";
  text: string;
}

export interface ChatBroadcast {
  type: "chat_broadcast";
  sender: string;
  text: string;
  position: [number, number, number];
}
```

#### [ ] 5.6 Wire chat in client
**File**: `client/src/main.ts`
**Changes**:
- Wire `chatPanel.onSendMessage` to send `chat_message` via WebSocket
- Show own message in chat panel + spawn chat bubble above local player
- Handle `chat_broadcast` — show in chat panel + spawn bubble above remote player
- Track active chat bubbles in an array, update in `animate()` loop

```typescript
// Chat panel wiring
uiManager.chatPanel.onSendMessage = (text: string) => {
  ws.send({ type: 'chat_message', text });
  uiManager.chatPanel.addMessage(localPlayerId, text);
  // Spawn bubble above local player
  spawnChatBubble(player.group.position, text);
};

// In ws.onMessage:
if (data.type === 'chat_broadcast') {
  uiManager.chatPanel.addMessage(data.sender, data.text);
  // Spawn bubble above remote player
  const remote = entityManager.getRemotePlayer(data.sender);
  if (remote) {
    spawnChatBubble(remote.group.position, data.text);
  }
}

// System messages for join/leave:
if (data.type === 'player_joined') {
  uiManager.chatPanel.addSystemMessage(`${data.player.username} has joined the world`);
}
if (data.type === 'player_left') {
  uiManager.chatPanel.addSystemMessage(`${data.playerId} has left the world`);
}
```

#### [ ] 5.7 Chat input focus management
**File**: `client/src/main.ts` and `client/src/ui/ChatPanel.ts`
**Changes**:
- Pressing `Enter` (when chat is not focused) focuses the chat input and exits pointer lock
- Pressing `Escape` in chat input blurs it and re-acquires pointer lock
- When chat input is focused, suppress game keyboard controls (WASD)

```typescript
// In main.ts keydown handler:
if (e.code === "Enter" && !uiManager.chatPanel.isFocused) {
  e.preventDefault();
  uiManager.chatPanel.focusInput();
  if (document.pointerLockElement) document.exitPointerLock();
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd client && npx tsc --noEmit` passes
- [ ] `cd client && npm run lint` passes
- [ ] `cd server && ruff check src tests` passes
- [ ] `cd server && pytest` passes

#### Manual Verification:
- [ ] Chat panel visible in bottom-left of game screen
- [ ] Typing a message and pressing Enter sends it
- [ ] Message appears in chat panel of nearby players (within 100 units)
- [ ] Speech bubble appears above the sending player's head for ~5s
- [ ] Players far apart (>100 units) don't see each other's chat
- [ ] "X has joined/left" system messages appear in chat
- [ ] Pressing Enter focuses chat; Escape blurs it and returns to game controls

---

## Phase 6: NPC Dialogue Broadcasting & NPC Chat Awareness

### Overview
When a player talks to an NPC, the NPC's dialogue appears in nearby players' chat and as a bubble above the NPC. Additionally, NPCs are fed recent server-wide chat history so they can react to conversations.

### Changes Required:

#### [ ] 6.1 Broadcast NPC dialogue to nearby players
**File**: `server/src/ws/handler.py`
**Changes**: After agent invocation in `_handle_interaction()`, broadcast dialogue to nearby players

```python
# After getting result from registry.invoke():
dialogue = result.get("dialogue", "...")
npc = _world_state.get_npc(npc_id)
if npc and _manager and dialogue:
    npc_dialogue_broadcast = {
        "type": "npc_dialogue",
        "npcId": npc_id,
        "npcName": npc.name,
        "speakerPlayer": player_id,  # who triggered it
        "dialogue": dialogue,
        "position": list(npc.position),
    }
    await _manager.broadcast_nearby(
        npc_dialogue_broadcast, npc.position, 100.0,
        _world_state, exclude=player_id,
    )
```

#### [ ] 6.2 Broadcast player prompt to nearby players
**File**: `server/src/ws/handler.py`
**Changes**: Also broadcast what the player said to the NPC (so nearby players see both sides)

```python
# Before agent invocation:
if _manager:
    player = _world_state.get_player(player_id)
    player_chat = {
        "type": "npc_dialogue",
        "npcId": npc_id,
        "npcName": "",  # empty = player speaking
        "speakerPlayer": player_id,
        "dialogue": prompt,
        "position": list(player.position),
    }
    await _manager.broadcast_nearby(
        player_chat, player.position, 100.0,
        _world_state, exclude=player_id,
    )
```

#### [ ] 6.3 Handle `npc_dialogue` on client
**File**: `client/src/main.ts`
**Changes**: Show in chat panel and spawn bubble above NPC

```typescript
if (data.type === 'npc_dialogue') {
  const name = data.npcName || data.speakerPlayer;
  const color = data.npcName ? '#c5a55a' : '#ffffff';  // gold for NPC, white for player
  uiManager.chatPanel.addMessage(name, data.dialogue, color);

  // Spawn bubble above the NPC
  if (data.npcName) {
    const npc = entityManager.getNPC(data.npcId);
    if (npc) {
      spawnChatBubble(npc.mesh.position, data.dialogue);
    }
  } else {
    // Player's message to NPC — bubble above remote player
    const remote = entityManager.getRemotePlayer(data.speakerPlayer);
    if (remote) {
      spawnChatBubble(remote.group.position, data.dialogue);
    }
  }
}
```

#### [ ] 6.4 Add `npc_dialogue` type to protocol
**File**: `client/src/network/MessageProtocol.ts`

```typescript
export interface NPCDialogue {
  type: "npc_dialogue";
  npcId: string;
  npcName: string;
  speakerPlayer: string;
  dialogue: string;
  position: [number, number, number];
}
```

#### [ ] 6.5 Feed chat history into NPC agent context
**File**: `server/src/world/world_state.py`
**Changes**: Include recent chat in `get_context_for_npc()`

```python
def get_context_for_npc(self, npc_id: str, player_id: str) -> dict:
    # ... existing context building ...

    context = {
        "zone": zone_name,
        "zone_description": get_zone_description(zone_name),
        "time_of_day": self.environment.get("time_of_day", "day"),
        "weather": self.environment.get("weather", "clear"),
        "nearby_entities": nearby,
        "recent_chat": self.get_recent_chat(10),  # NEW
    }
    return context
```

**File**: `server/src/agents/npc_agent.py` (or wherever the system prompt is composed)
**Changes**: Include recent chat in the NPC's system prompt context so the LLM sees what players have been saying

```python
# In the system prompt template, append:
if world_context.get("recent_chat"):
    chat_lines = "\n".join(
        f"  [{msg['player']}]: {msg['text']}"
        for msg in world_context["recent_chat"]
    )
    system_prompt += f"\n\nRecent world chat (you can reference or react to these):\n{chat_lines}"
```

#### [ ] 6.6 Also show NPC dialogue bubble for local player interactions
**File**: `client/src/main.ts`
**Changes**: When handling `agent_response` for the local player, also spawn a bubble above the NPC

```typescript
// In agent_response handler, after adding message to InteractionPanel:
if (response.dialogue && response.dialogue !== '...') {
  const respondingNpc = entityManager.getNPC(response.npcId);
  if (respondingNpc) {
    spawnChatBubble(respondingNpc.mesh.position, response.dialogue);
  }
  // Also add to ChatPanel so the local player's chat log has it
  const npcName = npcNameMap.get(response.npcId) ?? response.npcId;
  uiManager.chatPanel.addMessage(npcName, response.dialogue, '#c5a55a');
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `cd client && npx tsc --noEmit` passes
- [ ] `cd client && npm run lint` passes
- [ ] `cd server && ruff check src tests` passes
- [ ] `cd server && pytest` passes

#### Manual Verification:
- [ ] Player A talks to an NPC; Player B (within 100 units) sees the dialogue in their chat panel
- [ ] Speech bubble appears above the NPC when it speaks (visible to all nearby players)
- [ ] Player A's prompt to the NPC also appears in Player B's chat
- [ ] NPC references something from recent chat (e.g., mention what another player said earlier)
- [ ] NPC dialogue bubble also shows for the local player above the NPC's head

---

## Testing Strategy

### Unit Tests:

**Client** (`client/src/__tests__/`):
- `MessageProtocol.test.ts`: Add type-check tests for new message types (JoinRequest, ChatMessage, WorldUpdate, etc.)
- `PlayerState.test.ts`: Test new fields (playerId, race, faction), verify `merge()` handles them
- `ChatBubble.test.ts`: Test text truncation (>60 chars gets "..."), lifetime expiry

**Server** (`server/tests/`):
- `test_handler.py`: Test `_handle_join()` — valid join, duplicate username rejection, invalid race/faction
- `test_handler.py`: Test `_handle_chat_message()` — text validation, empty text rejection
- `test_connection_manager.py`: Test `register()`, `disconnect()`, `is_username_taken()`, `broadcast_nearby()` with mock positions
- `test_world_state.py`: Test `get_nearby_players()` with various positions/radii, `add_chat_message()` ring buffer
- `test_player_state.py`: Test `to_public_dict()` output, new fields serialization

### Integration Tests:
- Two WebSocket clients connect, join with different usernames, send chat → verify each receives the other's messages
- One client joins, second tries same username → verify rejection
- Client disconnects → verify `player_left` broadcast to remaining clients

### Manual Testing Steps:
1. Open two browser tabs, create characters with different factions/races/usernames
2. Walk both characters near each other — verify you see the other player with correct model
3. Send a chat message from one — verify bubble appears above their head in the other tab and message shows in chat panel
4. Talk to an NPC from one tab — verify the other tab's chat shows the NPC dialogue with a bubble above the NPC
5. Move one player >100 units away — verify chat messages no longer appear
6. Close one tab — verify "X has left" message and player disappears from the other tab
7. Try joining with a taken username — verify error message on character creation screen

## Performance Considerations

- **Position broadcast at 10Hz** (not 60Hz) to keep bandwidth manageable. Server-side throttling ensures at most 10 updates/second per player.
- **world_update only to nearby players** (200-unit radius) — players far apart never exchange position data.
- **Chat broadcast limited to 100 units** — reduces message volume.
- **Chat bubble max 1 per entity** — if a new message arrives before the old bubble expires, replace it.
- **Remote player lerp interpolation** — smooth movement between 10Hz updates without jitter.
- **Chat history ring buffer (50 messages)** — bounded memory on server.
- **NPC context includes only last 10 chat messages** — keeps LLM prompt size manageable.

## Migration Notes

- **No database** — all state is in-memory. No migration needed.
- **Backwards compatibility** — the `"default"` player_id fallback is removed; clients must send a `join` message first. Old clients will receive a `join_error`.
- **NPC list from server** — Phase 2 changes the client to receive NPC configs from the `join_ok` response instead of hardcoding them. The hardcoded `NPC_CONFIGS` array in `main.ts` is removed.

## Thursday Plan Integration Notes

After ALL 6 phases of this multiplayer plan are complete, the Thursday plan (`thursday_plan.md`) can begin. The following is a checklist for Thursday agents to verify before starting:

- [ ] `handle_message()` in `handler.py` has the new signature `(data, websocket, manager) -> dict | None`
- [ ] `localPlayerId` is a module-level variable in `main.ts` (set during `join_ok` handler)
- [ ] `PlayerData` in `player_state.py` has `username`, `race`, `faction`, `yaw` fields and `to_public_dict()`
- [ ] `PlayerState` in `PlayerState.ts` has `playerId`, `race`, `faction` fields
- [ ] `UIManager` has `chatPanel` property
- [ ] `ConnectionManager` has `broadcast_nearby()` method
- [ ] `WorldState` has `chat_history`, `add_chat_message()`, `get_recent_chat()`, `get_nearby_players()`
- [ ] `main.ts` uses `localPlayerId` in all `ws.send()` calls (no more `'default'`)
- [ ] `main.ts` receives NPC list from `join_ok` response (hardcoded `NPC_CONFIGS` removed)
- [ ] Dungeon entry should set a flag on server `PlayerData` (e.g., `in_dungeon: bool`) so `world_update` broadcasts skip that player

## References

- Research document: `docs/agents/research/2026-03-19-multiplayer-system-and-bugs.md`
- Current connection manager: `server/src/ws/connection_manager.py:1-18`
- Current login screen: `client/src/ui/LoginScreen.ts:1-545`
- Current player model: `client/src/entities/Player.ts:1-192`
- Current message protocol: `client/src/network/MessageProtocol.ts:1-69`
- Current handler: `server/src/ws/handler.py:1-617`
- Current world state: `server/src/world/world_state.py:1-194`
