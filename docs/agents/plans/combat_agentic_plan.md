---
date: 2026-05-31T21:35:18.095173+00:00
git_commit: dee9fe859151f706d39d3c434450687c66248c45
branch: main
topic: "Combat latency split and prompt-driven combat"
tags: [plan, combat, latency, npc, visuals, animation, hud]
status: draft
---

# Combat Agentic Implementation Plan

## Overview

Make combat feel immediate, easy to trigger from natural language, and visually punchy. The plan is to split combat resolution from full agent latency, compute damage from prompt quality plus gear quality, and let NPCs respond with outcome-aware combat narration instead of generic flavor text.

## Current State Analysis

- `server/src/ws/handler.py:588-795` already detects attack prompts and applies damage before agent invocation, but the interaction still waits on `_registry.invoke(...)` and the shared semaphore before the client gets a response.
- `client/src/core/WebSocketHandler.ts:192-297` only renders the visible combat result after `agent_response`, so the hit is still gated by the slowest server step.
- `server/src/agents/tools/combat.py:21-122` already exposes combat tools, but the damage model is still flat and not yet driven by a richer combat-resolution object.
- `server/src/agents/personalities/templates.py:7-18,84-102` currently couples NPC output to tool use and generic behavior rules, but it does not yet describe outcome-aware combat narration.
- `client/src/systems/ReactionSystem.ts:121-260`, `client/src/ui/CombatHUD.ts:38-197`, and `client/src/ui/DamagePopup.ts:30-75` already have the basic hooks needed for HP updates, combat logs, popups, flashes, and defeat handling.
- `client/src/entities/NPCAnimator.ts:80-213` and `client/src/entities/NPC.ts:193-200` already support attack/emote motion, so combat animation can reuse the current animation surface instead of introducing a new system.

### Key discoveries

- Combat is already partially authoritative on the server; the main problem is orchestration latency, not missing core damage plumbing.
- The client already has enough presentation plumbing to make combat feel good if the server sends richer outcome data.
- The fastest path is to add a combat-specific resolution layer and let narration follow the hit, not hold it back.

## Desired End State

- A player can type a natural-language attack and see the hit resolve immediately.
- Combat damage scales with prompt quality, weapon quality, and relevant gear.
- NPCs answer with what happened in the fight: glancing blow, block, crit, finisher, defeat, or retreat.
- Combat feedback looks and feels dramatic: hit bursts, screen shake/flash, damage popups, HP bar motion, combat log lines, and NPC attack/emote motion.
- Non-combat dialogue keeps using the normal agent flow.

### UI Mockup

```text
+--------------------------------------------------------------+
| Player HP 78/100   | NPC HP 42/60   | Combat Log             |
|--------------------------------------------------------------|
| > You lunge in with the iron dagger.                        |
| > Clean hit! Aurelia reels back.                            |
| > -18 damage  (gold popup, spark burst, short screen shake) |
+--------------------------------------------------------------+
                [NPC attack pose]  [impact flash]
```

## What We're NOT Doing

- We are not turning the game into a fully turn-based battle UI.
- We are not replacing free-form prompt combat with button-only abilities.
- We are not adding a brand-new animation engine or heavy VFX pipeline before reusing the current hooks.
- We are not changing merchant/trade behavior in this plan.

## Implementation Approach

1. Detect combat intent early from free-form text.
2. Resolve the damage immediately on the server before any full agent wait.
3. Return a compact combat result that the client can render right away.
4. Let the agent produce follow-up narration that reflects the actual outcome.
5. Reuse the current HUD, popup, animator, and reaction systems for the visual side.

```text
prompt -> combat intent -> immediate resolution -> client VFX/HUD
                                   ↘ async narration ↙
```

## Architecture and Code Reuse

- Reuse `ReactionSystem.processAction()` for HP changes, floating text, flashes, kill handling, and effect playback.
- Reuse `NPCAnimator.play('attack')` and `NPCAnimator.play('emote')` for attack windup/recoil and reaction motion.
- Reuse `CombatHUD` and `DamagePopup` for the combat frame, crit presentation, and log lines.
- Reuse `server/src/agents/tools/combat.py` as the existing combat tool surface, but move outcome calculation into a dedicated resolver.
- Reuse the current `spawn_effect` effect presets in `ReactionSystem.ts` for fire, ice, lightning, sparkle, smoke, and holy hits.
- Add one shared combat resolver module so prompt scoring, gear scaling, and outcome classification live in one place instead of being duplicated in the handler.

### Affected file tree

```text
server/src/ws/handler.py                 # fast combat path + async narration handoff
server/src/combat/combat_resolution.py   # new combat scoring / damage / outcome logic
server/src/agents/personalities/templates.py  # combat narration rules
client/src/core/WebSocketHandler.ts      # immediate combat payload routing
client/src/systems/ReactionSystem.ts      # effect, flash, popup, and animation mapping
client/src/entities/NPCAnimator.ts       # attack/emote motion reuse
client/src/ui/CombatHUD.ts               # stronger combat log and unit-frame feedback
client/src/ui/DamagePopup.ts             # crit / finisher popup styling
```

## Phase 1: Split combat from full agent latency

### Overview

Make attack prompts resolve on the server immediately, without waiting for the full agent round trip. The agent becomes a narration layer, not the mechanical source of truth.

### Changes Required

- [ ] 1. Add a dedicated combat resolution helper
  **File**: `server/src/combat/combat_resolution.py`
  **Changes**: Introduce a compact `CombatIntent` / `CombatOutcome` / `CombatResolution` model that classifies attack prompts, computes base damage, stores prompt quality, and emits a client-friendly combat payload.

  ```python
  @dataclass
  class CombatResolution:
      prompt_quality: float
      base_damage: int
      final_damage: int
      damage_type: str
      outcome: str
      combat_text: str
      visual_tags: list[str]
  ```

- [ ] 2. Short-circuit combat before the semaphore and full agent call
  **File**: `server/src/ws/handler.py`
  **Changes**: Classify natural-language attacks early, apply damage immediately, and return a combat response without waiting on `_registry.invoke(...)`. Keep the agent only for optional follow-up narration.

- [ ] 3. Add a narration follow-up path that never blocks the hit
  **File**: `server/src/ws/handler.py`
  **Changes**: If the full agent completes, use its output as after-the-hit flavor text or a reaction line. Do not delay the damage result waiting for it.

### Success Criteria

#### Automated Verification

- [ ] `make typecheck`
- [ ] `make test`
- [ ] A server test proves attack prompts return a combat result before the agent timeout path.

#### Manual Verification

- [ ] A normal attack prompt shows damage immediately.
- [ ] The NPC can still say something afterward, but the hit itself no longer waits on the AI response.

---

## Phase 2: Make damage scale with prompt quality and gear

### Overview

Give combat a readable damage curve: better prompts and better gear should hit harder, while vague prompts or weak gear should hit softer.

### Changes Required

- [ ] 1. Score prompt quality with permissive natural-language intent detection
  **File**: `server/src/combat/combat_resolution.py`
  **Changes**: Accept ordinary combat verbs and weapon language such as `hit`, `slash`, `stab`, `shoot`, `burn`, `smash`, and `cast` so combat is easy to trigger without special syntax.

- [ ] 2. Fold gear and weapon quality into the damage formula
  **File**: `server/src/combat/combat_resolution.py`
  **Changes**: Combine base damage, weapon tier, enchantments, prompt quality, crit chance, and target defenses into one deterministic formula.

  ```text
  final_damage = max(1, round((base + weapon + gear_bonus) * prompt_multiplier * crit_multiplier - armor))
  ```

- [ ] 3. Classify outcome types for downstream narration and visuals
  **File**: `server/src/combat/combat_resolution.py`
  **Changes**: Emit stable outcome tags such as `glancing_hit`, `clean_hit`, `critical_hit`, `blocked`, `parried`, `resisted`, `finisher`, and `defeated`.

- [ ] 4. Add unit coverage for the combat math
  **File**: `server/src/combat/tests/test_combat_resolution.py`
  **Changes**: Cover weak prompt vs strong prompt, low gear vs high gear, crits, blocks, and minimum-damage behavior.

### Success Criteria

#### Automated Verification

- [ ] `make typecheck`
- [ ] `make test`
- [ ] Combat math tests prove prompt and gear quality change the result in the expected direction.

#### Manual Verification

- [ ] A weak weapon with a vague prompt deals noticeably less damage than a strong weapon with a precise prompt.
- [ ] A clearly good attack prompt consistently feels stronger than a generic one.

---

## Phase 3: Make combat visually loud and satisfying

### Overview

Turn combat into a strong visual event using the client hooks that already exist: hit bursts, flashes, motion, popups, sound, and HP feedback.

### Changes Required

- [ ] 1. Map combat outcomes to richer client effects
  **File**: `client/src/systems/ReactionSystem.ts`
  **Changes**: Use outcome tags to choose flashes, popup size, log text, hit color, and effect presets. Critical hits should feel bigger than normal hits, and blocks/parries should read clearly.

- [ ] 2. Trigger animation and reaction motion from combat results
  **Files**: `client/src/entities/NPCAnimator.ts`, `client/src/entities/NPC.ts`
  **Changes**: Reuse the current attack/emote animation path for windup, strike, recoil, and defeat moments. If a GLTF animation exists, map it into the same `attack` / `emote` interface; otherwise use the procedural motion already in place.

- [ ] 3. Make the HUD feel punchier during combat
  **Files**: `client/src/ui/CombatHUD.ts`, `client/src/ui/DamagePopup.ts`
  **Changes**: Emphasize crits, finisher hits, and defeats with larger popups, stronger colors, and clearer combat-log phrasing. Keep the unit-frame HP bars and flash behavior as the core feedback loop.

- [ ] 4. Add optional camera and audio impact cues
  **Files**: `client/src/systems/ReactionSystem.ts`, `client/src/audio/effects.ts`
  **Changes**: Add a light camera kick, hit SFX, and element-specific impact sounds so combat feels like an event instead of a log line.

### Success Criteria

#### Automated Verification

- [ ] `make typecheck`
- [ ] `make test`
- [ ] Client tests cover the new outcome-to-effect mapping if a mapping helper is extracted.

#### Manual Verification

- [ ] A critical hit looks visibly bigger than a normal hit.
- [ ] NPC attacks play a clear motion cue.
- [ ] Damage popups, HP flashes, and combat logs all update on the same hit.

---

## Phase 4: Make NPCs respond to what actually happened

### Overview

NPC dialogue should describe the combat result instead of generic combat chatter. The response should reflect the prompt, the gear, and the outcome.

### Changes Required

- [ ] 1. Rewrite combat prompt rules to speak from the combat result
  **File**: `server/src/agents/personalities/templates.py`
  **Changes**: Add combat-specific guidance that tells the agent to paraphrase the actual result: hit landed, armor absorbed it, crit landed, enemy staggered, enemy fled, or enemy died.

- [ ] 2. Pass the combat summary into the NPC response
  **File**: `server/src/ws/handler.py`
  **Changes**: Include prompt quality, weapon name, damage type, outcome tag, and remaining HP in the narration context so the NPC can say what happened on that turn.

- [ ] 3. Keep the response style tied to the NPC personality
  **File**: `server/src/agents/personalities/templates.py`
  **Changes**: Make the same combat result sound hostile, frightened, bragging, or defeated depending on the NPC archetype and remaining health.

### Success Criteria

#### Automated Verification

- [ ] `make typecheck`
- [ ] `make test`
- [ ] A response test proves combat narration contains the actual outcome tag instead of generic filler.

#### Manual Verification

- [ ] After a hit, the NPC line clearly describes whether the blow landed, was blocked, or crit.
- [ ] The NPC reaction changes when the prompt is strong versus weak.

---

## Phase 5: Verify, tune, and roll out

### Overview

Prove that the fast combat path, the damage curve, and the visuals all work together without regressing the normal dialogue path.

### Changes Required

- [ ] 1. Add server integration tests for the combat fast path
  **File**: `server/tests/test_combat_flow.py`
  **Changes**: Verify that combat returns immediately, damage persists, and async narration cannot block the hit.

- [ ] 2. Add client coverage for the new response rendering
  **File**: `client/src/__tests__/combat-response.test.ts`
  **Changes**: Verify that outcome tags produce the right log line, popup, and animation triggers.

- [ ] 3. Run a low-gear / high-gear playtest pass
  **Files**: `server/src/combat/combat_resolution.py`, `client/src/systems/ReactionSystem.ts`
  **Changes**: Tune the multiplier ranges until the damage curve is readable and satisfying in live play.

- [ ] 4. Confirm normal conversation still uses the full agent pipeline
  **Files**: `server/src/ws/handler.py`, `client/src/core/WebSocketHandler.ts`
  **Changes**: Verify that non-combat prompts still follow the existing agent-driven flow.

### Success Criteria

#### Automated Verification

- [ ] `make check`
- [ ] Combat tests pass.
- [ ] Client tests pass.

#### Manual Verification

- [ ] Combat feels immediate with no visible AI delay on the hit.
- [ ] Strong gear plus a strong prompt produces bigger numbers and louder effects.
- [ ] Weak gear plus a vague prompt still works, but feels clearly weaker.

## Testing Strategy

### Unit Tests

- [ ] Prompt classification tests for obvious combat verbs and weapon phrases.
- [ ] Damage math tests for gear scaling, crits, blocks, and minimum damage.
- [ ] Outcome classification tests for hit / block / parry / defeat cases.

### Integration Tests

- [ ] Server interaction test that sends an attack prompt and checks that damage is returned immediately.
- [ ] Client response test that confirms outcome tags trigger the right popup and log behavior.

### Manual Testing Steps

1. Attack an NPC with a plain prompt and weak gear, then compare the number and visual impact.
2. Repeat with a precise prompt and better gear, and confirm the hit looks and reads stronger.
3. Try a block or miss-style prompt and confirm the NPC response says what happened.
4. Trigger a kill and confirm the defeat flourish, HP drop, and final narration all align.

## Performance Considerations

- The combat fast path should avoid the full LLM wait so the visible hit is no longer tied to agent latency.
- The new resolver should stay deterministic and cheap; no expensive model calls on the mechanical path.
- Visual effects should reuse existing client hooks and short-lived DOM/Three.js objects to avoid GC pressure.

## Migration Notes

- Existing combat prompts will keep working because the new path should remain permissive.
- The current `agent_response` handling can stay in place for non-combat flow; the combat path just gains a faster mechanical branch.
- If narration follow-up is added asynchronously, stale results should be ignored when the player has already moved on to another interaction.

## References

- `server/src/ws/handler.py:588-795` - current attack handling and agent wait path.
- `client/src/core/WebSocketHandler.ts:192-297` - current response rendering path.
- `server/src/agents/tools/combat.py:21-122` - existing combat tools.
- `server/src/agents/personalities/templates.py:7-18,84-102` - shared tool preamble and merchant/combat rules.
- `client/src/systems/ReactionSystem.ts:121-260` - current combat reaction and effect pipeline.
- `client/src/entities/NPCAnimator.ts:80-213` - existing attack/emote animation support.
- `client/src/entities/NPC.ts:193-200` - NPC animation entry points.
- `client/src/ui/CombatHUD.ts:38-197` - combat HUD and log surface.
- `client/src/ui/DamagePopup.ts:30-75` - floating damage popup behavior.
