# Visual & Agentic Improvements — NPC Text, Length, Animations

> On approval: create branch `feature/agentic-visualisation-improvements`, and commit this plan to the repo as `visual-agentic-improvements.md` (the living design doc the user asked for). All work happens on that branch.

## Context

NPC dialogue today is undifferentiated and too verbose, and animations are mostly stubbed:

- **Too long / no budget**: `respond_node` (`server/src/agents/nodes/respond.py`) returns the LLM's raw text. The only length guidance is the vague "Keep your responses concise but flavourful" line in `reason.py:101`. Responses ramble.
- **Flat text styling**: Every NPC dialogue bubble uses the same cream color (`#e8dcc8`) in `InteractionPanel.ts`. Per-type color logic already exists but **only for action buttons** (`getActionColor()`). A merchant's "selling" line looks identical to a dragon's threat.
- **Broken animation mapping**: `GLTF_CLIP_MAP` (`client/src/entities/NPCModels.ts`) maps **all** emotes (bow, laugh, threaten, dance, cry, cheer) to one `"Wave"` clip. Procedurally, `animateEmote` is a single generic scale-pulse. Combat/heal/quest actions show only an emoji icon (`ActionIcon`) — no body motion. Dialogue triggers no animation at all.

**Goal**: shorter, sharper NPC lines (≤200 chars without lore, ≤500 with lore, prompt-enforced); per-NPC-type and per-action text highlighting plus inline keyword emphasis; and distinct, correctly-mapped procedural animations for emotes and core actions.

**Decisions locked with user**: length = prompt-only (no truncation); highlighting = all three (archetype theme + action-category accent + inline keyword); animation = procedural distinct emotes + action animations (no new GLTF assets required).

---

## Part 1 — Agentic: shorter & better responses (server)

### 1a. Length budget in the prompt (prompt-only)
`server/src/agents/nodes/reason.py`, `_build_system_prompt`:
- The lore block (lines 114–125) already knows whether `lore_entries` is non-empty. Capture that into a local `lore_used` bool.
- Replace the generic instruction (line 101) with an explicit budget tied to `lore_used`:
  - no lore → "Reply in **at most 200 characters**. One or two punchy sentences. No exposition."
  - lore present → "You may use up to **500 characters** since you are sharing lore. Stay tight — only the lore that answers the prompt."
- Also add to `_build_compact_system_prompt` (line 130) a hard "≤200 characters, 1 short sentence" line (compact path never injects lore).
- No truncation in `respond_node` — left as-is per decision. (If we later want a safety net, that's the single insertion point.)

### 1b. "Better responses"
- Tighten `_TOOL_RULES_PREAMBLE` and per-archetype prompts in `personalities/templates.py` to reinforce brevity ("one action + one short line"), reducing the run-on tool narration.
- Verify the budget lines survive both prompt paths and don't fight the "MUST use a tool" rule (keep dialogue short *and* still emit an action).

---

## Part 2 — UI: per-type & per-action text highlighting (client)

All three highlighting modes layer together. Reuse the existing palette in `InteractionPanel.ts` `getActionColor()` (trade=gold `#d4b86a`, combat=red `#f08888`, heal=green `#88ddb0`, quest=blue `#a0b8f0`) — promote it to a shared helper so bubbles and buttons stay consistent.

### 2a. Per-archetype bubble theme
- NPC archetype is available client-side via `NPCInitData.personality` (set on the `NPC` entity as `personalityKey`). Map archetype → accent color (merchant/healer/quest-giver/combat/neutral).
- In `InteractionPanel._renderEntry` (the bubble builder ~lines 507–589), tint the **NPC** bubble's left border / background using that archetype accent instead of the fixed gold.

### 2b. Per-action category accent (this turn's behavior)
- `ReactionSystem.handleResponse` receives `response.actions` alongside `dialogue`. Derive a category from the turn's actions (`offer_item`/`give_item`/`take_item`→trade, `damage`/`defend`→combat, `heal`→heal, `start_quest`/`complete_quest`/`advance_objective`→quest).
- Pass that category into the dialogue render so a line where the merchant actually *sells* gets the trade accent (overrides the baseline archetype tint for that message). Thread it through whatever call currently pushes NPC dialogue into `InteractionPanel`/`ChatPanel` (`WebSocketHandler` / `ReactionSystem`).

### 2c. Inline keyword highlighting
- Add a small formatter that wraps recognized tokens in styled `<span>`s inside the bubble text:
  - **item names + prices** from `offer_item`/`give_item` params → gold;
  - **quest titles** from `start_quest`/`complete_quest` params → blue/bold.
- Drive it from the action params already in the response (no NLP guessing): match the param strings within the dialogue and wrap them. Keep it XSS-safe (escape text, build spans via DOM, not innerHTML concatenation).

> Keep all styling inline via `Object.assign(el.style, …)` to match the codebase convention (no CSS files). Use the `declare field: Type` pattern for any new UIComponent fields.

---

## Part 3 — Animations: distinct emotes + action mapping (client)

### 3a. Distinct procedural emotes
`client/src/entities/NPCAnimator.ts`: today `animateEmote` is one scale-pulse and `AnimationName` is `idle|walk|attack|emote`.
- Carry the specific emote name into the animator (extend `play()` to accept the emote, store `currentEmote`).
- Implement distinct procedural motions in place of the generic pulse, reusing the existing limb/cloak handles (`leftArm`, `rightArm`, `leftLeg`, `cloak`) already wired in the constructor:
  - **bow** → torso/group pitch forward then return; **wave** → one arm raised oscillation; **laugh/cheer** → quick vertical bobs + arms up; **threaten** → lean forward, arm raised, slight shake; **dance** → rhythmic sway + arm swing; **cry** → slumped, slow bob.
- For GLTF-backed NPCs, leave `GLTF_CLIP_MAP` falling back to `Wave` (no assets), but the procedural path now covers the variety. Optionally map any clips that *do* exist by name.

### 3b. Map core actions → body animations (not just icons)
`client/src/systems/ReactionSystem.ts` currently calls `showAction(...)` (icon only) for most kinds. Add a body animation alongside the icon:
- `damage` → attacker NPC plays `attack` (existing lunge in `animateAttack`).
- `heal` / `spawn_effect: holy_light` → a "cast" emote variant (arms raised, sparkle already spawns).
- `emote` → keep `playEmote`, now routing to the specific motion from 3a.
- `start_quest`/`complete_quest` → a gesture (e.g. present/bow) so quest-givers feel reactive.
- Keep the `ActionIcon` emoji as the secondary signal; animation is the primary.

### 3c. Talk animation on dialogue
- When NPC dialogue arrives (the `npc_dialogue` / agent-response path in `WebSocketHandler`/`ChatBubbleSystem`), trigger a brief "talk" motion (subtle head/torso bob for the bubble's lifetime) so NPCs visibly speak. Procedural, time-boxed, returns to idle.

---

## Critical files

**Server**
- `server/src/agents/nodes/reason.py` — budget lines + `lore_used` (Part 1a/1b)
- `server/src/agents/personalities/templates.py` — brevity reinforcement (Part 1b)
- `server/src/agents/nodes/respond.py` — unchanged (single future truncation point, noted)

**Client**
- `client/src/ui/InteractionPanel.ts` — bubble theming, inline keyword spans, shared color helper (Part 2)
- `client/src/ui/ChatPanel.ts` — apply accent color to NPC messages (Part 2)
- `client/src/systems/ReactionSystem.ts` — derive action category, drive animations (Part 2b, 3b)
- `client/src/core/WebSocketHandler.ts` / `client/src/ui/ChatBubbleSystem.ts` — thread category through; talk animation (2b, 3c)
- `client/src/entities/NPCAnimator.ts` — distinct emote motions, talk motion (3a, 3c)
- `client/src/entities/NPC.ts` — `playEmote`/`showAction` pass-through of specific emote; expose archetype accent
- `client/src/entities/NPCModels.ts` — optional GLTF clip name mapping (3a)

---

## Verification

1. **Run both services** (server `python -m uvicorn src.main:app --reload --port 8000`; client `npm run dev`), open `http://localhost:5173`.
2. **Length**: prompt a merchant ("what do you sell?") → line ≤200 chars; ask a lore question ("tell me about Teldrassil") → richer line ≤500 chars. Confirm via on-screen bubble + server log of `dialogue`.
3. **Highlighting**: merchant selling line shows trade-gold accent + highlighted item name/price; sage quest line shows blue accent + highlighted quest title; dragon threat shows red accent. Archetype tint shows on plain chit-chat.
4. **Animations**: trigger each emote (wave/bow/laugh/threaten/dance/cry) and confirm visibly distinct motions; attack an enemy → it lunges; heal → cast gesture; talk → NPC bobs while the bubble is up.
5. **Checks**: `make check` (Ruff + mypy strict + ESLint + tsc strict + Vitest + pytest). Add/extend tests: a server test asserting the budget instruction appears in the built prompt (and the 500 variant when lore is injected); a client test for the action→category mapping and the inline-keyword formatter (XSS-safe).

## Out of scope
- No hard truncation of responses (prompt-only by decision).
- No new GLTF/art assets (procedural only).
- No changes to mood/relationship model or RAG retrieval scoring.
