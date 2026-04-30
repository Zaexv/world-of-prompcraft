# Online Mode Research: Movement & Chat Visibility Between Players

## Architecture Overview

The multiplayer system is **event-driven** over WebSocket with proximity-based broadcasting:

| System | Mechanism | Radius | Frequency |
|--------|-----------|--------|-----------|
| Position sync | `player_move` → `world_update` | 200 units | 10 Hz |
| Chat | `chat_message` → `chat_broadcast` | 200 units | On send |
| NPC dialogue | `interaction` → `npc_dialogue` | 100 units | Per interaction |
| Join/Leave | `join` → `player_joined`/`player_left` | Global | On event |

**Key files:**
- Client: `WebSocketClient.ts`, `MessageProtocol.ts`, `RemotePlayer.ts`, `EntityManager.ts`, `ChatBubble.ts`, `ChatPanel.ts`, `main.ts`
- Server: `handler.py`, `connection_manager.py`, `world_state.py`, `player_state.py`, `main.py`

---

## What Works Correctly

- `to_public_dict()` properly exposes safe fields (position, yaw, race, faction, hp, username)
- `RemotePlayer` class renders 3D models per race with nameplate and faction coloring
- Position interpolation via lerp (delta * 10 factor, ~100ms convergence)
- ChatPanel shows messages with sender names
- WebSocket heartbeat (30s ping/pong) with auto-reconnect + exponential backoff
- Message field names (camelCase) are consistent between client and server
- `broadcast_nearby()` correctly uses XZ distance and excludes sender
- `get_nearby_players()` returns correct public dicts with updated positions

---

## Critical Bugs

### BUG 1 (CRITICAL): player_move Sent With Wrong ID Before join_ok — ✅ FIXED
**Files:** `client/src/main.ts:25,662,706,377-379,710-714,719`
**Original issue:** The animation loop starts when `initGame()` is called (line 719: `animate()`), but `localPlayerId` is initialized to `'default'` (line 25) and only updated when `join_ok` arrives (line 378). Without a guard, the first ~100ms of `player_move` messages would use `playerId: 'default'`.

**Status: ALREADY FIXED.** A `joinedServer` boolean gate at line 706 prevents `player_move` from being sent before `join_ok` is received. Additionally, `player_move` messages (lines 710-714) no longer include `playerId` at all — the server identifies the sender via WebSocket registration (see BUG 2 fix). The `joinedServer` flag is set to `true` at line 379 upon receiving `join_ok`.

---

### BUG 2 (CRITICAL): Server Trusts Client-Provided playerId — ✅ FIXED
**Files:** `server/src/ws/handler.py:669-670`
**Original issue:** `_handle_player_move()` used to extract `playerId` from the message body, allowing any client to spoof another player's ID.

**Status: ALREADY FIXED.** The code now exclusively uses the server's WebSocket registration as the authoritative player ID (line 670):
```python
# BUG-2: Always use server-side WebSocket registration as authoritative player ID
player_id = manager.get_player_id(websocket)
```
The client-provided `playerId` field is completely ignored.

---

### BUG 3 (CRITICAL): Newly Joined Players Broadcast at Position [0,0,0] — ✅ FIXED
**Files:** `server/src/ws/handler.py:304-321`, `server/src/world/player_state.py:17`
**Original issue:** When a player joins, `PlayerData` is created with default `position: [0.0, 0.0, 0.0]` (player_state.py line 17). The `player_joined` broadcast would immediately send this default to all clients.

**Status: ALREADY FIXED.** The join handler now accepts an `initial_position` from the client data (lines 305-313). It validates the position (must be a list of 3+ numeric values), falls back to `[0.0, 0.0, 0.0]` only if validation fails, and sets `player.position = initial_position` before broadcasting. The comment at line 304 reads: "BUG-3: Accept initial position from client so player isn't broadcast at [0,0,0]".

---

## High Severity Bugs

### BUG 4 (HIGH): Remote Players Never Removed When Out of Range
**Files:** `client/src/entities/EntityManager.ts:77-87`, `client/src/main.ts:412-420`
**Issue:** `updateRemotePlayers()` only adds/updates — never removes. When a player moves beyond 200 units, they vanish from `world_update` but the client's `RemotePlayer` object stays in the scene frozen forever.

**Fix:** Track which player IDs appeared in the latest `world_update`. After updating, remove any remote player not seen for N consecutive updates (e.g., 3 updates = 300ms grace period to handle packet loss).

---

### BUG 5 (HIGH): Chat Bubbles Fail for Unseen Remote Players — ⚠️ PARTIALLY FIXED
**Files:** `client/src/main.ts:429-448`
**Issue:** `chat_broadcast` handler looks up sender in `entityManager.remotePlayers`. If the sender hasn't appeared in a `world_update` yet, `remote?.group` is undefined and the bubble has no parent.

**Status: PARTIALLY FIXED.** A fallback exists (lines 437-446): if the remote player isn't in the scene, the code checks for `data.position` and creates a temporary `THREE.Object3D` at the broadcast position to attach the bubble. If no position is available either, `undefined` is passed to `spawnChatBubble`. The temporary object fallback works but could be improved (the bubble floats detached from any visible entity).

---

### BUG 6 (HIGH): NPC Position Changes Not Broadcast — ❓ UNVERIFIED
**Files:** `server/src/ws/handler.py` (interaction response)
**Issue:** The document originally claimed `move_npc` actions are only sent to the interacting player.

**Status: CANNOT VERIFY.** No `move_npc` action type exists in the current codebase. The server sends NPC positions only in the initial `join_ok` response and via `npc_dialogue` broadcasts. This bug may reference removed or planned functionality that was never implemented.

---

## Medium Severity Bugs

### BUG 7 (MEDIUM): Remote Player HP Never Updated
**Files:** `client/src/entities/RemotePlayer.ts`, `client/src/entities/EntityManager.ts:82`
**Issue:** `updateRemotePlayers()` calls `setTarget(p.position, p.yaw)` but ignores `p.hp`/`p.maxHp`. Nameplate HP bars are frozen at creation time.

**Fix:** Add `updateHP(hp, maxHp)` to `RemotePlayer` and call it in `updateRemotePlayers()`.

---

### BUG 8 (MEDIUM): No Walking Animation on Remote Players
**Files:** `client/src/entities/RemotePlayer.ts:52-62`
**Issue:** `update()` only interpolates position/yaw. Remote players glide as static T-pose models.

**Fix:** Compute velocity from position delta each frame. If speed > threshold, apply procedural walk animation (leg/arm swing). No server sync needed — derive from interpolation.

---

### BUG 9 (MEDIUM): Chat Radius (100) < Position Radius (200) — ✅ FIXED
**Files:** `server/src/ws/handler.py:376,385,693,709`
**Original issue:** Chat broadcast radius was 100 units while position sync was 200 units, making chat appear broken for visible players.

**Status: ALREADY FIXED.** Both chat and position broadcast now use 200 units. The comment at handler.py:376 reads: "BUG-9: Match chat radius to position radius (200 units) so visible players can chat". NPC dialogue radius remains at 100 units (handler.py:453, 634, 649).

---

### BUG 10 (MEDIUM): WebSocket Silently Drops Messages When Disconnected
**Files:** `client/src/network/WebSocketClient.ts:30-35`
**Issue:** `send()` checks `isConnected` and silently discards messages if false. No queue, no retry, no logging.
```typescript
send(msg: object): void {
  if (this.isConnected) {
    this.ws!.send(JSON.stringify(msg));
  }
  // Silently drops otherwise
}
```

**Impact:** During brief disconnects or reconnection, all movement/chat messages are lost with no indication.

**Fix:** Add a small message queue that replays on reconnect for critical message types (join, chat). Position messages can be safely dropped.

---

### BUG 11 (MEDIUM): world_update Sent to Nearby Players, Not Back to Sender — ✅ FIXED
**Files:** `server/src/ws/handler.py:692-712`
**Original issue:** When Player A sends `player_move`, the server broadcast `world_update` to nearby players but NOT back to Player A. If all nearby players were stationary, no `world_update` was generated, and newly approaching players wouldn't appear.

**Status: ALREADY FIXED.** The code now sends `world_update` back to the moving player (lines 699-701) via `manager.send_to(player_id, ...)`, in addition to broadcasting to nearby players (lines 703-712). The comment at handler.py:697 reads: "BUG-11: Also send world_update back to the moving player so they discover nearby stationary players".

---

### BUG 12 (MEDIUM): Remote Player Dispose Missing Texture Cleanup
**Files:** `client/src/entities/RemotePlayer.ts`
**Issue:** `dispose()` may not fully clean up nameplate canvas texture and sprite material, causing GPU memory leak similar to the NPC dispose issue.

**Fix:** Traverse group children and dispose all geometries/materials. Explicitly dispose nameplate texture.

---

## Low Severity

### BUG 13 (LOW): NPC Dialogue Broadcast Field Naming
`speakerPlayer` field is the player_id (which IS the username), so it works, but the name is misleading.

---

## Root Cause Summary

**Why movement isn't visible between players:**

| Priority | Bug | Effect | Status |
|----------|-----|--------|--------|
| ~~1st~~ | ~~BUG 1+2~~ | ~~First ~100ms of moves go to phantom 'default' player; server trusts fake ID~~ | ✅ Fixed |
| ~~2nd~~ | ~~BUG 3~~ | ~~New players appear at [0,0,0] instead of their actual spawn position~~ | ✅ Fixed |
| 1st | BUG 4 | Remote players that leave range become permanent frozen ghosts | ⚠️ Active |
| 2nd | BUG 8 | Remote players that DO move appear as gliding static models | ⚠️ Active |
| 3rd | BUG 7 | HP bars frozen — no feedback that interactions affect other players | ⚠️ Active |

**Why chat isn't visible between players:**

| Priority | Bug | Effect | Status |
|----------|-----|--------|--------|
| ~~1st~~ | ~~BUG 9~~ | ~~Chat radius is half the visibility radius — chat seems broken for visible players~~ | ✅ Fixed |
| 1st | BUG 5 | Chat bubbles use fallback when remote player not yet in scene (partially fixed) | ⚠️ Partial |
| 2nd | BUG 10 | Messages silently dropped during brief disconnects | ⚠️ Active |
