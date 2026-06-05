---
date: 2026-06-04T12:00:00.000000+00:00
git_commit: f906e61
branch: main
topic: "Advanced Item System, Economy, and LLM Loot Generation"
tags: [plan, items, loot, economy, llm, combat]
status: done
---

# Advanced Item System, Economy, and LLM Loot Generation Plan

## Overview
The current item system relies on a static catalog and keyword-based heuristics (`items.py`). Items are consumed via hardcoded keyword matching in `handler.py` (`_handle_use_item`), and there is no functional economy. The goal is to drastically improve this by introducing a "Gold" currency, structured item effects, and an LLM-driven loot generation system that drops bespoke items when enemies are defeated.

## Current State Analysis
- **Server State**: `PlayerData` lacks a currency field. Items are stored as a list of dictionaries with basic metadata (name, description, rarity, icon, quantity) via `stacked_inventory`, but their effects are not structured.
- **Server Logic**: `_handle_use_item` in `handler.py` parses the item string and manually applies effects (e.g., healing if it contains "potion").
- **Trading**: The `offer_item` tool in `trade.py` accepts a `price` parameter, but it doesn't subtract gold from the player.
- **Combat**: `resolve_combat` handles damage and visual tags, but NPC death does not currently grant gold or drop items.

## Desired End State
- Players earn gold by defeating enemies.
- Enemies drop LLM-generated items upon defeat, creating an infinite and contextual loot pool.
- Items have a strict, structured schema for effects (e.g., `{"heal_hp": 50}`) allowing for deterministic usage.
- Merchants securely validate and deduct gold when selling items.

## Implementation Approach

### Phase 1: Core Economy (Gold)
#### [x] 1.1 Add Gold to PlayerState
**File**: `server/src/world/player_state.py`
**Changes**: Add `gold: int = 0` to `PlayerData` and include it in `to_dict()` and `to_public_dict()`.

#### [x] 1.2 Interactive Trading & Purchase Logic
**Files**: `server/src/agents/tools/trade.py`, `server/src/agents/personalities/templates.py`
**Changes**: 
- Modify `offer_item` to behave differently based on price:
    - If `price == 0` (Gift): Grant immediately as before.
    - If `price > 0` (Sale): The tool will now merely *propose* the sale. It will return a string to the LLM like "Proposing [Item] for [Price] gold. Awaiting player confirmation."
- Add a new `complete_purchase(item_name, price)` tool. 
- **Merchant Workflow**: 
    1. Merchant says: "I have this [Item] for [Price] gold. Do you want it?" (using a dialogue-only response or a `propose_item` tool).
    2. Player says: "Yes, I'll pay" (or similar).
    3. Merchant calls `complete_purchase`. This tool performs the authoritative check: `if player.gold >= price`. 
    4. **Success**: Subtract gold, add item to inventory, return success message to LLM.
    5. **Failure**: Return "Insufficient gold" message to LLM so it can say "You're short on coin, cariño!". No item is given.
- Update Merchant system prompts to enforce this two-step "Propose → Confirm → Complete" flow.

#### [x] 1.3 Implement Gold Drops on Kill
**File**: `server/src/ws/handler.py`
**Changes**: In `_handle_interaction`, after `_combat_resolution` is processed, check if the NPC died. If so, award a calculated amount of gold and emit a `give_gold` action to the client.

#### [x] 1.4 Client UI for Gold
**Files**: `client/src/state/PlayerState.ts`, `client/src/ui/InventoryPanel.ts`, `client/src/systems/ReactionSystem.ts`
**Changes**: Update `PlayerState` to track gold. Add a gold counter to the inventory UI. Handle the `give_gold` action to display a floating text popup (+X Gold).

### Phase 2: Structured Item Effects
#### [x] 2.1 Enhance Item Definition
**File**: `server/src/world/items.py`
**Changes**: Add an `effects: dict[str, int]` field to `ItemDef`. Update existing items in `CATALOG` and heuristics to provide structured effects (e.g., `{"heal_hp": 30}`).

#### [x] 2.2 Refactor Item Usage
**File**: `server/src/ws/handler.py`
**Changes**: Rewrite `_handle_use_item`. Instead of string matching, call `resolve(item_name)` to get the `ItemDef`, iterate through its `effects`, and apply them deterministically to the player's state.

#### [x] 2.3 Client Sync
**Files**: `client/src/network/MessageProtocol.ts`, `client/src/ui/InventoryPanel.ts`
**Changes**: Update `GiveItemParams` and `Item` interfaces to include `effects`. Update the Inventory hover tooltip to display what the item does (e.g., "+30 HP").

### Phase 3: LLM Loot Generation (Sync Fast Generation)
#### [x] 3.1 Create Loot Generator
**File**: `server/src/combat/loot.py` (New File)
**Changes**: Implement `generate_loot(npc_name, npc_archetype)`. Use Langchain's `with_structured_output` to make a fast, synchronous LLM call that returns a JSON object matching the `ItemDef` schema, ensuring contextual drops (e.g., a Fire Mage drops a fiery item).

#### [x] 3.2 Trigger Loot on Kill
**File**: `server/src/ws/handler.py`
**Changes**: Inside the NPC death block of `_handle_interaction`, call `generate_loot`, add the generated item to the player's inventory, and emit a `give_item` action to the client so the player receives the loot immediately.

### Phase 4: Selling, Item Value, and Combat-Log Polish (follow-up)
Addresses player feedback after Phases 1–3 shipped.

#### [x] 4.1 Stable Combat Log Position
**Files**: `client/src/ui/UIManager.ts`, `client/src/core/WebSocketHandler.ts`
**Problem**: Log entries were routed to the `CombatHUD`'s inline log when a fight
was on screen and to the global bottom-right `CombatLog` otherwise, so the log
appeared to "move" when talking to NPCs vs. fighting.
**Changes**: Add `UIManager.logCombat(text, color)` as the single entry point. It
always writes to the persistent bottom-right `CombatLog` (position never jumps)
and mirrors into the `CombatHUD` log only while the HUD is visible. Route all
call sites (combat feedback, `use_item_result`) through it.

#### [x] 4.2 Log Gold / Purchase / Sale / Loot Events
**File**: `client/src/core/WebSocketHandler.ts`
**Changes**: Extend `applyCombatFeedback` to log `give_gold`, `complete_purchase`,
and `sell_item` actions (item gains already logged via `give_item`).

#### [x] 4.3 Item Sell Value
**Files**: `server/src/world/items.py`, `client/src/state/itemModel.ts`
**Changes**: Add `value` to `ItemDef` with a rarity-based default (`sell_value`
property), serialized in `to_dict`. Mirror `RARITY_VALUE` on the client and
default each item's value from its rarity so every item is always worth gold.
Show "Sells for X gold" in the inventory tooltip.

#### [x] 4.4 Sell-to-Merchant Flow
**Files**: `server/src/agents/tools/trade.py`, `server/src/world/world_state.py`,
`server/src/agents/personalities/templates.py`, client protocol + `ReactionSystem`
**Changes**: New `buy_item_from_player(item_name)` tool: verifies the player owns
the item, pays its `sell_value`, and emits a `sell_item` action. `apply_actions`
handles `sell_item` (remove item, add gold). Client `ReactionSystem` mirrors it
(remove item, add gold, popup). Merchant prompts teach the buy-from-player flow;
non-merchants decline.

## Verification & Testing
- **Unit Tests**: Add tests verifying gold transactions in `trade.py` and structured JSON generation in `loot.py`. Add tests for `buy_item_from_player` (pays value, rejects unowned items) and `ItemDef.sell_value`.
- **Integration Tests**: Simulate combat until NPC death to ensure gold and LLM loot are awarded successfully.
- **Manual Verification**: Defeat an enemy to see the gold and custom loot popup. Use the item to confirm stats apply correctly. Attempt to purchase an item without sufficient gold. Sell an item to a merchant and confirm the gold counter rises and the combat log records it.

## Outcome (done — merged to main `f906e61`)
All phases (1–4) implemented and shipped across two commits:
- `a0f02c9` — Phases 1–3: gold economy, structured effects, LLM loot drops.
- `4e9428b` — Phase 4: sell-to-merchant, item value, stable combat log.

Deviations from the original plan:
- **3.1**: `generate_loot` is **async** (`await structured.ainvoke`), not synchronous
  as drafted — keeps the WebSocket event loop unblocked. It is timeout-guarded and
  falls back to heuristic loot (`_fallback_loot`) on any error so a kill always drops.
- **1.3 / 3.2**: gold + loot are awarded in one place — `_build_kill_rewards` in
  `handler.py`, guarded by `NPCData.loot_dropped` so a corpse only pays out once.

Verification: `make check` green on main — ruff, ruff format, mypy (48 files),
eslint, tsc, 147 pytest, 143 vitest. New tests: `test_trade_economy.py`
(propose/complete/insufficient gold, sell flow) and `test_loot.py` (schema,
fallback, `sell_value`).

Known limitation (accepted, see follow-up discussion): most items carry no
`effects` by design — only clearly-consumable names get them; equipment and
flavor loot instead carry a sell value.
