# Player Interactions & Collisions Bug Research

Comprehensive bug analysis across the client and server codebase, focused on player interactions, collisions, state synchronization, and related systems.

---

## Critical Bugs

### 1. CollisionSystem: Y-Coordinate Mismatch Between Collision Body and Reported Position
**File:** `client/src/systems/CollisionSystem.ts` ~line 169
**Issue:** The player body is positioned at `desiredPos.y + 1.0`, but the returned `_result` uses `desiredPos.y` without the offset. The collision body is 1 unit higher than the position reported back to the game.
**Impact:** Collision detection doesn't match the player's visual position — collisions trigger too early or too late vertically.

### 2. Race Condition: No Validation That Server Response Matches Active NPC
**File:** `client/src/main.ts` ~lines 451–569
**Issue:** The `agent_response` handler processes responses without verifying `response.npcId` matches the currently active NPC. If a stale response arrives after the player closed the panel or switched NPCs, the code still updates the wrong UI, combat HUD, and NPC state.
**Impact:** UI pollution, incorrect combat HUD for wrong NPC, state corruption after panel close.

### 3. Double NPC HP Damage Application
**File:** `server/src/ws/handler.py` ~lines 488–490 and ~545–546
**Issue:** NPC HP is decremented directly at line 490 (`npc.hp = max(0, npc.hp - final_damage)`) during attack scoring, then the same damage action is passed to `apply_actions()` which applies it again.
**Impact:** NPCs take 2x damage on every attack interaction.

### 4. NPC Geometry/Material Never Disposed (GPU Memory Leak)
**File:** `client/src/entities/NPC.ts` (constructor) + `client/src/entities/EntityManager.ts` ~line 44
**Issue:** `removeNPC()` calls `scene.remove(npc.mesh)` but never disposes geometries, materials, nameplate textures, or action icon textures. No `dispose()` method exists on NPC.
**Impact:** GPU memory leak — grows with every NPC removed during gameplay. Extended sessions will degrade performance.

### 5. WorldState Instance Issue on Disconnect
**File:** `server/src/main.py` ~lines 62–65
**Issue:** The disconnect handler creates `ws = WorldState()` instead of using the global `_world_state` reference initialized during app startup. While singleton pattern may return the same instance, this is fragile and inconsistent with the handler module's pattern.
**Impact:** Risk of player data not being properly removed on disconnect, causing ghost players.

---

## High Severity Bugs

### 6. Race Condition: Player State Updated Without Lock During Interaction
**File:** `server/src/ws/handler.py` ~lines 466–471
**Issue:** Direct `setattr()` calls on player state without acquiring `_world_state._lock`, while `_handle_player_move()` properly acquires the lock via `update_player()`.
**Impact:** Concurrent move + interaction can corrupt position, HP, or inventory.

### 7. Race Condition: NPC HP Modified Without Lock
**File:** `server/src/ws/handler.py` ~lines 488–516
**Issue:** NPC HP is mutated directly (`npc.hp = max(0, npc.hp - final_damage)`) without lock. Multiple simultaneous interactions with the same NPC can lose damage or allow HP below 0.
**Impact:** Unreliable combat HP; simultaneous attacks can lose damage.

### 8. NPC Logical Position Not Updated When Idle
**File:** `client/src/entities/NPC.ts` ~line 208
**Issue:** `this.position.copy(this.mesh.position)` only runs during wandering. When idle after wandering, the NPC's logical position is stale.
**Impact:** Hover highlighting, click targeting, and collision detection use old coordinates for idle NPCs.

### 9. move_npc Action Doesn't Update NPC.position Property
**File:** `client/src/systems/ReactionSystem.ts` ~lines 248–264
**Issue:** The lerp animation updates `npc.mesh.position` but never syncs `npc.position` (the separate Vector3 cache). Collision, culling, and distance checks use the stale `npc.position`.
**Impact:** After server-driven NPC movement, all position-dependent systems use the old location.

### 10. Missing Player ID Validation — "default" Fallback
**File:** `server/src/ws/handler.py` ~lines 446–450
**Issue:** Interaction handler falls back to `"default"` player ID if websocket isn't registered. Unauthenticated clients can send interactions and modify the phantom "default" player state.
**Impact:** Security hole — unregistered clients can affect game state.

### 11. Agent NPC State Update Overwritten
**File:** `server/src/ws/handler.py` ~lines 549–559
**Issue:** The agent's `npcStateUpdate` from the LLM response is retrieved but immediately overwritten with the server's current NPC HP. Agent-driven state changes (mood, buffs) are discarded.
**Impact:** NPC agents cannot modify their own state through responses.

### 12. Player Null Safety in Constructor
**File:** `client/src/entities/Player.ts` ~lines 31–36
**Issue:** `getObjectByName()` results are cast as `THREE.Mesh` without null checks. If a race model is missing expected limbs, runtime crashes occur in `update()`.
**Impact:** Game crashes on malformed race models.

### 13. Quest Tool Parameter Mismatch (quest_id vs quest_name)
**File:** `server/src/agents/personalities/templates.py` ~lines 149, 196, 299 + `server/src/agents/tools/dialogue.py` ~line 60
**Issue:** Personality templates instruct NPCs to call `complete_quest('crystal_tear', ...)` with quest IDs, but the tool expects human-readable quest names.
**Impact:** Quest completion actions fail — client can't match the quest.

### 14. Conflicting Quest Tool Instructions in Personalities
**File:** `server/src/agents/personalities/templates.py` ~lines 121–149
**Issue:** Templates instruct to use `give_quest` in one section and `start_quest` in another, creating contradictory guidance for the LLM.
**Impact:** LLM confusion leads to incorrect tool selection and broken quest flows.

---

## Medium Severity Bugs

### 15. Dead WebSockets Not Removed From active_connections
**File:** `server/src/ws/connection_manager.py` ~lines 48–55
**Issue:** When `send_json()` fails, the exception is caught and logged, but the dead WebSocket is never removed from `active_connections`.
**Impact:** Memory leak, repeated failed sends to dead connections.

### 16. Equipment Dict Not Cleaned on Disconnect
**File:** `server/src/ws/handler.py` ~lines 868–883
**Issue:** Module-level `_player_equipment` dict is never cleaned up when players disconnect and has no lock protection.
**Impact:** Memory leak + race condition on rapid equip/unequip.

### 17. Missing Quest Metadata in Server to_dict()
**File:** `server/src/world/player_state.py` ~lines 38–70
**Issue:** `to_dict()` only serializes `id` and `objectives` from active quests, omitting `name`, `description`, `giverNpc`, `giverName`, `rewardItem`, `rewardDescription`.
**Impact:** Client receives quests with missing fields — quest UI renders empty values.

### 18. Position Field Leaked in PlayerStateData
**File:** `server/src/world/player_state.py` ~line 46
**Issue:** `to_dict()` includes `position` but the client's `PlayerStateData` interface doesn't define it. Position is already synced via `player_move`.
**Impact:** Protocol mismatch, duplicate position handling.

### 19. Inventory Split-Brain Between Client and Server
**File:** `server/src/ws/handler.py` ~lines 754–758
**Issue:** NPC `offer_item` tools don't update server-side `player.inventory` — only the client receives items. The server explicitly re-syncs inventory from client on use_item.
**Impact:** Server's inventory is perpetually stale; decisions based on it are wrong.

### 20. No Server-Side Position Validation
**File:** `server/src/ws/handler.py` ~lines 617–622
**Issue:** Player positions are accepted without bounds checking. Any coordinate is allowed.
**Impact:** Teleport exploit — clients can send extreme coordinates.

### 21. Server Doesn't Apply start_quest/complete_quest Actions
**File:** `server/src/world/world_state.py` ~line 236
**Issue:** `apply_actions()` explicitly skips `start_quest` and `complete_quest` action kinds — treated as client-only.
**Impact:** Quest state isn't server-authoritative; lost on crash, exploitable by malicious clients.

### 22. No Handler for Server Error Messages on Client
**File:** `client/src/main.ts` ~lines 374–611
**Issue:** Server returns `{"type": "error", ...}` messages, but client has no handler for the `error` type.
**Impact:** Error messages silently ignored — users get no feedback.

### 23. Chat History Map Never Pruned (Memory Leak)
**File:** `client/src/ui/InteractionPanel.ts` ~line 66
**Issue:** `chatHistories` Map grows unbounded as players interact with procedurally spawned NPCs. Never pruned when NPCs are removed.
**Impact:** Memory leak over extended play sessions.

### 24. Thinking Indicator Not Hidden on Panel Close
**File:** `client/src/ui/InteractionPanel.ts` ~lines 283–290
**Issue:** `hide()` doesn't call `hideThinking()`. If closed mid-response, the thinking state isn't properly reset.
**Impact:** Stale thinking indicator state on next panel open.

### 25. Unchecked Array Cast for p.position in Actions
**File:** `client/src/systems/ReactionSystem.ts` ~lines 250–251, 268–279
**Issue:** `p.position` is cast as `[number, number, number]` without validation. If not a 3-element numeric array, results in `NaN` coordinates.
**Impact:** NPC moves to invalid coordinates, breaking pathfinding/collision.

### 26. Zone Boundary Overlaps
**File:** `server/src/world/zones.py` ~lines 3–77
**Issue:** Multiple zone boundaries overlap (e.g., Teldrassil Wilds encompasses Elders' Village entirely). Zone assignment depends on list order.
**Impact:** Fragile zone detection; boundary positions may return unexpected zones.

### 27. Hat and Belt Materials Missing From Highlight List
**File:** `client/src/entities/NPC.ts` ~lines 104–109, 71–77
**Issue:** Hat material (`hatMat`) and belt material (`beltMat`) are never added to `this.materials[]`. `setHighlight()` skips them.
**Impact:** Hat and belt don't glow on hover — inconsistent highlighting.

### 28. setHighlight() Overwrites Original Emissive Colors
**File:** `client/src/entities/NPC.ts` ~lines 154–159
**Issue:** `setHighlight(false)` sets emissive to `0x000000` for all materials, destroying original emissive values (e.g., staff orb has `emissive: 0x6633aa`).
**Impact:** Staff orb and halo lose their natural glow after being highlighted.

### 29. Arm Animation Not Reset on Swim-to-Land Transition
**File:** `client/src/entities/Player.ts` ~lines 78–81
**Issue:** Arms are dampened with `*= 0.85` instead of being reset to neutral rotation. Z-axis rotation from swimming never fully converges to zero.
**Impact:** Arms remain slightly spread apart permanently after swimming.

### 30. Missing stopPropagation on Action Bar Buttons
**File:** `client/src/ui/InteractionPanel.ts` ~lines 273–277
**Issue:** Action button click events don't call `stopPropagation()`, unlike the input field which does (line 200–214).
**Impact:** Clicks may bubble up and trigger game controls behind the panel.

---

## Low Severity Bugs

### 31. Inconsistent Y-Offsets Across Entity Types in CollisionSystem
**File:** `client/src/systems/CollisionSystem.ts` ~lines 160–164, 267
**Issue:** Kinematic statics use `y + 1`, NPCs use `y + 1.5`, player uses `y + 1.0`. Inconsistent offsets cause misaligned collision shapes.

### 32. Hard-Coded Player Body Y=1 in Constructor
**File:** `client/src/systems/CollisionSystem.ts` ~line 55
**Issue:** Player body initialized at `Y=1.0` regardless of actual spawn position.

### 33. NPCAnimator Private Member Accessed via Bracket Notation
**File:** `client/src/entities/NPC.ts` ~line 218
**Issue:** `this.animator['baseY'] = ...` bypasses TypeScript encapsulation.

### 34. Wander Targets Not Validated for Walkability
**File:** `client/src/entities/NPC.ts` ~lines 169–175
**Issue:** Random wander targets don't check for collisions, steep terrain, or water.

### 35. NPC Death During Concurrent Interactions
**File:** `server/src/ws/handler.py` ~lines 488–559
**Issue:** No prevention of NPCs being killed multiple times by simultaneous interactions.

### 36. Dead Player Can Still Send Interactions
**File:** `server/src/world/player_state.py`
**Issue:** No `is_dead` field on server. Dead players can still interact with NPCs.

### 37. Missing Mana Mutation Methods on Client
**File:** `client/src/state/PlayerState.ts` ~lines 101–127
**Issue:** Has `takeDamage()`/`heal()` for HP but no equivalent `consumeMana()`/`restoreMana()` for mana.

### 38. Missing `pong` Type in ServerMessage Union
**File:** `client/src/network/MessageProtocol.ts` ~lines 148–157
**Issue:** Server sends `{"type": "pong"}` but the TypeScript type union doesn't include it.

### 39. Inconsistent Distance Calculation Style
**File:** `server/src/world/world_state.py` ~lines 97–98 vs 159
**Issue:** Some use `math.sqrt()`, others use `** 0.5`. Functionally equivalent but inconsistent.

### 40. Leg Phase Reset Causes Animation Jerk
**File:** `client/src/entities/Player.ts` ~lines 97–98
**Issue:** `walkPhase = 0` mid-swing causes legs to snap to idle instead of gradually stopping.

---

## Summary by Category

| Category | Critical | High | Medium | Low |
|----------|----------|------|--------|-----|
| Collision System | 1 | 1 | 0 | 2 |
| NPC Entities | 1 | 1 | 2 | 2 |
| Player Entity | 0 | 1 | 1 | 1 |
| Interaction Flow | 1 | 0 | 3 | 0 |
| Server State/Sync | 1 | 3 | 4 | 2 |
| Combat/Damage | 1 | 1 | 0 | 1 |
| Quest System | 0 | 2 | 1 | 0 |
| Network Protocol | 1 | 0 | 1 | 2 |
| UI/UX | 0 | 0 | 2 | 0 |
| Memory Leaks | 1 | 0 | 2 | 0 |
| **Total** | **5** | **14** | **16** | **10** |
