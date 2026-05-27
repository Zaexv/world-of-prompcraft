# World of Promptcraft — WebSocket Protocol

This document is the **authoritative contract** between the TypeScript client (`client/src/network/MessageProtocol.ts`) and the Python server (`server/src/ws/protocol.py`). Both sides must implement this spec independently. Neither side should rely on reading the other's source code to understand the protocol.

**Transport:** WebSocket at `ws://<host>:8000/ws`  
**Encoding:** JSON (UTF-8)  
**Versioning:** 2.1.0 (Zonal Hybrid Manifest)

---

## Client → Server Messages

- **Discriminated union on `type`**: every message carries a `type` string field that determines its shape.
- **camelCase on the wire**: server fields that are snake_case internally use `alias` in Pydantic and map to camelCase in JSON.
- **Security whitelist**: the server only accepts `position`, `hp`, and `inventory` from client-provided `playerState`. All other player data is authoritative server-side.
- **Rate limiting**: max 10 `interaction` messages per 3 seconds per connection.
- **Auth guard**: all non-`join` / non-`ping` messages from unregistered connections are silently dropped.

---

## Client → Server Messages

### `join`

Sent once on connection to register the player.

```json
{
  "type": "join",
  "username": "Aelindra",
  "race": "night_elf",
  "faction": "alliance",
  "position": [x, y, z]
}
```

| Field | Type | Values |
|-------|------|--------|
| `race` | string | `"human"` `"night_elf"` `"orc"` `"undead"` |
| `faction` | string | `"alliance"` `"horde"` |

**Response:** [`join_ok`](#join_ok) or [`join_error`](#join_error)

---

### `interaction`

Sent when the player types a prompt to an NPC. Triggers the LangGraph agent pipeline.

```json
{
  "type": "interaction",
  "npcId": "dragon_01",
  "prompt": "I challenge you to a duel, great wyrm!",
  "playerId": "player_abc123",
  "playerState": {
    "position": [120.5, 3.2, -88.1],
    "hp": 75,
    "inventory": ["Health Potion", "Iron Sword"]
  }
}
```

**Response:** [`agent_response`](#agent_response)

---

### `player_move`

Sent every frame (throttled server-side) to broadcast player position.

```json
{
  "type": "player_move",
  "playerId": "player_abc123",
  "position": [120.5, 3.2, -88.1],
  "yaw": 1.57
}
```

**Response:** none (broadcast handled internally)

---

### `chat_message`

Sends a chat message to all players.

```json
{
  "type": "chat_message",
  "text": "Anyone near the Moonwell?"
}
```

**Response:** none (server broadcasts [`chat_broadcast`](#chat_broadcast) to all)

---

### `use_item`

Use an item from the player's inventory.

```json
{
  "type": "use_item",
  "playerId": "player_abc123",
  "item": "Health Potion"
}
```

**Response:** [`use_item_result`](#use_item_result)

---

### `equip_item`

Equip or unequip an item.

```json
{
  "type": "equip_item",
  "playerId": "player_abc123",
  "item": "Iron Sword",
  "slot": "weapon",
  "equipped": true
}
```

**Response:** [`ack`](#ack)

---

### `explore_area`

Register dynamic NPCs discovered by `WorldGenerator` with the server.

```json
{
  "type": "explore_area",
  "position": [256.0, 2.1, 320.5],
  "npcs": [
    {
      "npc_id": "dynamic_orc_7",
      "name": "Grul the Wanderer",
      "hp": 120,
      "maxHp": 120,
      "position": [260.0, 2.1, 318.0],
      "mood": "neutral"
    }
  ]
}
```

**Response:** [`ack`](#ack)

---

### `dungeon_enter`

Notify the server that the player entered a dungeon instance.

```json
{
  "type": "dungeon_enter",
  "dungeonId": "cave_12_5",
  "playerId": "player_abc123"
}
```

**Response:** [`ack`](#ack)

---

### `dungeon_exit`

Notify the server that the player exited a dungeon, reporting looted items.

```json
{
  "type": "dungeon_exit",
  "dungeonId": "cave_12_5",
  "playerId": "player_abc123",
  "loot": ["Ancient Coin", "Dusty Tome"]
}
```

**Response:** [`ack`](#ack)

---

### `quest_update`

Advance a quest objective (e.g., kill counter).

```json
{
  "type": "quest_update",
  "questId": "q_slay_wolves",
  "objectiveId": "kill_wolves",
  "playerId": "player_abc123"
}
```

**Response:** [`ack`](#ack)

---

### `ping`

Heartbeat sent every 30 seconds. No authentication required.

```json
{ "type": "ping" }
```

**Response:** [`pong`](#pong)

---

## Server → Client Messages

### `join_ok`

Login successful. Contains initial world state.

```json
{
  "type": "join_ok",
  "playerId": "player_abc123",
  "players": [
    {
      "playerId": "player_xyz",
      "username": "Thorngor",
      "position": [10.0, 2.0, -5.0],
      "race": "orc",
      "faction": "horde",
      "hp": 100,
      "maxHp": 100,
      "yaw": 0.0
    }
  ],
  "npcs": [
    {
      "npc_id": "tutorial_01",
      "name": "Tutorial-Man",
      "hp": 1000,
      "maxHp": 1000,
      "position": [2.0, 0.0, 5.0],
      "personality": "Full system prompt string...",
      "mood": "neutral"
    }
  ]
}
*Note: The `npcs` list is derived dynamically from the master `world_manifest.json`.*
```

---

### `join_error`

Login failed (invalid username, race, or faction).

```json
{
  "type": "join_error",
  "message": "Invalid race. Choose: human, night_elf, orc, undead"
}
```

---

### `agent_response`

NPC agent response after an `interaction`. Contains dialogue and zero or more game actions.

```json
{
  "type": "agent_response",
  "npcId": "dragon_01",
  "dialogue": "You dare challenge Ignathar?! Feel the wrath of dragonfire!",
  "actions": [
    {
      "kind": "damage",
      "params": {
        "amount": 35,
        "target": "player",
        "damageType": "fire",
        "effectType": "fire"
      }
    },
    {
      "kind": "emote",
      "params": { "animation": "attack" }
    }
  ],
  "playerStateUpdate": {
    "hp": 40,
    "maxHp": 100,
    "mana": 50,
    "maxMana": 50,
    "inventory": ["Health Potion"],
    "level": 1
  },
  "npcStateUpdate": {
    "hp": 480,
    "maxHp": 500,
    "mood": "angry",
    "relationship_score": -15
  }
}
```

---

### `use_item_result`

Result of a `use_item` request.

```json
{
  "type": "use_item_result",
  "success": true,
  "message": "You drink the Health Potion and recover 30 HP.",
  "actions": [
    {
      "kind": "heal",
      "params": { "amount": 30, "target": "player" }
    }
  ],
  "playerStateUpdate": {
    "hp": 70,
    "maxHp": 100
  }
}
```

---

### `ack`

Generic acknowledgement for fire-and-forget client messages.

```json
{
  "type": "ack",
  "status": "ok"
}
```

---

### `error`

Server-side error (e.g., agent timeout, invalid NPC ID).

```json
{
  "type": "error",
  "message": "NPC dragon_01 is not available."
}
```

---

### `world_update`

Periodic broadcast of all player positions (throttled).

```json
{
  "type": "world_update",
  "players": [
    {
      "playerId": "player_xyz",
      "username": "Thorngor",
      "position": [12.0, 2.0, -6.0],
      "race": "orc",
      "faction": "horde",
      "hp": 100,
      "maxHp": 100,
      "yaw": 1.2
    }
  ]
}
```

---

### `player_joined`

A new player connected.

```json
{
  "type": "player_joined",
  "player": {
    "playerId": "player_new",
    "username": "Solfara",
    "position": [0.0, 2.0, 0.0],
    "race": "human",
    "faction": "alliance",
    "hp": 100,
    "maxHp": 100,
    "yaw": 0.0
  }
}
```

---

### `player_left`

A player disconnected.

```json
{
  "type": "player_left",
  "playerId": "player_new"
}
```

---

### `chat_broadcast`

A player's chat message broadcast to all.

```json
{
  "type": "chat_broadcast",
  "sender": "Thorngor",
  "text": "Anyone near the Moonwell?",
  "position": [10.0, 2.0, -5.0]
}
```

---

### `npc_dialogue`

An NPC spoke in response to another player — broadcast to nearby players for world awareness.

```json
{
  "type": "npc_dialogue",
  "npcId": "dragon_01",
  "npcName": "Ignathar",
  "speakerPlayer": "Thorngor",
  "dialogue": "Foolish mortal...",
  "position": [100.0, 3.0, -80.0]
}
```

---

### `pong`

Heartbeat response to `ping`.

```json
{ "type": "pong" }
```

---

## Action Kinds Reference

All `actions[]` entries use a discriminated `kind` field. The `params` shape is fixed per kind.

| Kind | Params | Server Effect | Client Effect |
|------|--------|---------------|---------------|
| `damage` | `amount: int`, `target: "player"\|"npc"`, `damageType?`, `effectType?` | Reduces HP in WorldState | Red floating text, screen flash, particle effect |
| `heal` | `amount: int`, `target: "player"\|"npc"` | Restores HP in WorldState | Green floating text, green flash |
| `give_item` | `item: string` | Adds to player inventory | Gold floating text, inventory update |
| `take_item` | `item: string` | Removes from player inventory | Inventory update |
| `emote` | `animation: string` | (none) | NPC plays animation: `bow`, `wave`, `laugh`, `dance`, `attack` |
| `move_npc` | `position: [x,y,z]`, `duration?: float` | (none) | NPC lerps to new position over `duration` seconds |
| `spawn_effect` | `effectType: string`, `color?: string`, `count?: int`, `position?: [x,y,z]` | (none) | Particle burst |
| `change_weather` | `weather: string` | Updates WorldState weather | Scene fog adjustment: `clear`, `fog`, `storm`, `rain`, `snow` |
| `start_quest` | `questId`, `questName`, `description`, `objectives?[]` | (none) | Quest banner overlay, quest tracker update |
| `complete_quest` | `questId`, `questName`, `reward?` | (none) | Quest complete banner |
| `advance_objective` | `questId`, `objectiveId`, `progress: int` | (none) | Quest tracker progress update |

---

## Security Considerations

- **Input validation**: only `position`, `hp`, and `inventory` are accepted from `playerState` in `interaction` messages. All other player data (mana, level, quests, equipment) is server-authoritative.
- **Damage/heal clamping**: tool output is clamped to 0-100 on the server before applying to `WorldState`.
- **LLM timeout**: 30 seconds per agent invocation. Returns a fallback dialogue on timeout.
- **Rate limiting**: 10 interaction messages per 3 seconds per connection; excess is dropped with an `error` response.
- **Race/faction whitelist**: only `{"human", "night_elf", "orc", "undead"}` and `{"alliance", "horde"}` are accepted at join.
