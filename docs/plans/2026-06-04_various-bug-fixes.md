# Bug Fixes — Login Loop, Respawn, Keybind, Inventory, Nameplates

## Context

Five gameplay bugs reported in World of Promptcraft. Root causes confirmed by
codebase research.

Decisions from user:
- **Inventory (Bug 4):** full server-side item model (description, rarity, icon).
- **Nameplate (Bug 5):** name + HP bar + thin relationship-tint border. Drop mood emoji + REP text.

---

## Bug 1 — Duplicate login infinite loop

**Root cause — takeover ping-pong.** `ConnectionManager.register()`
(`server/src/ws/connection_manager.py:30-48`) does a *session takeover*: a second
join with the same name closes the first socket (code 1000). The kicked client
auto-reconnects (`client/src/network/WebSocketClient.ts:62-74`, `shouldReconnect`
backoff) and re-joins, kicking the other. The two clients ping-pong forever;
each join unconditionally broadcasts `player_joined`
(`server/src/ws/handler.py:445-454`), spamming chat "X has joined" indefinitely.

**Fix — reject duplicate joins instead of takeover.**
- `server/src/ws/handler.py` `_handle_join()` (after username validation, before
  `manager.register()` at line 405): if `manager.is_username_taken(username)`
  (method already exists, `connection_manager.py:61-63`), return
  `{"type": "join_error", "message": "A player named '<name>' is already online."}`.
  Do **not** register, do **not** broadcast.
- `client/src/network/WebSocketClient.ts`: on receiving `join_error`, set
  `shouldReconnect = false` so the rejected client stops the reconnect loop.
  Verify where `join_error` is currently handled (`WebSocketHandler.ts`) and surface
  the message on the login screen / overlay instead of silently retrying.

Optional hardening: keep `register()`'s takeover logic for genuine reconnects
(same client, dropped socket) — but the duplicate-name guard above runs first, so
a true duplicate never reaches it.

---

## Bug 2 — Respawn camera lock

**Root cause — `activeNpcId` never cleared on death.** Death usually happens
mid-combat with an NPC, so `runtime.activeNpcId` is set. `updateDialogFocus()`
(`client/src/core/GameEngine.ts:172-195`) returns `true` whenever `activeNpcId` is
set, which makes the animate loop skip `playerController.update()`
(`GameEngine.ts:290-293`) and lock the camera onto the NPC. The `onDeath` handler
(`GameEngine.ts:233-238`) hides the interaction panel but never clears
`activeNpcId`; the `onRespawn` handler (`GameEngine.ts:239-245`) respawns + teleports
but also never clears it. Result: after respawn the camera stays locked focusing the
old NPC and the player can't move.

**Fix.**
- In `onRespawn` (`GameEngine.ts:239`): set `d.runtime.activeNpcId = null` before/after
  respawn so dialog focus releases. Also call `d.playerController.endOrbitDrag()`
  (`PlayerController.ts:173-183`) defensively to clear any stuck pointer-lock/orbit
  drag state, and `document.exitPointerLock()` if locked.
- In `onDeath` (`GameEngine.ts:233`): clear `activeNpcId` too, so dialog-focus camera
  isn't held during the death screen.
- Verify the close-NPC path at `GameEngine.ts:221-222` (which already nulls
  `activeNpcId`) for the pattern to reuse.

---

## Bug 3 — Map (M) opens while typing in NPC chat

**Root cause — `KeyM` handled before the input-focus guard.** Global keydown
listener `client/src/core/GameBootstrapper.ts:296-311` checks `KeyM` at line 298 and
`return`s *before* the `INPUT/TEXTAREA` guard at line 303-304. So unlike I/L/E/B,
the minimap toggle fires even when the chat field is focused. (`InteractionPanel`
input calls `stopPropagation` at `InteractionPanel.ts:439-443`, but the global
listener uses `{ capture: true }` so it fires first.)

**Fix.** Move the `INPUT/TEXTAREA` guard (and/or `uiManager.chatPanel.isFocused`
check, `ChatPanel.ts:204-206`) above the `KeyM` block so all hotkeys including M are
suppressed while typing. Simplest: relocate lines 303-304 to immediately after
`const key = ...` at line 297, before the M handler.

---

## Bug 4 — WoW-like inventory (full server-side item model)

**Root cause.** Items are plain strings end-to-end: `server player_state.py:16`
(`list[str]`), `client PlayerState.ts:32` (`string[]`), `GiveItemParams.item`
(`MessageProtocol.ts:124`). No description/rarity/icon anywhere; `InventoryPanel`
fakes descriptions via regex on the name (`InventoryPanel.ts:308-316`). Slots are
text-only, cramped (260px / 4 cols), no rarity colors or stack counts.

**Fix — introduce an item model and a WoW-style grid.**

Server:
- New item catalog `server/src/world/items.py`: dataclass `ItemDef(name, description,
  rarity, icon, stackable)` + a dict catalog of known items, with a `resolve(name)`
  fallback (heuristic by name) so unknown LLM-invented items still get sane metadata.
- `server/src/agents/tools/trade.py` `offer_item` (lines 21-45): look up the item def
  and push full metadata in the `give_item` action params
  (`{item, description, rarity, icon}`).
- `server/src/world/player_state.py`: store inventory as a list of item dicts (or keep
  names but attach a catalog lookup on serialize). Update `to_dict()` accordingly.

Protocol + client state:
- `client/src/network/MessageProtocol.ts`: extend `GiveItemParams` and
  `PlayerStateData.inventory` to an `Item` interface `{name, description, rarity,
  icon, quantity}`.
- `client/src/state/PlayerState.ts`: `inventory: Item[]`; `addItem(item: Item)` stacks
  by name+rarity incrementing quantity (`addItem` at line 125). Keep `equipped` keyed
  by name but resolve metadata via inventory/catalog for tooltips.
- `client/src/systems/ReactionSystem.ts:319-326` (`give_item` case): pass the full item
  object to `playerState.addItem`.

UI — rebuild `client/src/ui/InventoryPanel.ts` WoW-style:
- Wider grid (e.g. 8 cols), fixed square slots (~44px), rarity-colored slot borders
  (common/uncommon/rare/epic/legendary palette), item icon (glyph/emoji) centered,
  stack-count badge bottom-right when quantity > 1.
- Hover tooltip: item name colored by rarity + description + rarity label, using the
  real metadata (delete the `getItemDescription` regex hack at lines 308-316).
- Reuse style tokens: gold `#c5a55a`, light `#e8dcc8`, dark `rgba(8,6,18,0.94)`,
  `'Cinzel'` font, `declare field: Type` pattern (per UIComponent convention).

---

## Bug 5 — NPC nameplates: simplify + fix relationship update

**Current state.** `client/src/ui/Nameplate.ts` (canvas-texture `THREE.Sprite`) draws
name + HP bar + mood emoji + label + a cramped "REP" relationship bar
(`drawMoodRelationship`, lines 264-328). Relationship data path:
server `registry.py:241-248` → `agent_response.npcStateUpdate` (`handler.py:1071-1078`)
→ client `ReactionSystem.ts:157-175` calls `nameplate.updateMood(mood, relScore)`.
`updateMood` (`Nameplate.ts:67-72`) short-circuits if values unchanged. Note a second
path updates only the chat panel (`WebSocketHandler.ts:259-263`,
`interactionPanel.updateMoodStatus`).

**Fix — redesign to name + HP + thin relationship tint.**
- Rewrite the canvas draw in `Nameplate.ts`: render only the name and a slim HP bar,
  and a thin relationship-colored bottom border / underline using the existing
  color logic (red `< -30`, yellow `< 10`, green otherwise, lines ~312-327). Remove
  `drawMoodRelationship`'s mood emoji + "REP" text block.
- Keep `updateMood(mood, relationshipScore)` signature (still drives the tint), but
  ensure the relationship border redraws when `relationship_score` changes — current
  short-circuit at line 68 is fine since it compares both fields.
- Verify the update actually fires: `ReactionSystem.ts:166-173` reads
  `npcStateStore.getState(npcId)` after `updateState`. Confirm `relationship_score`
  from `npcStateUpdate` is merged (NPCState.ts `updateState` uses
  `partial.relationship_score ?? existing`). If server sometimes omits the field, the
  bar never moves — confirm `registry.py:247` returns the reflected score (reflect node
  `reflect.py:269-275` computes `new_score`) rather than defaulting to 0.
- Match game style: gold/serif tokens already used in the plate; keep panel bg
  `rgba(10,6,18,0.7)`, gold `#c5a55a`.

---

## Files touched (summary)

- `server/src/ws/handler.py` (Bug 1 join guard; Bug 4 give_item metadata if echoed)
- `client/src/network/WebSocketClient.ts` + `WebSocketHandler.ts` (Bug 1 join_error)
- `client/src/core/GameEngine.ts` (Bug 2 clear activeNpcId / endOrbitDrag)
- `client/src/core/GameBootstrapper.ts` (Bug 3 reorder keydown guard)
- `server/src/world/items.py` (new), `player_state.py`, `agents/tools/trade.py` (Bug 4)
- `client/src/network/MessageProtocol.ts`, `state/PlayerState.ts`,
  `systems/ReactionSystem.ts`, `ui/InventoryPanel.ts` (Bug 4)
- `client/src/ui/Nameplate.ts` (Bug 5)

## Verification

1. `make check` (lint + tsc + mypy strict + vitest + pytest) must pass.
2. Run both services (`python -m uvicorn src.main:app --reload --port 8000`; client
   `npm run dev`). Manual:
   - Bug 1: open two tabs, same name → second gets "already online" error; no chat
     spam, no reconnect loop (watch server logs + chat panel).
   - Bug 2: die in combat with an NPC → click Respawn → camera unlocks, WASD + camera
     drag work immediately.
   - Bug 3: open NPC chat, type, press M → minimap does NOT toggle; press M with chat
     closed → it does.
   - Bug 4: receive an item from an NPC (trade) → WoW-style slot with rarity border +
     icon; hover shows name (rarity color) + description; duplicate items stack.
   - Bug 5: chat with an NPC, shift relationship (be kind / hostile) → plate shows
     name + HP + relationship-tinted border that updates; no mood emoji / REP text.
