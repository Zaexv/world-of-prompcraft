# World of Promptcraft — Improvements & Fixes

Full code audit of the entire codebase. **39 issues** found across 5 severity levels.

| Severity | Count |
|----------|-------|
| Critical | 5 |
| High | 6 |
| Medium | 18 |
| Low | 10 |

---

## Critical (Fix Immediately)

### 1. Player State Injection Vulnerability
- **File:** `server/src/ws/handler.py` lines 57-60
- **Issue:** `_handle_interaction()` calls `setattr(player, key, value)` on raw user input without validation. A client could inject arbitrary properties (`max_hp: 99999`, `level: 100`).
- **Fix:** Whitelist allowed fields: `position`, `hp`. Validate types and ranges.

### 2. Memory Leaks in Dynamic Textures
- **Files:** `client/src/scene/Water.ts`, `client/src/scene/Skybox.ts`, `client/src/ui/Nameplate.ts`, `client/src/ui/ActionIcon.ts`
- **Issue:** Canvas textures and materials created during initialization are never disposed. Nameplate/ActionIcon create canvases per NPC. Over long sessions, GPU memory balloons.
- **Fix:** Add `dispose()` methods to all classes that create textures/materials. Call them when objects are removed.

### 3. WebSocket Reconnection Race Condition
- **File:** `client/src/network/WebSocketClient.ts`
- **Issue:** `connect()` is called on timeout during reconnect, but the previous WebSocket may not be fully closed. Multiple parallel connections can occur.
- **Fix:** Track connection state with a flag; only allow one `connect()` at a time. Cancel pending reconnect on explicit `disconnect()`.

### 4. Uncontrolled Effects Spawning
- **File:** `client/src/systems/ReactionSystem.ts`
- **Issue:** `createFloatingText()` and `createParticleBurst()` create Three.js objects without a cap. Rapid NPC interactions (e.g., dragon attacking every response) can spawn hundreds of effects.
- **Fix:** Pool floating text sprites (max 20). Reuse instead of creating new ones. Add a cap on active particle systems (max 10).

### 5. No Rate Limiting on WebSocket Messages
- **File:** `server/src/main.py` lines 47-56
- **Issue:** The WebSocket loop accepts messages without throttling. A malicious client could spam thousands of messages/second, each triggering an LLM call.
- **Fix:** Add per-connection rate limiter (e.g., max 5 messages/second). Queue excess messages or drop them with an error response.

---

## High Priority

### 6. No Timeout on LLM Calls
- **File:** `server/src/agents/registry.py` line 124
- **Issue:** `await agent.ainvoke()` has no timeout. If the LLM API hangs, the WebSocket connection blocks forever.
- **Fix:** Wrap in `asyncio.wait_for(agent.ainvoke(...), timeout=30.0)`. Return a timeout error to the client.

### 7. NPC Nameplate Health Bar Never Updates
- **File:** `client/src/entities/NPC.ts`
- **Issue:** `nameplate.updateHP()` is never called. The health bar stays at 100% regardless of damage.
- **Fix:** In `ReactionSystem.processAction()`, when an NPC takes damage or the `npcStateUpdate` arrives, call `npc.nameplate.updateHP(newHp, maxHp)`.

### 8. Server Starts with Empty API Keys
- **File:** `server/src/config.py`
- **Issue:** API keys default to `""`. Server boots fine but crashes on first LLM call with a confusing error.
- **Fix:** Add startup validation in `main.py` lifespan: check that the active provider's key is non-empty, log a clear error if missing.

### 9. Missing Error Handling in Player Move
- **File:** `server/src/ws/handler.py` line 84
- **Issue:** `_handle_player_move()` awaits `world_state.update_player()` without try/catch. If world state has been reset or player doesn't exist, it fails silently.
- **Fix:** Add try/except with logging.

### 10. No CORS/Origin Validation on WebSocket
- **File:** `server/src/main.py`
- **Issue:** WebSocket endpoint accepts connections from any origin. If deployed publicly, any website could connect.
- **Fix:** Add origin checking middleware or validate the `Origin` header in the WebSocket handler.

### 11. Collision Frame Counter Overflow
- **File:** `client/src/systems/CollisionSystem.ts`
- **Issue:** `frameCount` increments unboundedly. After ~3 billion frames (~1.5 years at 60fps) it loses precision. More importantly, at `Number.MAX_SAFE_INTEGER` modulo becomes unreliable.
- **Fix:** Reset to 0 when it exceeds 10000.

---

## Medium Priority

### 12. Hardcoded NPC Positions Duplicated Client/Server
- **Files:** `client/src/main.ts` lines 52-58, `server/src/world/npc_definitions.py`
- **Issue:** NPC IDs, names, and positions are defined in both client and server independently. If one changes, the other becomes stale.
- **Fix:** Serve NPC definitions from the backend via a REST endpoint or initial WebSocket message. Client creates NPCs dynamically from server data.

### 13. No Quest Tracking System
- **Issue:** `start_quest` and `complete_quest` actions emit UI banners but there's no persistent quest state. The player can't see active quests.
- **Fix:** Add `activeQuests: Map<string, Quest>` to PlayerState. Add a quest tracker UI panel (similar to inventory).

### 14. No Inventory Persistence
- **Issue:** Inventory resets on page refresh. Items are only in-memory.
- **Fix:** Implement the PostgreSQL persistence plan (already drafted in `combat_plan.md`).

### 15. No Inventory Limit Enforcement
- **File:** `server/src/world/world_state.py`
- **Issue:** Items are appended without checking max capacity. Client UI has 20 slots but server allows unlimited items.
- **Fix:** Check `len(player.inventory) < MAX_INVENTORY_SIZE` before appending. Return error if full.

### 16. Inventory Uses String Arrays Instead of Item Objects
- **Files:** `server/src/world/player_state.py`, `client/src/state/PlayerState.ts`
- **Issue:** Inventory is `list[str]` / `string[]`. No item metadata (type, description, quantity, stacking).
- **Fix:** Change to `list[dict]` / `InventoryItem[]` with `{itemId, name, type, quantity}`. The PostgreSQL plan already defines this.

### 17. No Spatial Partitioning for Collision
- **File:** `client/src/systems/CollisionSystem.ts`
- **Issue:** Raycaster checks ALL collidables every frame (throttled). With many buildings + trees, this doesn't scale.
- **Fix:** Implement a simple grid-based spatial hash. Only raycast against objects in adjacent cells.

### 18. No Frustum Culling for InstancedMesh
- **File:** `client/src/scene/Vegetation.ts`
- **Issue:** All 80 medium trees, 100 mushrooms, 150 ferns are always rendered even when behind the camera.
- **Fix:** Set `instancedMesh.frustumCulled = true` (default, but verify bounding sphere is computed).

### 19. No LOD (Level of Detail) for Distant Objects
- **Issue:** Trees, buildings, and effects render at full detail regardless of distance. At the 5-chunk view radius, far objects waste GPU.
- **Fix:** Use simplified geometry for distant chunks. Skip particle effects beyond 100 units.

### 20. NPCAnimator Phase Overflow
- **File:** `client/src/entities/NPCAnimator.ts`
- **Issue:** `this.phase` increments forever. After ~24 hours at 60fps, floating point precision degrades and sin/cos produce jittery results.
- **Fix:** Reset phase with `this.phase %= (Math.PI * 2 * 100)` periodically.

### 21. Tool Output Validation Missing
- **File:** `server/src/agents/nodes/act.py`
- **Issue:** Tools can return any values. LLM could call `deal_damage("player", 99999)` and the server applies it blindly.
- **Fix:** Clamp damage/heal amounts. Validate target exists. Cap at reasonable ranges per NPC archetype.

### 22. No Death/Respawn Mechanic
- **Issue:** When player HP hits 0, nothing happens. Player can still move and interact.
- **Fix:** Add death detection in PlayerState. Show death screen. Respawn at village with partial HP.

### 23. Water Reflections May Not Render Properly
- **File:** `client/src/scene/Water.ts`
- **Issue:** Three.js `Water` from examples requires the `sunDirection`, `sunColor`, and proper renderer setup. The procedural normal map may not produce visible reflections.
- **Fix:** Test and adjust `distortionScale`, `textureWidth/Height`. Consider using `Water2` from `three/examples/jsm/objects/Water2.js` for better reflections.

### 24. No Sound System
- **Issue:** Game is completely silent. No ambient music, combat sounds, UI feedback.
- **Fix:** Add a `SoundManager` class using Web Audio API. Ambient forest sounds, combat impacts, UI clicks.

### 25. Terrain Chunk Loading Can Cause Frame Spikes
- **File:** `client/src/scene/Terrain.ts`
- **Issue:** Creating a chunk (geometry + vertex colors + normals) is synchronous and can take 5-10ms. Loading multiple chunks at once causes visible stutters.
- **Fix:** Limit to 1 chunk loaded per frame. Use a queue.

### 26. Effects Not Distance-Culled
- **File:** `client/src/scene/Effects.ts`
- **Issue:** Wisps, particles, ground glow, and falling leaves update every frame regardless of distance from player.
- **Fix:** Only update effects within a radius of the player. Disable distant wisps' point lights.

### 27. No Minimap
- **Issue:** No way to see NPC locations or world layout. Player has to wander to find NPCs.
- **Fix:** Add a top-down minimap canvas in the corner showing terrain, NPC dots, and player position.

### 28. Chat History Not Preserved Across NPC Switches
- **File:** `client/src/ui/InteractionPanel.ts` line 149
- **Issue:** `show()` clears `chatHistory.innerHTML`. Switching between NPCs loses conversation history.
- **Fix:** Store per-NPC chat history in a `Map<string, string[]>`. Restore when reopening.

### 29. Bloom Post-Processing on Half-Res Not Resized
- **File:** `client/src/scene/SceneManager.ts`
- **Issue:** Bloom resolution is set once at construction. `onResize()` updates the composer but not the bloom pass resolution.
- **Fix:** In `onResize()`, also update the bloom pass resolution to half of the new window size.

---

## Low Priority

### 30. Unused AnimationSystem Import
- **File:** `client/src/main.ts` line 7
- **Issue:** Comment says unused but the import line remains, adding dead code.
- **Fix:** Remove the import.

### 31. `_scene` Parameter Unused in CollisionSystem
- **File:** `client/src/systems/CollisionSystem.ts` line 77
- **Issue:** `resolveMovement()` accepts `_scene` but never uses it. Underscore prefix indicates intentional, but it's dead API surface.
- **Fix:** Remove the parameter or document why it's reserved.

### 32. Auto-Scroll Override in Chat
- **File:** `client/src/ui/InteractionPanel.ts`
- **Issue:** New messages always scroll to bottom, even if user scrolled up to read history.
- **Fix:** Only auto-scroll if the user is already at the bottom (check `scrollTop + clientHeight >= scrollHeight - threshold`).

### 33. No Loading Screen Between Login and Game
- **Issue:** Clicking "Enter World" immediately starts loading all 3D assets. On slower machines, screen is blank for several seconds.
- **Fix:** Show a loading progress bar while SceneManager initializes. Use Three.js `LoadingManager` to track progress.

### 34. LoginScreen Animation Continues in Background
- **File:** `client/src/ui/LoginScreen.ts`
- **Issue:** If the login screen's requestAnimationFrame loop errors, it silently stops. No recovery.
- **Fix:** Add try/catch in the tick function.

### 35. No Gamepad/Controller Support
- **Issue:** Only keyboard + mouse input. Many players prefer controllers.
- **Fix:** Add Gamepad API support in PlayerController.

### 36. Hardcoded Action Button Prompts
- **File:** `client/src/ui/InteractionPanel.ts`
- **Issue:** NPC action buttons and their prompts are hardcoded in the client. Adding new NPCs requires client code changes.
- **Fix:** Serve action definitions from the backend as part of NPC data.

### 37. No Error Feedback to Player
- **Issue:** When WebSocket disconnects or server errors, the player sees no indication. Chat just shows "thinking..." forever.
- **Fix:** Add a connection status indicator in the UI. Show "Connection lost" message. Auto-retry with visible feedback.

### 38. No Keyboard Shortcut Help
- **Issue:** Player has to guess controls. No help screen or tooltip explaining WASD, mouse, I key, ESC, right-click.
- **Fix:** Add a controls overlay (toggle with H or ?) showing all keybindings.

### 39. No Mobile/Touch Support
- **Issue:** Game requires pointer lock + keyboard. Completely unusable on mobile/tablet.
- **Fix:** Add virtual joystick (nipplejs library) and touch-to-interact for mobile.

---

## Quick Wins (< 30 min each)

| # | Fix | Impact |
|---|-----|--------|
| 7 | Wire `nameplate.updateHP()` in ReactionSystem | NPC health bars actually work |
| 8 | Add API key validation at startup | Clear error instead of cryptic crash |
| 11 | Reset collision frame counter | Prevent long-session collision failure |
| 20 | Reset NPCAnimator phase | Fix animation jitter after hours of play |
| 22 | Add death detection (HP=0 → show message) | Basic game loop completion |
| 30 | Remove unused import | Code cleanliness |
| 32 | Smart auto-scroll in chat | Better UX for reading NPC responses |
| 37 | Add "disconnected" UI indicator | Players know when connection drops |
| 38 | Add controls help overlay (H key) | Player onboarding |

---

## Architecture Improvements (Larger Efforts)

| Effort | Description |
|--------|-------------|
| **PostgreSQL persistence** | Replace in-memory state. Plan already exists in `combat_plan.md`. |
| **NPC definitions from server** | Single source of truth. Client fetches NPC data on connect instead of hardcoding. |
| **Spatial partitioning** | Grid-based hash for collision and effect culling. Needed if adding monsters. |
| **Item/inventory system** | Replace string arrays with proper item objects, stacking, types. |
| **Quest tracker** | Persistent quest state with UI panel. |
| **Combat system** | Turn-based or real-time with HP tracking for both sides. Plan in `combat_plan.md`. |
| **Monster system** | Hostile NPCs that patrol, aggro, drop loot. Plan in PostgreSQL plan. |
| **Sound system** | Ambient audio, combat SFX, UI sounds. |
| **Mobile support** | Virtual joystick + touch interaction. |
