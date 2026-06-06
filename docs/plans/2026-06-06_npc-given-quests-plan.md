---
date: 2026-06-06T00:00:00.000000+00:00
git_commit: 8631802
branch: feat/quests
topic: "Abstract, Scalable, NPC-Given Quests"
tags: [plan, quests, agents, langgraph, world-state, economy]
status: done
---

# Abstract, Scalable, NPC-Given Quests

## Goal
Make quests **abstract** (objectives/rewards are data, not bespoke code paths),
**scalable** (add a quest or objective type without editing prompts, two registries,
and four handlers), and **NPC-given** (an NPC can offer a real, trackable quest at
runtime — predefined *or* improvised — that mutates authoritative server state and
pays out on completion).

## Current State (what exists, what's broken)

Investigated across server + client. Quests half-exist but don't actually work end-to-end.

- **Hardcoded + duplicated registries.** `server/src/world/quest_definitions.py` holds 3
  static `QuestDefinition` literals; `client/src/state/QuestDefinitions.ts` re-declares the
  same 3. Both must know a quest *by ID* before it can be tracked. `PlayerState.startQuest`
  (client) silently drops any quest whose ID isn't in its local copy.
- **NPCs can't create real quests.** Two parallel tool paths exist:
  - `agents/tools/quest.py` `start_quest(quest_id)` — docstring hardcodes the 3 valid IDs,
    emits `{kind: start_quest, params:{questId, quest}}`.
  - `agents/tools/dialogue.py` `give_quest(quest_name, description)` — "dynamic" quest, but
    **no objectives, no reward, no persistence**; the client drops it.
- **Param-key mismatch + missing `player_id`.** Tools emit `questId` (camel) and never set
  `player_id`; `world_state.apply_actions` reads `quest_id`/`player_id` (snake). Net:
  **agent `start_quest`/`complete_quest` actions never mutate server state** — only the client
  reacts, using its own static registry. Reward granting at `world_state.py` is dead for the
  agent path. (Contrast `trade.py`/`combat.py`, which inject `player_id` inside the tool.)
- **Objective progress is a closed enum, partly dead.** Types: `enter_dungeon`, `collect_item`,
  `talk_npc`, `kill_enemies`, each with bespoke handling in `ws/handler.py`
  (`_handle_dungeon_enter/_exit/_handle_quest_update`). `enter_dungeon`/`collect_item` work
  (driven by `DungeonSystem`). `kill_enemies` is designed to auto-advance via `kill_count` but
  **no client/server code ever emits the kill event** → dead. `talk_npc` relies purely on the
  LLM calling `advance_quest_objective`.
- **Rewards are item-string-only.** `complete_quest` appends `reward_item` to inventory. The
  "+50 max mana"-style promises are flavor text, never applied. No gold/XP — even though a gold
  economy + structured item effects now exist (`improve_items` plan, merged).
- **Giver linkage lives only in quest defs** (`giver_npc`), not in `npc_definitions.py`. NPC
  quest-giving is prompt-engineered per NPC with hardcoded quest IDs in
  `personalities/templates.py`.
- **No quest tests.**

### What we can reuse
- `PlayerData.active_quests` already stores **full dict instances** (not just IDs) and
  `to_dict()` already serializes objectives — the data model is 80% there.
- The propose→confirm→complete pattern from the **gold purchase** flow (`improve_items`) maps
  directly onto offer-quest→accept.
- The **LLM structured-output** pattern from the **loot generator** (`combat/loot.py`,
  `with_structured_output`) maps directly onto NPC-improvised quest generation.
- Client `QuestLog`/`QuestTracker` already render `activeQuests`/`completedQuests` from server
  player state.

## Desired End State
- A quest is a **server-authoritative instance** living on the player, fully self-describing
  (title, objectives with progress, rewards). The client renders it verbatim — **no client-side
  quest registry**.
- An NPC offers a quest two ways, both producing the same instance shape:
  1. **Curated** — pick from a seed template library (the existing 3 + more), for hand-authored
     story quests.
  2. **Improvised** — LLM generates a contextual quest via structured output, validated against
     a schema, with safe bounds (objective count, reward caps).
- **Offer → accept** flow: NPC proposes, player confirms (mirrors the purchase flow), quest
  instance is added server-side.
- Objective progress is **event-driven and abstract**: a single `QuestProgress` service
  consumes typed game events (`enemy_killed`, `item_collected`, `npc_talked`, `zone_entered`,
  `dungeon_entered`) and advances *any* matching objective across *all* active quests. Adding an
  objective type = registering a matcher, not editing handlers.
- On all objectives complete → quest auto-completes and **pays generalized rewards** (gold +
  items, XP/stat optional) via `apply_actions`.
- NPC prompts contain **no hardcoded quest IDs** — generic quest-giving rules only.

## Design

### Abstract data model (single source of truth: server)
```
QuestObjective:  id, kind, target, required:int=1, progress:int=0, completed:bool
QuestReward:     gold:int=0, items:list[str]=[], xp:int=0          # extensible
QuestInstance:   id, title, description, giver_npc_id, giver_name,
                 objectives:list[QuestObjective], reward:QuestReward,
                 origin:"curated"|"improvised", status:"offered"|"active"|"completed"
```
- `kind` is an open string keyed into an **objective-matcher registry** (below), not a closed
  enum. `target` + `required` generalize "kill 3 wolves" / "collect 1 Sacred Flame" /
  "talk to Sage" / "reach Crystal Lake".
- Curated templates become instances on accept (deep-copied, fresh `progress`). Improvised
  quests are generated as instances directly.

### Objective-matcher registry (the "abstract" core)
A dict `OBJECTIVE_MATCHERS: dict[str, Matcher]` where each matcher answers
`matches(objective, event) -> int` (progress delta). Adding a new objective kind = add one
matcher. Seed kinds: `kill` (target=npc archetype/name or "any"), `collect` (target=item),
`talk` (target=npc_id), `reach` (target=zone), `enter_dungeon` (target=dungeon_id). `QuestProgress`
iterates active quests' objectives, applies matchers to each incoming event, bumps `progress`,
sets `completed` when `progress >= required`, and fires completion when all objectives done.

### NPC generation (scalable, contextual)
- **Curated path:** `offer_quest(quest_id)` — validates against a seed `QUEST_TEMPLATES` registry
  (no hardcoded IDs in the docstring; the tool lists available IDs dynamically).
- **Improvised path:** `offer_custom_quest(...)` backed by `llm.with_structured_output(QuestProposal)`
  (Pydantic) — the model proposes title/description/objectives/reward grounded in zone + lore +
  player level. Server clamps: ≤3 objectives, reward gold/items within tier caps, objective kinds
  must be in the matcher registry (unknown kinds dropped or mapped to `talk`).
- Both emit an `offer_quest` action with the full instance; **player accepts** via an
  `accept_quest` action (client confirm UI), mirroring purchase propose→complete.

### Reward fulfillment
On completion, emit `complete_quest` with the resolved `QuestReward`; `apply_actions` grants gold
(`give_gold` semantics) + items (`give_item`) + optional XP/level. Reuse existing economy
handlers; remove the dead `reward_item`-only path.

## Implementation Approach

### Phase 1: Server-authoritative abstract quest model
#### [ ] 1.1 Quest schema + instance model
**Files**: `server/src/world/quest_definitions.py` (or new `world/quests.py`)
- Add `QuestObjective` (kind/target/required/progress/completed), `QuestReward`
  (gold/items/xp), `QuestInstance`. Keep the 3 existing quests as `QUEST_TEMPLATES`
  (curated seeds) that produce instances. Add `instantiate(template_id, giver) -> QuestInstance`.

#### [ ] 1.2 PlayerData quest API generalized
**File**: `server/src/world/player_state.py`
- Replace ID-lookup `start_quest` with `accept_quest(instance: dict)` storing a full instance
  (offered→active). Add `advance_objective(quest_id, kind, target, delta)` and
  `auto_complete_if_done(quest_id) -> QuestReward | None`. `to_dict()` serializes
  `progress/required` and the reward block. Keep dedupe (active/completed).

#### [ ] 1.3 Fix action wiring (player_id + key normalization)
**Files**: `server/src/agents/tools/quest.py`, `server/src/world/world_state.py`
- Quest tools inject `player_id` (snake) and consistent param keys, like trade/combat tools.
- `apply_actions`: `accept_quest`, `advance_objective`, `complete_quest` handlers read the
  normalized keys and call the new PlayerData API; `complete_quest` grants the full reward.

### Phase 2: Abstract event-driven objective progress
#### [ ] 2.1 Objective-matcher registry + QuestProgress service
**File**: new `server/src/world/quest_progress.py`
- `OBJECTIVE_MATCHERS` + `QuestProgress.on_event(player, event) -> list[action]` that advances
  matching objectives across all active quests and emits `complete_quest` (with reward) when a
  quest finishes. Pure, unit-testable.

#### [ ] 2.2 Emit game events (wire the dead paths)
**File**: `server/src/ws/handler.py`
- On NPC death (`_build_kill_rewards`) emit `enemy_killed` → `QuestProgress.on_event`
  (fixes the dead `kill` path, server-side, no client trust).
- Route `dungeon_enter`/`dungeon_exit` and a new `talk`/`reach` signal through `QuestProgress`
  instead of the bespoke `_handle_*` objective code; delete the per-type handlers.
- `talk` event fired when a player interacts with the objective's target NPC.

### Phase 3: NPC quest generation (curated + improvised)
#### [ ] 3.1 Curated offer tool
**File**: `server/src/agents/tools/quest.py`
- `offer_quest(quest_id)` validates against `QUEST_TEMPLATES`; dynamic ID list in the docstring/
  return string (no hardcoding). Emits `offer_quest` action with the instantiated quest.

#### [ ] 3.2 Improvised quest generator (LLM structured output)
**File**: new `server/src/agents/quests/generator.py`
- `QuestProposal` Pydantic schema + async `generate_quest(llm, npc, world_context, player_level)`
  using `with_structured_output`, timeout-guarded with a heuristic fallback (mirror
  `combat/loot.py`). Server-side clamping (objective count, reward caps, kind whitelist).
- `offer_custom_quest` tool calls it and emits an `offer_quest` action.

#### [ ] 3.3 Accept flow + generalized personality rules
**Files**: `server/src/agents/tools/quest.py`, `server/src/agents/personalities/templates.py`
- `accept_quest` action (player confirm) → `PlayerData.accept_quest`. Mirror purchase
  propose→complete. Strip hardcoded quest IDs from prompts; add a generic
  "you may offer quests with offer_quest / offer_custom_quest" rule to the shared preamble;
  per-NPC flavor only.

### Phase 4: Client de-duplication + UI
#### [ ] 4.1 Render from server, delete client registry dependency
**Files**: `client/src/state/PlayerState.ts`, `client/src/state/QuestDefinitions.ts`,
`client/src/ui/QuestLog.ts`, `client/src/ui/QuestTracker.ts`
- `acceptQuest`/quest state built from the server-sent instance (full shape), not a local
  lookup. Remove the dependency on client `QUEST_DEFINITIONS` (keep only as optional display
  fallback, or delete). QuestLog shows `progress/required` counts and reward (gold + items).

#### [ ] 4.2 Protocol + reaction handling
**Files**: `client/src/network/MessageProtocol.ts`, `client/src/systems/ReactionSystem.ts`,
`client/src/core/WebSocketHandler.ts`
- Add `offer_quest`/`accept_quest` action params carrying the instance + reward; an accept-quest
  confirm affordance. Handle `complete_quest` reward banner (gold + items). Remove client
  `quest_update`-on-kill assumptions (progress is server-authoritative now).

### Phase 5: Tests
#### [ ] 5.1 Server
**Files**: `server/tests/domains/world/test_quests.py`, `.../test_quest_progress.py`,
`server/tests/domains/tools/test_quest_tools.py`
- Instance model + accept/dedupe; matcher registry per kind; `QuestProgress.on_event` advances +
  auto-completes + pays reward; `kill` event from NPC death advances `kill` objectives; improvised
  generator fallback + clamping; offer→accept emits correct actions with `player_id`.

#### [ ] 5.2 Client
**Files**: `client/src/__tests__/QuestLog.test.ts`, `.../PlayerStateQuests.test.ts`
- QuestLog renders a server instance with progress counts; accept flow updates state without a
  local registry; completion shows reward.

#### [ ] 5.3 Full suite green
`make check` (ruff + ruff format + mypy strict + eslint + tsc + pytest + vitest).

## Risks & Trade-offs
- **Improvised quests can be unsatisfiable** (objective the world can't fulfill, e.g. "kill the
  Lich" when no Lich exists). Mitigate: matcher kind whitelist + targets validated against known
  NPC archetypes/items/zones; fall back to a `talk`/`collect` objective the world supports.
- **LLM reward inflation.** Server clamps gold/items by player level/tier; the model's numbers
  are advisory.
- **Migration of in-flight quests.** Old active_quests dicts lack `progress/required` — add
  defaults on load so existing saves don't break.
- **Event volume.** `QuestProgress.on_event` runs per game event; keep matchers O(active
  objectives), which is tiny per player.
- **Scope.** Phases 1–3 deliver the server-authoritative NPC-given core; 4–5 make it visible and
  safe. Could ship 1–3 behind the existing client banner first, then 4.

## Out of Scope
- Quest chains / prerequisites (`required_level` exists but unused — leave a hook, don't build).
- Shared/party quests; time-limited quests; quest abandonment UI (add later).
- Full XP/leveling system — reward schema includes `xp` as a field but applying it can be a
  follow-up if no leveling curve exists yet.

## Outcome

Implemented all 5 phases. Verification: server `ruff` + `mypy --strict` clean (52 files),
`pytest` **221 passed** (was 185 → +36 quest tests); client `tsc --noEmit` clean,
`vitest` **152 passed** (+9 quest tests), `eslint` clean on touched files.

### What shipped
- **Phase 1 — abstract model.** New `world/quests.py`: `QuestObjective` (kind/target/
  required/progress/completed), `QuestReward` (gold/items/xp/description), `QuestInstance`
  with `to_storage_dict`/`to_client_dict`/`from_storage_dict` (legacy-shape migration for
  old `type`/`reward_item` saves). `QUEST_TEMPLATES` (the original 3, now with gold+xp
  rewards) + `instantiate()`/`template_ids()`. Deleted `world/quest_definitions.py`.
- **PlayerData** generalized: `accept_quest(instance)`, `accept_template(id)`,
  `advance_objective`, `all_objectives_complete`, `complete_quest -> QuestReward | None`.
  `to_dict()` now emits camelCase `activeQuests`/`completedQuests` (what the client merge
  reads — the old snake-only keys never reached it) plus snake keys for internal/agent use.
- **Phase 2 — event-driven progress.** New `world/quest_progress.py`: `OBJECTIVE_MATCHERS`
  (kill/collect/talk/reach/enter_dungeon) + `on_event(player, event)` advances every
  matching objective across all active quests, auto-completes, and pays the reward.
  `_norm` treats `_`/space alike so `dire_wolf` matches "Dire Wolf". Handler wired:
  `enemy_killed` on NPC death (fixes the dead kill path, server-side), `dungeon_entered`/
  `item_collected` from dungeon enter/exit, `npc_talked` on every interaction (auto-advances
  "return to giver"). The three bespoke `_handle_*` objective loops were replaced.
- **Phase 3 — NPC generation.** Curated `offer_quest(quest_id)` (dynamic ID list, no
  hardcoding) + improvised `offer_custom_quest(...)` validated/clamped by new
  `agents/quests/generator.py` (`QuestProposal` schema, `clamp_proposal`, async
  `generate_quest` with heuristic fallback, mirroring `combat/loot.py`). `complete_quest`
  now resolves the reward server-side (no item-string param). Fixed the param-key/`player_id`
  wiring bug so agent quest actions finally mutate authoritative state. Personality prompts
  de-hardcoded: generic quest rule in the shared preamble; the 3 quest-givers updated to the
  new tool names/ids. `give_quest`/old `complete_quest` removed from `dialogue.py`.
- **Phase 4 — client de-dup.** `QuestDefinitions.ts` reduced to types + a `toActiveQuest`
  normalizer (accepts snake or camel); deleted the `QUEST_DEFINITIONS` registry and every
  dependency on it. `PlayerState.startQuest(id)` → `acceptQuest(serverInstance)` + a
  `questNameCache` so completed quests still show names without a registry. QuestLog/Tracker
  render `progress/required` counts and the gold+items reward. New `accept_quest`/`grant_xp`
  actions in the protocol + ReactionSystem + WebSocketHandler.
- **Phase 5 — tests.** `test_quests.py`, `test_quest_progress.py`, `test_world_state_quests.py`,
  `test_quest_tools.py` (server); `PlayerStateQuests.test.ts`, `QuestLog.test.ts` (client).

### Deviations from the plan
- **No separate confirm round-trip.** `offer_quest`/`offer_custom_quest` emit an
  `accept_quest` action that adds the quest immediately (server-authoritative), rather than
  a propose→player-confirm→accept handshake. Simpler and reliable; a confirm UI can be
  layered on later as the plan's `accept_quest` message.
- **`offer_custom_quest` takes one objective via scalar args** (kind/target/description/
  required) instead of a nested list, for reliable tool-calling on local models. The
  generator/`clamp_proposal` still support up to 3 objectives for the `generate_quest`
  programmatic path.
- **XP** is surfaced as a `grant_xp` banner action only (no leveling curve yet) — as the
  plan's Out-of-Scope note anticipated.
