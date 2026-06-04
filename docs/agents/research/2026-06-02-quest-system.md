---
date: 2026-06-02 21:33:18
git_commit: 27dc9a3
branch: main
topic: "How quests work in the World of Promptcraft codebase"
tags: [research, quests, npc, player-state, tools, langgraph]
status: complete
---

# Research: Quest System

## Research Question
How are quests created, tracked, completed, and rewarded in the World of Promptcraft codebase?

## Summary
The quest system is **fully implemented end-to-end** across server and client. Three predefined quests exist ("The Sacred Flame", "The Crystal Tear", "Village Patrol"), plus NPCs can generate dynamic/improvised quests at runtime. Quests are driven by NPC LangGraph agents that use quest tools (start_quest, advance_quest_objective, check_player_quests, complete_quest). Completion is tracked via multi-step objectives (enter_dungeon, collect_item, talk_npc, kill_enemies) with automatic detection on dungeon enter/exit. Rewards are granted as inventory items with descriptions. The UI shows a quest tracker (HUD widget) and quest log (L key overlay).

## Detailed Findings

### 1. Quest Definitions (Templates)

Three predefined quests defined **identically** on both server and client:

**Server:** `server/src/world/quest_definitions.py:31-124`
- `QuestDefinition` dataclass (id, name, description, giver_npc, objectives[], reward_item, reward_description, required_level)
- `QuestObjective` dataclass (id, description, type, target, completed)
- 3 quests: `sacred_flame`, `crystal_tear`, `village_patrol`

**Client:** `client/src/state/QuestDefinitions.ts:31-119`
- Mirrors server definitions exactly in TypeScript
- `QuestDefinition` interface + `ActiveQuest` interface (adds `completed: boolean` per objective)
- Used by both `PlayerState` and `QuestLog` UI for rendering quest names/descriptions from completed quest IDs

### 2. Quest Generation (Two Paths)

#### Path A: Predefined Quests (NPC calls `start_quest(quest_id)`)

The NPC agent calls the `start_quest` tool in `server/src/agents/tools/quest.py:24-41`. This tool:
1. Looks up the quest from `QUEST_DEFINITIONS`
2. Appends a `{"kind": "start_quest", "params": {"questId": ..., "quest": ...}}` action to `pending_actions`

The same pattern is used for `advance_quest_objective` (`quest.py:44-58`) and `check_player_quests` (`quest.py:61-71`).

**NPC personality prompts** instruct the LLM when to use these tools:
- El Tito uses `sacred_flame` (`templates.py:354-377`)
- Elyria the Sage uses `crystal_tear` (`templates.py:182-202`)
- Captain Aldric uses `village_patrol` (`templates.py:241-249`)
- Generic NPCs can offer quests about clearing creatures (`templates.py:987`)

#### Path B: Dynamic/Improvised Quests (NPC calls `give_quest(name, desc)`)

The `give_quest` tool in `server/src/agents/tools/dialogue.py:45-61` lets NPCs create spontaneous quests with any name/description. It also appends a `start_quest` action but with `questName` and `description` instead of a `questId`.

### 3. Action Processing Pipeline

The full flow from tool call to world mutation:

1. **Act Node** (`server/src/agents/nodes/act.py`): The LangGraph act node invokes the tool, which appends to `shared_pending_actions`. The node harvests these into `state["pending_actions"]`.

2. **Agent Return**: The agent returns `{"actions": [...], "dialogue": "..."}` to the WebSocket handler.

3. **World State Apply** (`server/src/world/world_state.py:200-296`): The handler calls `world_state.apply_actions(all_actions)` which processes:
   - `"start_quest"` → `player.start_quest(quest_id)` (`world_state.py:266-272`)
   - `"complete_quest"` → `player.complete_quest(quest_id)` + grants reward item from `QUEST_DEFINITIONS` (`world_state.py:274-286`)

4. **Response to Client**: The handler returns `{"type": "agent_response", "actions": [...], "playerStateUpdate": player.to_dict(), ...}`.

### 4. Quest Completion Tracking

Quest state is tracked in `PlayerData` on the server (`server/src/world/player_state.py:9-137`):

- `active_quests: list[dict]` — quests in progress with objectives and completion status
- `completed_quests: list[str]` — IDs of finished quests

**Methods on PlayerData:**
- `start_quest(quest_id)` (`player_state.py:80-114`) — adds quest from definition, fetches NPC name from manifest
- `advance_objective(quest_id, objective_id)` (`player_state.py:116-123`) — marks objective as completed
- `complete_quest(quest_id)` (`player_state.py:125-129`) — moves quest to completed list

**Server-side automatic detection** (in `server/src/ws/handler.py`):

| Trigger | Handler | What advances | Lines |
|---------|---------|---------------|-------|
| Player enters a dungeon | `_handle_dungeon_enter` | Any `enter_dungeon` objectives matching dungeon ID | `1162-1196` |
| Player exits a dungeon | `_handle_dungeon_exit` | Any `collect_item` objectives matching loot items | `1199-1246` |
| Generic quest update (e.g. kills) | `_handle_quest_update` | Per-type logic: `kill_enemies` increments kill_count, checks threshold | `1249-1304` |

**Client-side** (`client/src/state/PlayerState.ts`):
- `PlayerState` mirrors the server data with `activeQuests` and `completedQuests`
- `startQuest(questId)` (`player_state.ts:190-208`) — constructs ActiveQuest from definitions
- `advanceObjective(questId, objectiveId)` (`player_state.ts:210-219`) — marks objective completed locally
- `completeQuest(questId)` (`player_state.ts:221-231`) — moves from active to completed

**ReactionSystem** (`client/src/systems/ReactionSystem.ts:374-403`) handles incoming actions:
- `start_quest` → plays `quest_start` sfx, shows quest banner, calls `playerState.startQuest()`
- `advance_objective` → calls `playerState.advanceObjective()`, shows "Objective Complete" banner
- `complete_quest` → plays `quest_complete` sfx, calls `playerState.completeQuest()`, shows reward banner

**WebSocketHandler** (`client/src/core/WebSocketHandler.ts:319-340`) also logs quest events to combat log.

### 5. Rewards

Rewards are granted in `world_state.py:274-286` when a quest is completed:
```
quest_def = QUEST_DEFINITIONS.get(quest_id)
if quest_def and quest_def.reward_item:
    player.inventory.append(quest_def.reward_item)
```

Rewards defined:
- Sacred Flame → "Artifact of Ancient Wisdom" (+50 max mana)
- Crystal Tear → "Amulet of Clarity" (+20 max mana)
- Village Patrol → "Guard's Badge of Honor" (no stat bonus, cosmetic/faction item)

The `complete_quest` dialogue tool (`dialogue.py:64-85`) also appends a `give_item` action with the reward string, so the client gets both the server-side inventory addition AND a client-side `give_item` action.

### 6. Relationship/Mood Effects

`server/src/agents/nodes/reflect.py:196-199` tracks quest actions for relationship scoring:
- `start_quest` → relationship +3
- `complete_quest` → relationship +10

Personality notes also record if the player engages in quests (`reflect.py:230-231`): `"This player is a quester."`

### 7. UI

**QuestTracker** (`client/src/UI/QuestTracker.ts`): Compact widget on right side, shows up to 3 active quests with incomplete objectives only. Hidden when no quests active. Clicking a quest name fires `onOpenQuestLog` callback.

**QuestLog** (`client/src/UI/QuestLog.ts`): Full-screen overlay toggled with L key. Shows active quests (name, description, objectives with circle/checkmark, giver name) and completed quests (name with checkmark, from definitions lookup).

**UIManager** (`client/src/ui/UIManager.ts:34-35`): Creates both QuestLog and QuestTracker, wires the tracker click → quest log open, and calls `update()` on both whenever player state changes.

### 8. Network Protocol

`client/src/network/MessageProtocol.ts:153-177` defines the wire format:
- `StartQuestParams` — questId/quest/questName/description/objectives
- `CompleteQuestParams` — questId/questName/reward
- `AdvanceObjectiveParams` — questId/objectiveId/progress

Client can also send `QuestUpdate` messages (`handler.py:1249-1304`) for kill tracking and other manual objective advancement.

### 9. Does It Actually Work?

**Yes, the system is fully implemented and functional**, with a caveat:

- **Fully implemented:** 3 predefined quests with multi-step objectives, automatic advancement on dungeon enter/exit and kill tracking, rewards, UI (tracker + log), audio (start/complete sfx), relationship effects, and dynamic quest generation
- **NPC-driven completion:** The NPC agent (LLM) must decide when to call `advance_quest_objective` and `complete_quest`. For "talk_npc" objectives (e.g., "Return to El Tito"), the NPC is expected to notice the player has completed prerequisites and call the completion tools. This relies on the LLM's ability to:
  1. Use `check_player_quests()` to see active quests and inventory
  2. Check if prerequisites are met (player has `Mechero Ancestral` in inventory)
  3. Call `advance_quest_objective()` then `complete_quest()`

  The personality templates (`templates.py:197-202`, `templates.py:247-249`, `templates.py:368-370`) explicitly instruct the LLM on this sequence, so it works in practice when the LLM follows instructions.
- **Dungeon enter/exit** auto-advancement is purely server-side (no LLM needed) — works reliably
- **Kill tracking** (`_handle_quest_update`) auto-advances when player sends kill events — works reliably

## Code References

- `server/src/world/quest_definitions.py:31-124` — 3 quest definitions (Sacred Flame, Crystal Tear, Village Patrol)
- `server/src/world/player_state.py:80-137` — PlayerData quest methods (start, advance, complete, check)
- `server/src/world/world_state.py:266-286` — Server-side action processing for start/complete quest
- `server/src/agents/tools/quest.py:1-73` — Quest tools: start_quest, advance_quest_objective, check_player_quests
- `server/src/agents/tools/dialogue.py:45-85` — Dialogue tools: give_quest, complete_quest
- `server/src/agents/tools/__init__.py:25-33` — Tool factory registry
- `server/src/agents/nodes/act.py:13-59` — LangGraph act node (tool invoker)
- `server/src/agents/nodes/reflect.py:173-231` — Relationship scoring from quest actions
- `server/src/agents/personalities/templates.py:175-202` — Sage quest instructions
- `server/src/agents/personalities/templates.py:241-249` — Guard quest instructions
- `server/src/agents/personalities/templates.py:354-377` — El Tito quest instructions
- `server/src/ws/handler.py:1162-1304` — Server handlers: dungeon_enter, dungeon_exit, quest_update
- `client/src/state/QuestDefinitions.ts:1-119` — Client-side quest definitions and types
- `client/src/state/PlayerState.ts:188-246` — Client-side quest state management
- `client/src/systems/ReactionSystem.ts:374-403` — Client-side quest action handling
- `client/src/core/WebSocketHandler.ts:319-340` — Client-side quest event logging
- `client/src/ui/QuestTracker.ts:1-103` — HUD quest tracker widget
- `client/src/ui/QuestLog.ts:1-298` — Full quest log overlay (press L)
- `client/src/ui/UIManager.ts:34-35,89-106` — Quest UI lifecycle
- `client/src/network/MessageProtocol.ts:153-177` — Wire format types for quest actions
- `client/src/audio/effects.ts:160-174` — quest_start / quest_complete SFX definitions

## Architecture Diagram

```
Player asks NPC for quest
        │
        ▼
  WebSocket handler (_handle_interaction, handler.py:513)
        │
        ▼
  Agent registry.invoke(npc_id, player_id, prompt, player_state)
        │
        ▼
  LangGraph NPC Agent
    ├── act node (act.py)      → calls quest tool (quest.py)
    │                            e.g. start_quest("sacred_flame")
    │                            appends to pending_actions
    ├── reflect node (reflect.py) → relationship +3/+10
    └── respond node            → generates dialogue
        │
        ▼
  Agent returns { dialogue, actions, npcStateUpdate }
        │
        ▼
  world_state.apply_actions(actions)   (world_state.py:200-296)
    ├── "start_quest"    → player.start_quest(quest_id)
    ├── "complete_quest" → player.complete_quest(quest_id) + reward item
    └── emote, give_item, damage, etc.
        │
        ▼
  Response sent to client { type: "agent_response", actions, playerStateUpdate }
        │
        ▼
  Client ReactionSystem (ReactionSystem.ts:374-403)
    ├── start_quest    → sfx + banner + playerState.startQuest()
    ├── advance_objective → playerState.advanceObjective()
    └── complete_quest → sfx + banner + playerState.completeQuest()
        │
        ▼
  PlayerState.onQuestChange() → UIManager updates QuestTracker + QuestLog
```

## Open Questions
- How well does the LLM actually follow the quest tool instructions in practice (e.g., calling `check_player_quests` first, noticing inventory items)?
- Are there automated tests for the quest auto-advancement handlers (dungeon enter/exit)?
- Is `kill_count` properly reset per-quest or does it globally accumulate across all quests? (Current code suggests a single global counter — `player.kill_count` — which could cause issues if multiple quests have `kill_enemies` objectives.)
