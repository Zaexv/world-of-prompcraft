---
date: "2026-06-04T16:00:00.000000+00:00"
branch: fix/quest-system-overhaul
topic: "End-to-End Data-Driven Quest System"
tags: [plan, quests, e2e, json, backend, frontend]
status: in_progress
---

# End-to-End Data-Driven Quest System Implementation Plan

## Overview
Currently, quests are defined redundantly in both `server/src/world/quest_definitions.py` and `client/src/state/QuestDefinitions.ts`. While the infrastructure for starting and advancing quests exists, it's not fully functional, particularly regarding quest completion, rewards, and automatic objective tracking for "talk_npc" types.

This plan aims to:
1.  Consolidate quest definitions into a single source of truth (`shared/data/quest_definitions.json`).
2.  Enable end-to-end quest functionality (Start -> Objective Progress -> Completion -> Reward).
3.  Add a `complete_quest` tool for NPCs to explicitly end quests.
4.  Implement automatic advancement for "talk_npc" objectives.

## Current State Analysis
- **Definitions**: Duplicated in Python and TypeScript.
- **Tools**: `start_quest` and `advance_quest_objective` exist, but `complete_quest` is missing as a tool (though the logic exists in `WorldState.apply_actions`).
- **Persistence**: `PlayerData` (server) tracks quests, but rewards aren't always being synced correctly to the client's inventory UI.
- **UI**: `QuestLog` and `QuestTracker` exist but depend on static client-side definitions.

## Phase 1: Shared Quest Manifest (JSON)
Consolidate definitions and link NPCs.

### [ ] 1.1 Create `shared/data/quest_definitions.json`
- Define the schema for quests and objectives.
- Migrate all existing quests (`sacred_flame`, `crystal_tear`, `village_patrol`).
- Link NPCs via `giver_npc` ID.

### [ ] 1.2 Refactor Backend to use JSON
**File**: `server/src/world/quest_definitions.py`
- Load definitions from the shared JSON at startup.
- Update `QuestDefinition` and `QuestObjective` dataclasses to match the new schema.

### [ ] 1.3 Refactor Frontend to use JSON/Sync
**File**: `client/src/state/QuestDefinitions.ts`
- Option A: Fetch quest definitions from the server upon joining (recommended for E2E consistency).
- Option B: Import JSON directly if build tools allow.

## Phase 2: NPC Tooling & Logic Completeness
Make quests fully manageable by AI agents.

### [ ] 2.1 Add `complete_quest` tool
**File**: `server/src/agents/tools/quest.py`
- Implement `complete_quest(quest_id)` tool.
- Ensure it emits the `complete_quest` action kind.

### [ ] 2.2 Update NPC System Prompts
**File**: `server/src/agents/personalities/templates.py`
- Ensure all quest givers have explicit instructions to use `complete_quest` when requirements are met.
- Standardize the usage of `check_player_quests` before offering or completing.

### [ ] 2.3 Automatic "talk_npc" Objective Tracking
**File**: `server/src/ws/handler.py`
- In `_handle_interaction`, check if the player has any active quest objectives of type `talk_npc` targeting the current `npc_id`.
- Automatically advance these objectives.

## Phase 3: Rewards & Inventory Sync
Ensure the "Loot" and Rewards feel impactful and work.

### [ ] 3.1 Hardened Reward Application
**File**: `server/src/world/world_state.py`
- Verify that `complete_quest` reliably adds `reward_item` to `player.inventory`.
- Ensure a `give_item` action is emitted so the client shows a popup.

### [ ] 3.2 Client UI for Quest Rewards
**File**: `client/src/ui/QuestLog.ts`
- Display reward metadata (icon, description) in the Quest Log.

## Phase 4: Validation & Testing
### [ ] 4.1 Integration Test: The El Tito Quest
- Reproduce the full cycle for "The Sacred Flame".
- Verify: Accept -> Enter Dungeon -> Find Item -> Return -> Complete -> Item Received.

### [ ] 4.2 Automated Tests
- **Backend**: Test quest loading, objective advancement logic, and tool execution.
- **Frontend**: Test `PlayerState.merge` with quest updates.

## Success Criteria
- [ ] Quests are defined in `shared/data/quest_definitions.json` ONLY.
- [ ] AI agents correctly start and complete quests via tools.
- [ ] "Talk to NPC" objectives advance automatically on interaction.
- [ ] Quest rewards (items/stats) are correctly applied to the player and visible in UI.
- [ ] Quest Log and Tracker stay perfectly in sync with server state.
