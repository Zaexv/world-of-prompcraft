---
date: 2026-06-05T00:00:00.000000+00:00
git_commit: 01907fb
branch: main
topic: "NPC Dialogue Reliability — Separate the Reasoning Channel from the Speaking Channel + Memory Compaction"
tags: [plan, agents, langgraph, dialogue, memory, reliability]
status: done
---

# NPC Dialogue Reliability Plan

## Problem
NPCs frequently reply with the literal string `"..."` after a long conversation.

`"..."` is `EMPTY_DIALOGUE` (`server/src/agents/nodes/constants.py:5`). It surfaces whenever the
reasoning LLM returns an assistant message with **empty `content`** on a turn that emits no tool
action:

1. `reason_node` makes the single LLM call (`reason.py:257`). Its `content` *is* the dialogue.
2. `respond_node` makes **no LLM call** — it only reads `last_message.content`
   (`respond.py:14-15`); empty content → `EMPTY_DIALOGUE`.
3. On a pure-talk turn (no `pending_actions`), `fallback_node` has no action line to substitute
   (`fallback.py:13-14`, `dialogue_fallback.py:23`), so `"..."` reaches the player.

### Root cause
The node named "respond" does not respond. Dialogue is a **side-effect of the thinking call**. One
LLM call must reason, select tools, *and* compose the in-character line — all inside the
`response_max_tokens = 180` budget (`config.py:51`). Reasoning/tool-selection tokens crowd out the
visible answer, especially as the prompt grows. Two factors make it worse over a long chat:

- **Tight shared budget.** 180 output tokens cover thinking + speaking. Reasoning ("thinking")
  models burn it before emitting prose — already documented in `config.py:41-45`.
- **Unbounded memory.** `messages` uses the `add_messages` reducer (`agent_state.py:9`) and is
  append-only — nothing is ever removed. Only a read-side `[-8:]` slice bounds the prompt
  (`reason.py:175`). The `conversation_summary` exists (`summarize.py:85`, fed into the prompt at
  `reason.py:67-71`) but never trims the stored transcript. As history grows, the prompt stays dense
  and the 180-token completion is squeezed harder.

## Design — mirror how GPT/Gemini stay coherent
Industry reasoning models keep two things separate:

1. **A reasoning channel distinct from the answer channel.** Thinking has its own budget; it never
   starves the visible answer.
2. **Compacted memory.** A rolling summary ("saved ideas") + recent verbatim turns, not the full
   transcript. Context stays bounded so quality is flat at turn 3 or turn 300.

We map both onto the existing graph:

- **Part A — Make `respond` a real speaking step.** `reason`/`act` think and run tools; their prose
  is no longer the source of truth for what the player hears. `respond_node` makes a dedicated,
  tool-free LLM call whose only job is one in-character line, from a compact prompt
  (persona + mood + relationship + summary + recent tail + a digest of the actions just taken). Its
  own 180-token budget is plenty for one sentence and is never polluted by reasoning, so it
  essentially always produces text.
- **Part B — Compact memory.** After summarizing, prune the stored `messages` channel
  (`RemoveMessage`) to a bounded tail. The summary preserves older content; the prompt stays small.

The current graph wiring (`reason → (act → reason)* → respond → fallback → reflect →
(summarize)?`) is **unchanged**. `fallback_node` stays as the ultimate safety net.

### Latency guard (fast path)
A naive "always make a second LLM call" doubles latency on every chat turn. To keep NPCs responsive
in a real-time game, `respond_node` uses a fast path:

- **Pure-chat turn, reason produced non-empty prose, no tools fired** → reuse `reason`'s text
  (1 LLM call, the common case — unchanged latency).
- **Tools fired this turn, OR reason returned empty/`"..."`** → make the dedicated speak call so the
  line is consistent with the actions taken and never blank.

This recovers the reported failure (long pure-chat → empty → now a fresh focused speak call) and
guarantees clean narration on action turns, without doubling latency on every turn.

## Current State Analysis
- `server/src/agents/npc_agent.py:54-83` — builds nodes; `respond_node` is a bare function (no LLM).
- `server/src/agents/nodes/respond.py` — raw `last_message.content` extraction; emits
  `EMPTY_DIALOGUE` on empty.
- `server/src/agents/nodes/reason.py:27-141` — `_build_system_prompt` (persona, mood, relationship
  tier, summary, notes, RAG, length budget). `_length_budget_instruction` (reason.py:144-158) is the
  reusable length rule.
- `server/src/agents/nodes/summarize.py` — `make_summarize_node` writes `conversation_summary` only;
  `route_after_reflect` gates it (≥10 human turns, every 3rd). No transcript pruning.
- `server/src/agents/agent_state.py:8-24` — `NPCAgentState`; `messages` uses `add_messages` (supports
  `RemoveMessage` deletion-by-id).
- `server/src/agents/registry.py:228-268` — `agent.ainvoke`; reads `result["response_text"]`; caches
  only non-empty, non-`"..."`, action-free replies.
- `server/src/agents/nodes/dialogue_fallback.py` + `fallback.py` — action-kind → short line; safety
  net. **Keep.**
- Existing tests: `server/tests/domains/agents/test_ellipsis_fix.py` asserts `respond_node` is
  raw-extraction-only (will change), `test_summarization_routing.py` covers `route_after_reflect`
  (must stay green).

## Desired End State
- An NPC never sends `"..."` on a normal turn; long conversations stay coherent.
- `reason`/`act` own the reasoning channel; `respond` owns the speaking channel via a focused LLM
  call with the action digest.
- Stored per-NPC `messages` are bounded; long-term memory lives in `conversation_summary`.
- Pure-chat latency unchanged (fast path); only action/empty turns pay the extra speak call.
- No change to `response_max_tokens` — separation makes 180 sufficient per focused call.

## Implementation Approach

### Phase 1: Speaking channel (`respond` becomes an LLM node)

#### [x] 1.1 Add an action digest + speak prompt builder
**File**: `server/src/agents/nodes/respond.py` (or new `speak_prompt.py`)
**Changes**:
- `_action_digest(pending_actions) -> str`: human-readable one-liner of what the tools just did,
  e.g. `"You just: gave the player a Health Potion; dealt 20 damage."` Map by `kind` (give_item,
  give_gold, complete_purchase, sell_item, deal_damage, heal_target, start_quest, complete_quest,
  apply_status, …). Empty string when no actions.
- `_build_speak_prompt(state) -> str`: compact system prompt = persona + `## Mood` +
  `## Relationship` tier (reuse the tiers from `reason.py:78-97`) + `## Memory` (summary) +
  `## Personal Notes` + the action digest + a length instruction reusing
  `_length_budget_instruction(lore_used=False)`. Keep it small — this is the speak channel, not the
  reasoning channel. Factor the relationship-tier text out of `reason.py` into a shared helper so it
  is defined once.

#### [x] 1.2 Convert `respond_node` into an LLM speak node
**File**: `server/src/agents/nodes/respond.py`, `server/src/agents/npc_agent.py`
**Changes**:
- Replace `respond_node` with `make_respond_node(llm)` closure (mirrors `make_reason_node` /
  `make_summarize_node`). Bind **no tools** to this LLM.
- Logic:
  - Determine `tools_fired = bool(state.get("pending_actions"))` for this turn.
  - `raw = getattr(last_message, "content", "")`.
  - **Fast path**: if `raw` non-empty and not `EMPTY_DIALOGUE` and not `tools_fired` → return
    `{"response_text": raw, "pending_actions": pending}` (no LLM call).
  - **Speak path** (tools fired, or `raw` empty/`"..."`): call
    `llm.ainvoke([SystemMessage(_build_speak_prompt(state)), *recent_tail, HumanMessage(player_prompt)])`.
    On non-empty content → use it. On empty/exception → leave `EMPTY_DIALOGUE` so `fallback_node`
    can still substitute an action line.
  - `recent_tail`: last ~4 messages (reuse a small slice; do not resend tool scaffolding the model
    doesn't need).
- `npc_agent.py:61` → `graph.add_node("respond", make_respond_node(llm))`.

#### [x] 1.3 Keep `fallback_node` as the safety net
**File**: none (verify only)
**Changes**: No code change. After 1.2, `fallback_node` only fires when the speak call also came back
empty — preserves the action-line behaviour and the `test_fallback_*` tests.

### Phase 2: Memory compaction (bound the stored transcript)

#### [x] 2.1 Prune `messages` after summarizing
**File**: `server/src/agents/nodes/summarize.py`
**Changes**:
- After writing `conversation_summary`, emit `RemoveMessage(id=...)` for all but the last
  `_KEEP_RECENT_MESSAGES` (e.g. 6) messages, so the `add_messages` reducer deletes them from the
  checkpointed channel. Import `RemoveMessage` from `langchain_core.messages`.
- Only prune messages that carry a stable `id` (LangChain messages do); skip any without one.
- Never prune the current exchange — keep at least the last human + AI pair. Pruning runs on the
  same cadence as summarization (`route_after_reflect`), so older turns are folded into the summary
  *before* they are dropped — no information loss.
- Return shape: `{"conversation_summary": ..., "messages": [RemoveMessage(...), ...]}`.

#### [x] 2.2 Confirm summary reaches the speaking channel
**File**: `server/src/agents/nodes/respond.py`
**Changes**: `_build_speak_prompt` already includes `conversation_summary` (1.1). Verify it is read
from `state` so compacted long-term memory survives pruning and informs the spoken line.

### Phase 3: Tests

#### [x] 3.1 Rewrite `respond_node` tests for the speak node
**File**: `server/tests/domains/agents/test_ellipsis_fix.py` (+ maybe new `test_respond_speak.py`)
**Changes**:
- Fast path: non-empty reason prose + no pending actions → returned verbatim, **0** LLM calls
  (assert mock `ainvoke` not called).
- Speak path on empty: reason content empty, no tools → speak LLM called once → its text returned.
- Speak path on action turn: pending actions present → speak LLM called; assert the action digest
  text is present in the system prompt passed to `ainvoke`.
- Speak call empty/raises → `response_text == EMPTY_DIALOGUE` so `fallback_node` still applies.
- Keep all `fallback_line` / `fallback_node` tests unchanged (behaviour preserved).

#### [x] 3.2 Memory compaction tests
**File**: `server/tests/domains/agents/test_summarization_routing.py` (extend) or new
`test_memory_compaction.py`
**Changes**:
- `summarize_node` returns `RemoveMessage` entries trimming to the configured tail; current exchange
  preserved.
- `route_after_reflect` thresholds still behave (no regression).
- `_action_digest` maps known kinds and returns `""` for none.

#### [x] 3.3 Full suite green
**Command**: `make check` (ruff + ruff format --check + mypy strict + eslint + tsc + pytest +
vitest). Resolve mypy `type-arg` / `Any` per repo conventions.

## Risks & Trade-offs
- **Extra LLM call on action/empty turns** → added latency there. Mitigated by the pure-chat fast
  path (1.2) so the common case is unchanged. Accepted: reliability is the explicit goal.
- **Pruning could drop unsummarized context** if pruning ran without summarizing. Mitigated by
  gating pruning on the summarize cadence (2.1) so content is folded into the summary first.
- **`RemoveMessage` + `MemorySaver`**: standard LangGraph pattern, but verify deletion-by-id works
  with the checkpointer in an integration test (Phase 3).
- **Speak prompt drift from persona**: the speak prompt is a compact subset of the reasoning prompt;
  factor the relationship tiers into one shared helper (1.1) so the two prompts can't diverge.
- **No token-budget change** is intentional — if a *local thinking* model still returns empty on the
  speak call, `ollama_reasoning_effort="none"` (`config.py:46`) already disables thinking; document
  this as the lever rather than raising `response_max_tokens`.

## Out of Scope
- Raising `response_max_tokens` or adding per-channel token configs (rejected — band-aid).
- A reason-side retry loop (superseded by the dedicated speak node).
- Changing the WS fast-path `"..."` semantics in `handler.py` (intentional "ignore irrelevant
  message" signal — separate concern).

## Outcome (done — branch `feature/npc-dialoge-reliability`)

Implemented on `feature/npc-dialoge-reliability`. `make check` green: **155 passed**, ruff + ruff
format + mypy strict + eslint + tsc all clean.

### What shipped
- **New** `server/src/agents/nodes/prompt_parts.py` — `relationship_tier(score)` and
  `length_budget_instruction(lore_used)` extracted from `reason.py` so the reasoning and speaking
  prompts share one definition and cannot drift.
- **Rewrote** `server/src/agents/nodes/respond.py` — `make_respond_node(llm)` (tool-free speak
  channel) + public `action_digest(pending_actions)` + `build_speak_prompt(state)`. Fast path reuses
  reason's prose on a pure-chat, no-action turn (no extra LLM call); speak path fires on action turns
  or empty/`"..."` content. Empty/exception → leaves `EMPTY_DIALOGUE` so `fallback_node` still applies.
- `server/src/agents/npc_agent.py` — wires `make_respond_node(llm)`.
- `server/src/agents/nodes/__init__.py` — exports `make_respond_node` (was `respond_node`).
- `server/src/agents/nodes/reason.py` — uses the shared helpers; dropped the inlined tier block and
  `_length_budget_instruction`.
- `server/src/agents/nodes/summarize.py` — `_KEEP_RECENT_MESSAGES = 6`; `_prune_messages` emits
  `RemoveMessage` for older id-bearing messages; pruning runs **only after** a summary is written so
  older turns are captured first.
- Tests: rewrote the `respond` suite in `test_ellipsis_fix.py` (fast-path = 0 calls, speak path on
  empty/ellipsis/action, empty-reply→fallback, action_digest); added compaction tests in
  `test_summarization_routing.py` (prune-to-tail, no-prune-when-short, skip-ids-absent).

### Deviations from the plan
- Names are public (`action_digest`, `build_speak_prompt`) rather than `_`-prefixed, so tests import
  them directly.
- Speak path sends a fixed `_SPEAK_DIRECTIVE` HumanMessage plus the recent tail (last 4 messages with
  content) instead of re-extracting the raw player prompt — the human prompt is already in the tail.
- Pruning is gated inside the summary-success branch (stronger guarantee than the plan's "same
  cadence"): a failed summary round prunes nothing, so no turn is dropped before it is summarized.

### Known limitation
- `RemoveMessage` pruning only deletes messages carrying a stable `id`. LangChain assigns ids on
  messages produced through the model, so live transcripts prune; messages constructed without ids
  (some tests) are left in place by design.
