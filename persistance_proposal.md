---
date: 2026-06-11T21:30:00+02:00
topic: "Character Persistence Restoration"
tags: [plan, persistence, join-flow]
status: draft
---

# Character Persistence Restoration Implementation Plan

## Overview

We need to fix character persistence so that returning players are properly restored to their last saved location and health state. Currently, the server successfully saves the player on disconnect, but when the player logs back in, the server immediately overwrites their persisted position with the client's default start point, and the client never receives or applies its restored state.

## Current State Analysis

- The server's `GameStore` correctly saves `PlayerData` to SQLite on periodic ticks and disconnects.
- During login (`handle_join` in `server/src/ws/handlers/join.py`), the server successfully loads the player's saved `PlayerData`.
- However, immediately after loading it, `handle_join` overwrites `player.position` using `data.get("position")` (which is the client's initial local position).
- The `join_ok` WebSocket payload sends other players' data (`players` array) but explicitly excludes the joining player's own data, leaving the client blind to its saved position and HP.
- The client starts at `[0, 0, 0]` (or spawn) and sends that as its initial position, which overwrites the database. 

## Desired End State

When a returning player connects, the server should recognize their persisted state, refuse to overwrite it with the client's default login position, and explicitly transmit the restored position/stats back to the client in the `join_ok` payload. The client should then read this payload and teleport the local player to the correct coordinates. 

### Key Discoveries:
- **`server/src/ws/handlers/join.py`:** Restores the document successfully but then brutally overwrites it with `player.position = initial_position` (Lines 102-106). 
- **`client/src/core/WebSocketHandler.ts`:** Processes `join_ok` but doesn't have any code to set the local player's position or HP, because that data isn't even sent by the server.

## What We're NOT Doing

- We are not changing the database schema or how persistence is configured (it's already working).
- We are not changing how often the server saves the player (disconnect saving was fixed in the previous task).

## Implementation Approach

1. **Server Side (`join.py`)**: 
   - Check if the player is new vs returning.
   - If returning, *preserve* their persisted `position`, `hp`, etc.
   - Inject a new field into the `join_ok` response (e.g. `self_player`) containing the joining player's data.
2. **Client Side (`WebSocketHandler.ts`)**:
   - Read `data.self_player` from `join_ok`.
   - Update `d.playerController.position` and `d.playerController.targetYaw` to snap the camera and controller to the restored location.
   - Update `d.player.hp` and `d.player.maxHp`. 

## Phase 1: Server Restoration Logic

### Overview
Stop the server from blindly overwriting persisted player state on join, and send the player's data back to the client.

### Changes Required:

#### [ ] 1. Update `join.py`
**File**: `server/src/ws/handlers/join.py`
**Changes**: 
- Track whether a player was loaded from the DB or is brand new.
- Only apply the client's `initial_position` if the player is new.
- Add `self_player` to the `join_ok` dictionary so the client knows where it should be.

```python
        # Check if they are returning
        is_new_player = username not in world_state.players

        if is_new_player and ctx.store is not None:
            doc = ctx.store.load_player(username)
            if doc:
                try:
                    world_state.players[username] = PlayerData(**doc)
                    is_new_player = False
                    logger.info(f"Restored persisted state for returning player: {username}")
                except TypeError:
                    logger.warning(f"Stale persisted schema for {username} — starting fresh")

        player = world_state.get_player(username)
        player.username = username
        player.race = race
        player.faction = faction
        
        # Only override position if this is a brand new player
        if is_new_player:
            player.position = initial_position
        
        # ... later in join_ok return block ...
        return {
            "type": "join_ok",
            "playerId": username,
            "self_player": player.to_public_dict(),
            "players": current_players,
            "npcs": current_npcs,
            "worldObjects": world_objects,
        }
```

### Success Criteria:
#### Automated Verification:
- [ ] Tests pass: `make check` (ensure no join handler tests break)

#### Manual Verification:
- [ ] Inspect the WS frame for `join_ok` and confirm `self_player` is present.

---

## Phase 2: Client Teleportation

### Overview
Listen for the `self_player` payload in the `join_ok` message and update the local player avatar to match the server.

### Changes Required:

#### [ ] 1. Update Client Message Types
**File**: `client/src/network/MessageProtocol.ts`
**Changes**: Update `JoinOkResponse` interface to include `self_player`.

```typescript
export interface JoinOkResponse {
  type: 'join_ok';
  playerId: string;
  self_player: RemotePlayerData;  // Using RemotePlayerData interface as a shape match
  players: RemotePlayerData[];
  npcs: any[];
  worldObjects: any[];
}
```

#### [ ] 2. Update `WebSocketHandler.ts`
**File**: `client/src/core/WebSocketHandler.ts`
**Changes**: Extract `data.self_player`, teleport the player controller, and sync the HUD.

```typescript
        // Set local player state from the server's persisted data
        if (data.self_player) {
          const sp = data.self_player;
          
          // Teleport physical controller
          if (sp.position && sp.position.length >= 3) {
            this.d.playerController.position.set(sp.position[0], sp.position[1], sp.position[2]);
            this.d.playerController.targetYaw = sp.yaw || 0;
            
            // Sync camera and rotation instantly without smoothing
            this.d.playerController.yaw = sp.yaw || 0;
            this.d.playerController.camera.position.copy(this.d.playerController.position);
          }
          
          // Sync HP
          if (typeof sp.hp === 'number') {
            this.d.playerState.setHP(sp.hp, sp.maxHp);
          }
        }
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `cd client && npm run typecheck`
- [ ] Linter passes: `cd client && npm run lint`

#### Manual Verification:
- [ ] Log in, walk far away from the spawn point, and disconnect.
- [ ] Refresh the page and log back in.
- [ ] Verify you instantly appear at your last location instead of spawn!

---

## Testing Strategy

### Manual Testing Steps:
1. Load the game in the browser.
2. Walk to a distinct location (e.g. next to a specific tree or house).
3. Take some fall damage or combat damage to alter HP.
4. Close the browser tab.
5. Re-open the game and login with the same username.
6. Verify the character spawns exactly where you left them, with the exact same HP amount.
