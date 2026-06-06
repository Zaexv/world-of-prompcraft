# Combat Bug Fixes Plan

**Date:** 2026-06-04  
**Branch:** fix/various-agentic-fixes  
**Research:** `docs/agents/research/2026-06-04-combat-trigger-bugs.md`  
**Scope:** Server (handler, combat tools, world_state) + Client (GameEngine, ReactionSystem)

---

## Problem Summary

Two classes of bugs, both from the same research session:

**Class A — Combat triggers when it shouldn't:**
- `ATTACK_KEYWORDS` (90 words) contains everyday words (`cast`, `charge`, `rush`, `face`,
  `engage`, `invoke`, `burn`, `hurt`, etc.) — any match routes a peaceful prompt through
  the full attack fast-path against ANY NPC, including merchants.
- Hostile NPCs with `"ALWAYS deal_damage"` personality instructions attack on every LLM call,
  even peaceful "hello" (unless short-social bypass kicks in — see Class B).

**Class B — NPC `deal_damage` never actually hits the player (server-side):**
- `deal_damage` tool (`combat.py:31-39`) appends an action with NO `player_id`. Server
  `apply_actions` falls back to `"default"` player — a phantom with 100 HP. Real player HP
  is never decreased from LLM-triggered NPC attacks.
- Short prompts (≤18 chars) bypass tools entirely (`reason.py:242-252`) — hostile NPC
  never fires `deal_damage` at all.
- Dead check runs before client HP sync (`handler.py:782 vs 794`) — server never sees a
  dead player until one full interaction after death.

---

## Root Causes (with file references)

| # | Bug | File | Line |
|---|-----|------|------|
| 1 | `ATTACK_KEYWORDS` 90-word set includes non-combat words | `combat_resolution.py` | 6–91 |
| 2 | Client `ATTACK_KEYWORDS` only 30 words (desync w/ server) | `ReactionSystem.ts` | 25–30 |
| 3 | `deal_damage` action missing `player_id` | `combat.py` | 31–39 |
| 4 | `apply_actions` falls back to phantom "default" player | `world_state.py` | 227–240 |
| 5 | Dead-check before client HP sync | `handler.py` | 782–803 |
| 6 | `short_social` disables tools for short prompts to hostile NPCs | `reason.py` | 242–252 |
| 7 | Client `HOSTILE_NPCS` hardcoded to 2 IDs only | `GameEngine.ts` | 23 |
| 8 | `_update_combat_memory_async` defined but never called | `handler.py` | 708–748 |

---

## Phases

### Phase 1 — Fix `deal_damage` missing `player_id` (server HP never updates) ⭐ critical

**Files:** `server/src/agents/tools/combat.py`, `server/src/agents/registry.py`

**Change in `combat.py`:**  
The tool closure already has `world_state` which contains the current player data via
`_populate_world_snapshot`. Add the player ID to the appended action by reading
`world_state.get("player_id", "")`.

```python
# combat.py — deal_damage tool: add player_id to params
pending_actions.append({
    "kind": "damage",
    "params": {
        "target": target,
        "player_id": world_state.get("player_id", ""),  # ← add this
        "amount": amount,
        "damageType": damage_type,
    },
})
```

**Change in `registry.py:_populate_world_snapshot`:**  
Currently populates `"player"` and `"self_npc_id"`. Add `"player_id"` key:

```python
# registry.py — _populate_world_snapshot
snapshot["player_id"] = player_id  # expose to tool closures
```

**Verification:** After fix, attacking Ignathar should reduce real player HP on server.
Check by running server and printing `_world_state.get_player(player_id).hp` after
a hostile NPC responds.

---

### Phase 2 — Narrow `ATTACK_KEYWORDS` to genuine combat-only words ⭐ core fix

**Files:** `server/src/combat/combat_resolution.py`, `client/src/systems/ReactionSystem.ts`

Remove words that commonly appear in peaceful RPG conversation. The test: "would a player
normally say this word to *greet* or *trade with* an NPC?" If yes, remove it.

**Words to remove from server `ATTACK_KEYWORDS`:**

```python
# REMOVE — ambiguous / non-combat uses too common:
"cast",        # "cast a healing spell on me"
"charge",      # "charge a fee" / "charge this rune"
"face",        # "let's face it" / "face your fears"
"rush",        # "I'm in a rush"
"engage",      # "I'd like to engage in trade"
"confront",    # "I need to confront my past"
"invoke",      # "invoke Elune's blessing"
"channel",     # "channel your energy into healing"
"summon",      # "summon a spirit guide"
"drain",       # "drain my mana to cast this"
"leap",        # "I'll leap across the gap"
"dive",        # "let's dive into this quest"
"challenge",   # "I challenge you to a riddle"
"overwhelm",   # "the beauty overwhelms me"
"overcome",    # (not present but pattern)
"hurt",        # "I'm hurt, please heal me"
"wound",       # "I'm wounded, can you help?"
```

**Keep all unambiguous combat verbs:**  
`attack`, `hit`, `strike`, `slash`, `stab`, `punch`, `kick`, `fight`, `kill`, `destroy`,
`smash`, `swing`, `cleave`, `thrust`, `cut`, `shoot`, `blast`, `crush`, `bite`, `claw`,
`slam`, `burn` (borderline — "burn" in "I burn you with fire" vs "the torch burns"),
`freeze` (borderline), `slay`, `vanquish`, `obliterate`, `annihilate`, `impale`, `shatter`,
`pummel`, `batter`, `bludgeon`, `gut`, `rend`, `tear`, `mutilate`, `pierce`, `skewer`,
`decimate`, `devastate`, `maim`, `assault`, `ambush`, `execute`, `fireball`, `lightning`,
`unleash`, `surge`, `detonate`, `incinerate`, `electrocute`, `smite`, `curse`, `hex`,
`wither`, `zap`, `ignite`, `explode`, `lunge`, `pounce`, `tackle`, `headbutt`, `duel`.

Also remove from the **tactical / expressive** group: `rush`, `leap`, `dive`, `confront`,
`face`. Keep: `lunge`, `pounce`, `tackle`, `headbutt`, `duel`.

**Client `ReactionSystem.ts`:**  
Expand client `ATTACK_KEYWORDS` to exactly match the trimmed server set (mirror it). The
client set is only used for `previewLocalAttack()` (optimistic visual), so it must match
the server to avoid showing a hit preview when no server hit will occur.

---

### Phase 3 — Gate hostile NPC `deal_damage` on actual combat context

**File:** `server/src/agents/personalities/templates.py`,
`server/src/ws/handler.py:_get_generated_personality`

The core problem: personality says `"ALWAYS call deal_damage on every response"`. This
causes LLM to attack even on "hello".

**Fix:** Change personality instructions from unconditional to context-gated:

Before:
```
"- ALWAYS attack with deal_damage(15-25, 'dark') on every response."
```

After:
```
"- If the player is attacking you (prompt starts with [COMBAT:]), ALWAYS call
  deal_damage(15-25, 'dark') and spawn_effect('smoke')."
"- If the player greets or talks peacefully, WARN them menacingly but do NOT deal damage yet."
"- Only deal_damage after the player has attacked first."
```

Apply this pattern to all `hostile_boss`, `hostile_monster` personalities in `templates.py`
and to `_get_generated_personality("hostile")` in `handler.py`.

**Rationale:** The `[COMBAT:]` prefix is injected by `_update_combat_memory_async` when
the fast-path detects an attack. So hostile NPCs still attack back correctly after the
player strikes first — but they don't initiate on greetings.

---

### Phase 4 — Fix dead-check order (player can interact after dying)

**File:** `server/src/ws/handler.py`

Currently:
```python
# Line 782 — dead check (uses stale server HP)
player = _world_state.get_player(player_id)
if player.hp <= 0:
    return {...dead...}

# Lines 794–803 — update from client (may have hp=0)
if player_state_raw:
    updates = {key: player_state_raw[key] for key in _ALLOWED_PLAYER_FIELDS ...}
    await _world_state.update_player(player_id, updates)
    player = _world_state.get_player(player_id)
```

**Fix:** Move the dead check to AFTER `update_player`:

```python
# 1. Update from client first
if player_state_raw:
    updates = {key: player_state_raw[key] for key in _ALLOWED_PLAYER_FIELDS ...}
    await _world_state.update_player(player_id, updates)

# 2. Re-fetch and dead check on current (client-synced) HP
player = _world_state.get_player(player_id)
if player.hp <= 0:
    return {...dead...}
```

---

### Phase 5 — Fix `short_social` bypassing tools for hostile NPCs

**File:** `server/src/agents/nodes/reason.py`

Short prompts (≤18 chars) always disable tools. This means "hello" to Ignathar → no
`deal_damage`. Aggressive NPCs should never enter short-social mode.

**Fix:** Pass NPC archetype or a `"combat_enabled"` flag into the reason node. Short-social
is disabled when the NPC archetype is `hostile_boss` or `hostile_monster`:

In `registry.py:_build_input_state` (or via `world_context`), add:
```python
world_context["npc_archetype"] = npc_archetype  # from world_state.get_npc()
```

In `reason.py:reason_node`:
```python
archetype = state.get("world_context", {}).get("npc_archetype", "")
hostile_archetype = archetype in ("hostile_boss", "hostile_monster")
short_social = (
    not hostile_archetype
    and len(prompt_stripped) <= 18
    and not _ACTION_INTENT_PATTERNS.search(prompt_stripped)
)
```

---

### Phase 6 — Dynamic `HOSTILE_NPCS` on client (combat HUD shows for all hostile NPCs)

**File:** `client/src/core/GameEngine.ts`, `client/src/state/NPCState.ts`

Current hardcoded set only shows combat HUD for `dragon_01` and `guard_01`. Other hostile
NPCs attack the player without any HUD feedback.

**Fix:** Remove hardcoded set. Derive "is hostile" from the NPC's server-sent data.

In `WebSocketHandler.ts`, when NPC state update is received (including `archetype` or
`mood` fields), update `npcStateStore`. When NPC is clicked in `GameEngine.ts`,
check NPC state for hostile archetype:

```typescript
// GameEngine.ts — replace hardcoded HOSTILE_NPCS check
const npcState = d.npcStateStore.getState(npcId);
const isHostile = npcState?.archetype?.includes("hostile") 
    || npcState?.mood === "angry";
if (isHostile) {
    d.uiManager.showCombatHUD(npcId, npcName, npcState?.hp ?? 100, npcState?.maxHp ?? 100);
}
```

Requires server to send `archetype` in NPC state payloads. `NPCData.to_dict()` already
includes `archetype` — verify it's sent in `npc_actions` / `agent_response` `npcStateUpdate`.

---

### Phase 7 — Wire `_update_combat_memory_async` (restore relationship tracking)

**File:** `server/src/ws/handler.py`

`_update_combat_memory_async` is defined but never called. When a player attacks an NPC,
the NPC never updates its `relationship_score` (no `reflect_node` runs via fast-path).
The NPC "forgets" being attacked between sessions.

**Fix:** After sending the immediate hit response (after `npc_actions` is sent at line 900),
fire `_update_combat_memory_async` as a background task:

```python
# handler.py — after npc_actions sent (line ~923, after player_damage_actions = [])
if _combat_resolution is not None and attacked_npc and attacked_npc.hp > 0:
    task = asyncio.create_task(
        _update_combat_memory_async(player_id, npc_id, _combat_resolution, prompt)
    )
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)
```

This keeps the fast-path instant (no LLM wait) while still updating NPC memory/mood in
the background. The comment in `_update_combat_memory_async` references `_fast_combat_reaction`
— update it to reference `_basic_combat_reply`.

---

## Execution Order

| Priority | Phase | Effort | Risk |
|----------|-------|--------|------|
| P0 | Phase 1 — `deal_damage` player_id | Low | Low — 2-line fix |
| P0 | Phase 4 — Dead-check order | Low | Low — reorder 2 blocks |
| P1 | Phase 2 — Narrow ATTACK_KEYWORDS | Medium | Medium — may miss some valid attacks |
| P1 | Phase 3 — Gate hostile deal_damage | Medium | Medium — LLM prompt change |
| P2 | Phase 5 — short_social archetype gate | Low | Low — single flag |
| P2 | Phase 7 — Wire combat memory | Low | Low — background task only |
| P3 | Phase 6 — Dynamic HOSTILE_NPCS | Medium | Low — UI only |

---

## Affected Files

**Server**
- `server/src/agents/tools/combat.py` — add `player_id` to damage action (P1)
- `server/src/agents/registry.py` — expose `player_id` in world_snapshot (P1)
- `server/src/world/world_state.py` — optional: warn when "default" fallback triggers (P1)
- `server/src/ws/handler.py` — dead-check order (P4), wire memory update (P7)
- `server/src/agents/nodes/reason.py` — archetype gate on short_social (P5)
- `server/src/agents/personalities/templates.py` — gate deal_damage on [COMBAT:] (P3)
- `server/src/combat/combat_resolution.py` — trim ATTACK_KEYWORDS (P2)

**Client**
- `client/src/systems/ReactionSystem.ts` — mirror trimmed ATTACK_KEYWORDS (P2)
- `client/src/core/GameEngine.ts` — dynamic hostile detection (P6)

---

## Tests

- `server/tests/test_combat_resolution.py` — verify removed keywords no longer trigger
  `is_attack_prompt`; verify kept keywords still do.
- `server/tests/test_handler.py` (or new) — verify `deal_damage` action includes
  `player_id` after registry invoke; verify real player HP decreases.
- `server/tests/test_world_state.py` — verify `apply_actions` targets correct player
  when `player_id` is present.
- `client/src/__tests__/CombatOutcomes.test.ts` — update to cover trimmed keyword set.
