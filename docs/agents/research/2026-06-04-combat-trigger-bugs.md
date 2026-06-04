---
date: 2026-06-04T13:46:23.287413+00:00
git_commit: f6a4fd03a648998a085d0bf5c49efa555833e6d8
branch: fix/various-agentic-fixes
topic: "Why does combat trigger unexpectedly when interacting with NPCs?"
tags: [research, codebase, combat, npc-agents, reaction-system, attack-keywords]
status: complete
---

# Research: Unexpected Combat Triggers on NPC Interaction

## Research Question

When players interact with random NPCs — especially aggressive ones — combat triggers unexpectedly. The player attacks NPCs they didn't mean to, and NPCs attack the player when the player was just talking. Why does this happen?

---

## Summary

There are **four independent root causes**, each producing different symptoms. They compound: a player can accidentally trigger one path and then all four pile on.

1. **`ATTACK_KEYWORDS` is too broad** — 90 words including common conversation words. Any match instantly routes the interaction through the attack fast-path against *any* NPC.
2. **Hostile NPC personalities include `"ALWAYS deal damage"` instructions** — the LLM calls `deal_damage` on peaceful greetings because the system prompt orders it to.
3. **Procedural hostile NPCs inherit the same `"ALWAYS deal damage"` personality** — spawned via `_get_generated_personality("hostile")` in `handler.py`.
4. **Client `HOSTILE_NPCS` is a hardcoded 2-element set** — determines when the combat HUD appears, completely decoupled from which NPCs actually attack.

---

## Detailed Findings

### Root Cause 1: Overly Broad `ATTACK_KEYWORDS` Set

**File:** `server/src/combat/combat_resolution.py:6-91`

`is_attack_prompt()` (line 176) splits the prompt on whitespace and checks for any word match against `ATTACK_KEYWORDS`. The set contains 90 words, including many that appear in normal conversation:

| Keyword | Innocent use |
|---------|-------------|
| `cast` | "can you cast a heal on me?" |
| `charge` | "charge a fee / charge this rune" |
| `face` | "let's face this together" |
| `rush` | "I'm in a rush, quick question" |
| `burn` | "burn this torch" |
| `freeze` | "freeze — wait a second" |
| `engage` | "I'd like to engage in trade" |
| `challenge` | "I challenge you to a riddle" |
| `invoke` | "invoke the gods' blessing" |
| `channel` | "channel your inner calm" |
| `summon` | "summon a spirit for guidance" |
| `drain` | "drain my mana to cast this" |
| `leap` | "I'll leap across the gap" |
| `dive` | "dive into this quest with me" |
| `confront` | "I need to confront my fears" |
| `overwhelm` | "the beauty overwhelms me" |
| `wound` | "I'm wounded, please help" |
| `hurt` | "I'm hurt, can you heal me?" |

**Code path triggered by `is_attack_prompt()` returning `true`:**

```
handler.py:809 → is_attack_prompt(prompt)
  → resolve_combat() [handler.py:827]   ← player's attack resolves against the NPC
  → apply_actions([damage_action])       ← NPC HP mutated immediately
  → npc_actions sent instantly           ← client shows damage number
handler.py:936 → is_attack_prompt(prompt) again
  → _basic_combat_reply()               ← NPC fires counter-attack
  → agent_response with NPC damage action sent
```

This entire chain fires for ANY NPC — including merchants, healers, and quest givers — as long as one word matches.

**Where the check lives (called twice):**
- `handler.py:809` — player's attack resolution
- `handler.py:936` — NPC counter-attack via `_basic_combat_reply()`

---

### Root Cause 2: Hostile NPC Personalities Force `deal_damage` on Every Response

**Files:**
- `server/src/agents/personalities/templates.py:59-70` (Ignathar, hostile_boss)
- `server/src/agents/personalities/templates.py:588-592` (hostile monsters)
- `server/src/agents/personalities/templates.py:629-636` (Thornwood Behemoth)

When a player sends a *non-attack* prompt (doesn't match `ATTACK_KEYWORDS`), it routes through the full LLM pipeline (`_registry.invoke()`). For NPCs with `hostile_boss` or `hostile_monster` archetype, their personality system prompt contains:

```
"- On EVERY combat interaction, you MUST call deal_damage targeting 'player'..."
"- ALWAYS attack with deal_damage(15-25, 'dark') on every response."
"- ALWAYS attack with deal_damage(25-45, 'physical') per response."
```

The LLM interprets "every response" literally and calls `deal_damage` even when the player says "hello" or "can we trade?". The `act_node` (`agents/nodes/act.py:36-53`) executes whatever tool calls the LLM emits — there's no guard against `deal_damage` being called on non-combat turns.

**Affected NPCs by personality key (from `templates.py`):**
- `dragon_01` — Ignathar, archetype `hostile_boss`
- `shade_lurker` — archetype `hostile_monster`, `"ALWAYS attack... on every response"`
- `shadow_slime` — archetype `hostile_monster`, same
- `thornwood_behemoth` — archetype `hostile_boss`, same
- `goblin_ambusher` — archetype `hostile_monster`, attacks if refused gold
- `fire_elemental` — archetype `hostile_monster`, same

**Special case — volatile_pyromancer (`templates.py:465-466`):**
```
"- If challenged or insulted, ATTACK immediately (deal_damage 20-35, type 'fire')."
```
The LLM decides what counts as "challenged or insulted", and it often interprets casual remarks as provocation.

---

### Root Cause 3: Procedurally Spawned Hostile NPCs Also Force `deal_damage`

**File:** `server/src/ws/handler.py:1178-1195`

`_get_generated_personality("hostile")` builds a personality string containing:

```python
f"- ALWAYS call deal_damage targeting 'player' with {damage_range[0]}-{damage_range[1]} {damage_type} damage.\n"
```

This affects all NPCs registered via `_auto_register_procedural_npc()` (IDs starting with `proc_` or `enc_`) that have `behavior == "hostile"`. The `archetype` is set to `"hostile_monster"` by default (`handler.py:293`).

Additionally, `_handle_explore_area()` (`handler.py:1148-1175`) creates NPCs with `behavior == "hostile"` based on client-sent data:
```python
npc = NPCData(
    npc_id=npc_id,
    ...
    hp=60 if behavior == "hostile" else 80,
)
```
But `archetype` is not set here — it defaults to empty string, which falls back to `_PACIFIST_PROFILE` in `_basic_combat_reply()` (harmless for fast-path), but the personality string from the explore NPC data will still contain `"ALWAYS deal damage"` if `behavior == "hostile"`.

---

### Root Cause 4: Client `HOSTILE_NPCS` Set is Hardcoded and Stale

**File:** `client/src/core/GameEngine.ts:23`

```typescript
const HOSTILE_NPCS = new Set(['dragon_01', 'guard_01']);
```

This set controls only the **combat HUD visibility** — whether the side-by-side unit frames appear when clicking an NPC. It does **not** control whether damage is applied; that happens through `ReactionSystem.processAction()` regardless.

Result:
- Player clicks `shade_lurker` (hostile_monster) → no combat HUD shown, but NPC deals damage
- Player clicks `guard_01` → combat HUD shown even for peaceful trade requests
- `guard_01` is not in any hostile personality (its archetype is `neutral_guard`, which fights back only if provoked) but it always gets the combat UI

The `HOSTILE_NPCS` set is never updated at runtime based on server-side archetype or relationship score.

---

### Supporting Findings

#### `_fast_combat_reaction` and `_update_combat_memory_async` Are Never Called

**File:** `server/src/ws/handler.py:590-748`

Both functions are defined but have zero call sites. The comment in `_update_combat_memory_async` reads:
> "The player already received their combat response from `_fast_combat_reaction`."

But `_fast_combat_reaction` is also uncalled. The current combat path uses `_basic_combat_reply()` instead. Consequence: after a player attacks an NPC, `reflect_node` never runs — the `relationship_score` is **not updated** to remember the attack. The NPC "forgets" it was attacked between sessions.

#### `reflect.py` `_HOSTILE_WORDS` Can Degrade Relationship on Normal Speech

**File:** `server/src/agents/nodes/reflect.py:10-32, 173-207`

`_HOSTILE_WORDS` includes `"burn"`, `"die"`, `"hate"`, `"crush"`. Each match subtracts 2 from `relationship_score`. The words `"die"` and `"burn"` appear in everyday fantasy speech ("don't let these flames burn out", "I'd rather die than fail this quest"). Over many interactions, this can push `relationship_score` below -20 (HOSTILE tier) or -50 (ENEMY tier), causing future LLM calls to have instructions like:

```
"ENEMY — This player is your sworn foe. Attack on sight."
```
— `reason.py:79-82`

At ENEMY tier, the LLM in `reason_node` receives an explicit "attack on sight" instruction in its system prompt, which causes it to call `deal_damage` even on the first message of a new interaction.

#### `_basic_combat_reply` Applies to ALL Archetypes

**File:** `server/src/ws/handler.py:131`

```python
profile = _COMBAT_PROFILES.get(npc.archetype, _PACIFIST_PROFILE)
```

Friendly archetypes fall back to `_PACIFIST_PROFILE` (0 damage, cry emote). So accidental attack fast-path on a merchant won't counter-damage the player — but the player's attack damage still lands on the merchant and can kill them.

#### Client `ATTACK_KEYWORDS` Set Differs From Server's

**Client:** `client/src/systems/ReactionSystem.ts:25-30` — ~30 keywords  
**Server:** `server/src/combat/combat_resolution.py:6-91` — ~90 keywords

The client's set is used only for `isAttackPrompt()` → `previewLocalAttack()` (cosmetic optimistic hit preview). The server's larger set drives actual combat resolution. For any keyword on the server but not on the client, the server applies damage but no preview animation plays.

---

## Code References

- `server/src/combat/combat_resolution.py:6-91` — `ATTACK_KEYWORDS` set (90 words)
- `server/src/combat/combat_resolution.py:176-178` — `is_attack_prompt()` implementation
- `server/src/ws/handler.py:809` — first `is_attack_prompt()` gate (player attack fast-path)
- `server/src/ws/handler.py:936` — second `is_attack_prompt()` gate (NPC counter-attack)
- `server/src/ws/handler.py:125-161` — `_basic_combat_reply()` — maps archetype to counter-attack profile
- `server/src/ws/handler.py:40-105` — `_COMBAT_PROFILES` — archetype-to-counter-attack mapping
- `server/src/ws/handler.py:590-706` — `_fast_combat_reaction()` — **defined but never called**
- `server/src/ws/handler.py:708-748` — `_update_combat_memory_async()` — **defined but never called**
- `server/src/ws/handler.py:1178-1195` — `_get_generated_personality("hostile")` — `"ALWAYS deal_damage"` in personality
- `server/src/ws/handler.py:278-309` — `_auto_register_procedural_npc()` — defaults archetype to `"hostile_monster"`
- `server/src/agents/personalities/templates.py:59-70` — Ignathar's `"MUST call deal_damage"` instruction
- `server/src/agents/personalities/templates.py:588-592` — shade_lurker `"ALWAYS attack"` instruction
- `server/src/agents/personalities/templates.py:629-636` — thornwood_behemoth `"ALWAYS attack"` instruction
- `server/src/agents/nodes/reason.py:79-82` — ENEMY tier → `"Attack on sight"` in system prompt
- `server/src/agents/nodes/reflect.py:10-32` — `_HOSTILE_WORDS` — includes `"burn"`, `"die"`, `"hate"`
- `server/src/agents/nodes/reflect.py:173-207` — `_compute_relationship_delta()` — hostile word → -2/word
- `server/src/agents/nodes/act.py:36-53` — executes all tool calls without filtering
- `client/src/core/GameEngine.ts:23` — `HOSTILE_NPCS = new Set(['dragon_01', 'guard_01'])` hardcoded
- `client/src/core/GameEngine.ts:220-225` — combat HUD shown only for HOSTILE_NPCS members
- `client/src/systems/ReactionSystem.ts:25-30` — client ATTACK_KEYWORDS (30 words, subset of server's 90)
- `client/src/systems/ReactionSystem.ts:275` — unconditional `playerState.takeDamage(amount)` for `target === "player"`

---

## Architecture Documentation

### Combat Pipeline (current state)

```
Player types prompt
  │
  ├─ is_attack_prompt(prompt)?  [handler.py:809]
  │     YES → resolve_combat() → apply_actions (NPC HP) → npc_actions (instant)
  │           → _basic_combat_reply() → NPC counter-attack in agent_response
  │     NO  → _registry.invoke() (full LangGraph pipeline)
  │               reason_node → LLM with personality+tools
  │               act_node    → executes tool_calls (including deal_damage)
  │               respond_node → extracts dialogue
  │               reflect_node → updates mood + relationship_score
  │
  └─ agent_response sent → client WebSocketHandler → reactionSystem.handleResponse()
        → processAction() per action
             damage + target=player → playerState.takeDamage()
             damage + target=npcId  → NPC HP display update
```

### NPC Archetype → Combat Behavior Matrix

| Archetype | Attack fast-path counter | LLM pipeline behavior |
|-----------|--------------------------|----------------------|
| `hostile_boss` | `_COMBAT_PROFILES["hostile_boss"]` (24-36 fire) | "MUST deal_damage every response" |
| `hostile_monster` | `_COMBAT_PROFILES["hostile_monster"]` (12-20 physical) | "ALWAYS attack every response" |
| `volatile_pyromancer` | `_COMBAT_PROFILES["volatile_pyromancer"]` (20-30 fire) | "attack if challenged/insulted" |
| `neutral_guard` | `_COMBAT_PROFILES["neutral_guard"]` (14-22 physical) | fights back if attacked/provoked |
| `friendly_merchant` | `_PACIFIST_PROFILE` (0 damage) | never fights |
| `friendly_healer` | `_PACIFIST_PROFILE` (0 damage) | never fights |
| `eccentric_archmage` | `_COMBAT_PROFILES["eccentric_archmage"]` (16-24 arcane) | retaliates if rude |

### Client Combat UI Triggers

The combat HUD (`CombatHUD.ts`) appears when:
1. Player clicks an NPC in the hardcoded `HOSTILE_NPCS` set (`GameEngine.ts:23`)
2. Any NPC fires a `damage` action → player HP bar decreases visually (but HUD may not be shown)

The combat HUD does NOT appear when:
- A non-HOSTILE_NPCS NPC calls `deal_damage` via LLM pipeline
- A player accidentally triggers `is_attack_prompt` against a merchant and takes counter-damage

---

## Open Questions

1. Why are `_fast_combat_reaction` and `_update_combat_memory_async` defined but never called? Are they intended for future use or leftover from a refactor?
2. Should relationship score degradation from `_HOSTILE_WORDS` be gated on whether the NPC has combat capability (archetype-based)?
3. Should `HOSTILE_NPCS` on the client be populated dynamically from server NPC archetype data instead of hardcoded?
4. Should the attack fast-path check NPC archetype before allowing the player's attack to resolve — e.g., prevent attacks against `friendly_merchant` archetypes?
5. Is there a way to scope "ALWAYS deal_damage" personality instructions to only fire when `[COMBAT:]` context is present (i.e., after the player already attacked)?

---

## Follow-up Research: Why `deal_damage` Never Hits the Player

### Bug A: `deal_damage` tool omits `player_id` → server damages phantom "default" player

**File:** `server/src/agents/tools/combat.py:31-39`

When an NPC agent calls `deal_damage(target="player", amount=X)` via the LLM pipeline, the action appended to `pending_actions` is:

```python
{
    "kind": "damage",
    "params": {
        "target": "player",
        "amount": amount,
        "damageType": damage_type,
        # player_id is ABSENT
    }
}
```

When `registry.py:234-236` calls `self._world_state.apply_actions(pending)`, `world_state.py:227` does:

```python
pid = params.get("player_id", "")  # → ""
player = self.get_player(pid or "default")  # → creates/uses phantom "default" PlayerData
player.hp = max(0, player.hp - amount)
```

**`get_player("default")` creates a brand-new `PlayerData()` object** (`world_state.py:122-125`):
```python
def get_player(self, player_id: str) -> PlayerData:
    if player_id not in self.players:
        self.players[player_id] = PlayerData()  # phantom with 100 HP
    return self.players[player_id]
```

The real player's server-side HP is **never modified** by LLM `deal_damage`.

**Contrast with `_basic_combat_reply` (fast-path counter-attack)** at `handler.py:142-152`:
```python
actions.append({
    "kind": "damage",
    "params": {
        "target": "player",
        "player_id": player_id,   # ← INCLUDED — correct player is targeted
        "amount": amount,
        "damageType": profile["type"],
    },
})
```
This path correctly targets the real player on the server.

**Client-side behaviour (same in both paths):**
`ReactionSystem.ts:275` calls `this.playerState.takeDamage(amount)` whenever `target === "player"`. So the player's HP bar DOES decrease visually. But the server's authoritative HP doesn't change from LLM-triggered damage — it stays at whatever was synced from the client at the start of the interaction.

**Consequence:** Death can only be detected server-side if the client re-syncs its lowered HP on the next interaction. Server dead-check at `handler.py:782-791` runs BEFORE the client-HP-sync at `handler.py:794-803`, so a player who died client-side from NPC LLM attacks can still interact on the server once more before the stale HP is corrected.

---

### Bug B: Short prompts (≤18 chars) bypass tools entirely — hostile NPC never attacks

**File:** `server/src/agents/nodes/reason.py:242-252`

```python
short_social = len(prompt_stripped) <= 18 and not _ACTION_INTENT_PATTERNS.search(prompt_stripped)
...
active_llm = llm if short_social else llm_with_tools
```

Prompts like `"hello"`, `"hi"`, `"what's up?"` (≤18 characters, no action keywords) use `llm` — the plain LLM **without tools bound**. The LLM cannot emit tool calls. `_should_act_or_respond` sees `tool_calls = []` and routes directly to `respond_node`. No `deal_damage` fires. The hostile NPC gives a dialogue response but applies **zero damage**.

This means saying "hello" to Ignathar the dragon produces roleplay text ("You dare enter my lair?") but no HP loss, while saying "what do you think of this cave you live in?" (21 chars) with tools enabled may trigger damage.

---

### Bug C: `deal_damage` internal snapshot update doesn't reach the real WorldState

**File:** `server/src/agents/tools/combat.py:43-47`

```python
if target == "player":
    player = world_state.get("player", {})           # tool-closure snapshot dict
    current_hp = player.get("hp", 100)
    player["hp"] = max(0, current_hp - amount)
    world_state["player"] = player
```

`world_state` here is the **per-NPC tool-closure `world_snapshot`** dict populated by `registry.py:_populate_world_snapshot()` — a plain Python dict, not the live `WorldState` object. This update only affects the LLM's local view of the world (so subsequent tool calls in the same turn see the reduced HP). The real server HP update relies entirely on `registry.py:apply_actions(pending)`, which hits Bug A.

---

### Code References (follow-up)

- `server/src/agents/tools/combat.py:31-39` — `deal_damage` action missing `player_id`
- `server/src/world/world_state.py:122-125` — `get_player()` creates phantom on unknown ID
- `server/src/world/world_state.py:227-240` — `apply_actions` falls back to `"default"` player
- `server/src/ws/handler.py:142-152` — `_basic_combat_reply` DOES include `player_id` (correct)
- `server/src/agents/nodes/reason.py:242-252` — `short_social` flag disables tools for short prompts
- `server/src/agents/registry.py:234-236` — calls `apply_actions` on real WorldState with pending actions
- `server/src/ws/handler.py:782-803` — dead-check runs before client HP sync (order bug)
