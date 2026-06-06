---
date: 2026-06-05T00:00:00.000000+00:00
git_commit: 490eb35
branch: feature/npc-dialoge-reliability
topic: "NPC Tool-Call Leaks (Ollama) + Long-Conversation Breakdown — Fix Plan"
tags: [plan, agents, langgraph, ollama, tool-calls, memory, reliability]
status: draft
---

# NPC Dialogue Reliability — Tool-Call Leaks + Long-Context Breakdown

**Date:** 2026-06-05
**Branch:** `feature/npc-dialoge-reliability`
**Builds on:** `2026-06-05_npc-dialogue-reliability-plan.md` (DONE — separated speaking
channel + memory compaction). This plan tackles the *next* layer: tool-call syntax leaking
into chat on the Ollama path, and NPCs breaking down over long conversations.

## Scope — two linked failure classes (Ollama/local-model path)

1. **Leaked / half-finished tool calls** — NPC tool-call syntax (whole or truncated)
   appears inside the spoken dialogue shown to the player.
2. **NPC "goes crazy" on long conversations** — after many turns with the same NPC the
   agent breaks, repeats itself, ignores context, or sticks in a hostile/garbled state.

Most visible with the default provider (`llm_provider="ollama"`, `qwen3.5:9b`) because local
models emit tool calls as plain text and the memory machinery compounds errors over turns.
Claude/OpenAI users hit a subset (mainly memory-drift items 2C–2E).

---

## 1. Current architecture (recap)

Per-NPC LangGraph `StateGraph` (`server/src/agents/npc_agent.py:33`):

```
START → reason → [act ↔ reason loop] → respond → fallback → reflect → [summarize?] → END
```

- **reason** (`nodes/reason.py:188`) — system prompt + LLM call (tool-bound unless `short_social`);
  for local models parses inline plain-text tool calls via `extract_inline_tool_calls`.
- **act** (`nodes/act.py:13`) — runs structured `tool_calls`, appends `ToolMessage`s, harvests
  `pending_actions`, loops back to reason.
- **respond** (`nodes/respond.py:155`) — speaking channel. Fast path reuses reason prose; slow path
  makes a dedicated tool-free call and sanitises via `_clean_speak_text`.
- **fallback** (`nodes/fallback.py:10`) — action-derived line when dialogue empty/`"..."`.
- **reflect** (`nodes/reflect.py:249`) — heuristic mood/relationship/notes (no LLM).
- **summarize** (`nodes/summarize.py:85`) — folds older turns into `conversation_summary`, prunes
  the channel.

State persists per `thread_id = f"{npc_id}_{player_id}"` via in-memory `MemorySaver`
(`npc_agent.py:82`). `add_messages` auto-assigns ids, so `RemoveMessage` pruning works.

Inline parsing (`nodes/inline_tools.py`) handles: `name(args)`, `<toolname>…</toolname>`,
`(name: args)`, `*name args*`.

---

## 2. Root causes (with evidence)

### Problem 1 — leaked / half tool calls

- **1A. Qwen `<tool_call>{json}</tool_call>` wrapper not parsed.** Qwen2.5/Qwen3 emit tool calls as a
  `<tool_call>` block wrapping `{"name":…,"arguments":{…}}`. Ollama's `/v1` shim does not reliably
  convert these to structured `tool_calls`; they land in `content`. `_make_tag_pattern`
  (`inline_tools.py:30`) matches only `<toolname>` where the tag *is* the tool name, so `<tool_call>`
  is never matched and the JSON body never parsed → whole block leaks.
- **1B. Truncated / unclosed calls (the literal "halfway").** `response_max_tokens: 180`
  (`config.py:51`) is tiny; a text-emitted call gets cut mid-write: `deal_damage(target=player,
  amount=2` (no `)`). The function-call regex requires a closing paren (`inline_tools.py:27`); a
  truncated `<tool_call>{"name":"deal_da…` also won't match → half-call renders verbatim.
- **1C. Fast path skips sanitisation.** `respond.py:172-173` returns `raw` reason prose unmodified;
  `_clean_speak_text` runs only on the slow path (`respond.py:185`). Any leak surviving reason passes
  straight to the player.
- **1D. Reason de-leaks only when no structured tool_calls.** `reason.py:229` runs `_run_inline_tools`
  only when `not structured`; a structured call accompanied by stray text in `content` is never cleaned.

### Problem 2 — "crazy" on long conversations

- **2A. Message window slices tool-call pairs → malformed sequence → hard error (highest impact).**
  `_select_reasoning_messages` returns `messages[-8:]` raw (`reason.py:138-141`). The act↔reason loop
  persists `AIMessage(tool_calls=…)` + matching `ToolMessage`s (`act.py:49`). As history grows the cut
  can start on an orphan `ToolMessage` (no preceding assistant `tool_calls`) or end on an `AIMessage`
  with `tool_calls` lacking results. OpenAI-compatible endpoints reject both → exception caught at
  `registry.py:230` → `"The NPC seems lost in thought..."`. More actions + longer convo = higher rate.
- **2B. Prune keeps last N of *any* type.** `_prune_messages` (`summarize.py:69`) keeps
  `_KEEP_RECENT_MESSAGES = 6` regardless of role; the retained tail can begin with an orphan
  `ToolMessage`, feeding 2A next turn.
- **2C. Summary telephone-game drift + hard truncation.** `summarize_node` folds `previous_summary` +
  recent transcript, re-summarizes, hard-slices `summary[:500]` mid-sentence (`summarize.py:111`),
  re-feeds it as `previous_summary`. Fires every 3rd turn once `human_count >= 10` (`summarize.py:46`).
  Per-message content truncated to 200 chars (`summarize.py:65`). Errors compound → contradictions,
  cut-off fragments, hallucinated "memories" → erratic replies.
- **2D. Response cache ignores conversation state.** Cache key = `npc|player|prompt|hp|zone`
  (`registry.py:207-209`); no summary/turn component. Repeating a phrase ("hello") after a long convo
  returns the *first* cached reply forever (`registry.py:264`), bypassing the graph.
- **2E. mood/relationship pin at clamp bounds; notes truncate wrong end.** `relationship_score` clamps
  to [-100,100] (`reflect.py:270`); `_build_personality_note` hard-truncates to 300 chars keeping the
  *front* (`reflect.py:243-244`) — drops the *newest* observations despite the "keep oldest" comment.
  Heavy combat/insult talk floors the score and pins mood hostile, so the NPC stays aggressive even on
  friendly prompts.
- **2F. Growing system prompt vs fixed 180-token output (amplifier).** As convo grows the system
  prompt swells (summary ≤500 + notes ≤300 + lore + history) while output stays 180 → more
  truncated/empty completions → more fallback and more half tool-calls (feeds 1B).

---

## 3. Goals / non-goals

**Goals**
- No tool-call syntax (whole or partial) in player-facing dialogue on the Ollama path.
- No hard API errors from malformed message windows on long conversations.
- Long-term memory degrades gracefully, not into nonsense.
- Keep latency and token budgets roughly where they are; no provider lock-in.

**Non-goals**
- Durable per-player memory across server restarts (MemorySaver stays in-memory) — future work.
- Swapping the LLM abstraction / leaving the ChatOpenAI adapter.
- Turning reflect into an LLM call.

---

## 4. Phased implementation

Ordered impact-to-risk. Each phase independently shippable and testable. Phases 1–3 are the
high-value bug fixes; 4–6 harden long-term behaviour.

### Phase 1 — Tool-pair-aware message windowing (fixes 2A, 2B; highest impact)

**Files:** `nodes/reason.py`, `nodes/summarize.py`, new `nodes/message_window.py`.

1. New pure helper `safe_tail(messages, max_messages)` in `message_window.py`:
   - take raw `[-max:]`;
   - drop leading `ToolMessage`s whose parent `AIMessage(tool_calls)` is outside the window
     (no orphan tool start);
   - if the last message is an `AIMessage` with `tool_calls` whose `ToolMessage` results are absent,
     drop it (no dangling tool_calls end);
   - detect type via both `getattr(m, "type", None)` and dict `m.get("role")` (match existing dual
     checks at `reason.py:201-206`); pair via `tool_call_id` ↔ `call["id"]`;
   - guarantee at least the latest human message is retained (degenerate-window guard).
2. `reason.py:138-141` — `_select_reasoning_messages` calls `safe_tail(...)`.
3. `summarize.py:69-82` — `_prune_messages` adjusts the kept boundary so the retained tail never
   begins on an orphan `ToolMessage` (extend backward to include the parent `AIMessage`); emit
   `RemoveMessage` only before the adjusted boundary.

**Tests** (`tests/domains/agents/test_message_window.py` new; extend `test_summarization_routing.py`):
window starting mid-pair → valid start; window ending on dangling tool_calls → dropped; dict + object
forms; no-tool case == `[-N:]`; prune that would orphan a tool tail.

**Verify:** scripted ≥15-turn combat convo vs a stub LLM emitting tool calls each turn → no exception
to `registry.invoke`; every LLM message list well-formed.

### Phase 2 — Parse Qwen `<tool_call>{json}` + truncated calls (fixes 1A, 1B)

**Files:** `nodes/inline_tools.py`, `tests/domains/agents/test_inline_tools.py`.

In `extract_inline_tool_calls`:
1. **`<tool_call>` JSON wrapper** — match `<tool_call>\s*(\{.*?\})\s*</tool_call>` (DOTALL) plus an
   unterminated `<tool_call>` (truncation). `json.loads` body (accept single object or array); read
   `name` + `arguments`/`parameters`; validate `name` ∈ `params_by_tool`; coerce via existing
   `_assign_args`/`_coerce`. On `JSONDecodeError` strip the fragment (don't render), log debug.
2. **Bare JSON object form** (optional) — `{… "name":"<known>" …}` behind known-name validation.
3. **Truncated sweep (final safety net)** — for known names + literal `tool_call`, strip to EOS any
   opened-but-unclosed `name(`, `<tool_call>`/`<toolname>`, or `*name ` so half-calls never reach the
   player. Gate strictly on known names so prose with innocent parens survives.
4. Keep `(cleaned_text, calls)` contract.

**Tests:** well-formed wrapper (single+array); wrapper amid prose; truncated wrapper; unclosed
`deal_damage(target=player`; bare JSON; malformed JSON inside wrapper (stripped, no crash); innocent
parentheses preserved.

### Phase 3 — Sanitise fast path + cache by conversation state (fixes 1C, 1D, 2D)

**Files:** `nodes/respond.py`, `nodes/reason.py`, `registry.py`.

1. `respond.py:172-173` — run `_clean_speak_text(raw, params_by_tool)` on the fast path before
   returning; if cleaning empties it, fall through to the slow speak path.
2. `reason.py:227-246` — when structured `tool_calls` present, still run the cleaning pass over
   `content` (reuse `extract_inline_tool_calls`, discard `calls`, keep `cleaned`) so stray inline
   syntax beside a structured call is stripped before becoming the spoken line.
3. `registry.py:207-209` — **skip the cache once a thread has memory** (non-empty
   `conversation_summary` or messages beyond the opening turn). The cache only dedupes identical
   first-contact greetings; later replies are state-dependent and must not be stale. Narrow the
   docstring to say so. (Alternative: fold a summary hash into the key — heavier, less safe.)

**Tests:** fast path with leaked `emote('wave')` → clean output; fast path cleaned-to-empty → slow
path engages; cache hit on fresh thread, re-invoke after summary exists.

### Phase 4 — Graceful summary & notes compaction (fixes 2C, 2E)

**Files:** `nodes/summarize.py`, `nodes/reflect.py` (optional `agent_state.py`).

1. **Sentence-boundary trim** helper replacing `summary[:500]` (`summarize.py:111`) and the notes cut
   (`reflect.py:243-244`): trim to the last sentence end (`. `/`! `/`? `) ≤ cap, else word boundary,
   never mid-word. Fix notes to drop the *oldest* observations (front), keeping the newest tail
   (observations are appended) — correcting the current behaviour vs its comment.
2. **Throttle re-summarisation** — change `route_after_reflect` (`summarize.py:37`) to fire on a
   rising edge (minimum new human turns since last summary) instead of every 3rd turn forever, cutting
   fold-cycle drift. Keep `_SUMMARIZE_THRESHOLD = 10` as the entry gate. If a counter is needed, add
   `summary_turn_marker: int` to `NPCAgentState` (default 0, documented); prefer a message-count-derived
   approach to avoid new state.
3. Strengthen `_SUMMARIZE_PROMPT` to copy stable facts forward verbatim and only append deltas.

**Tests:** summary ends on sentence boundary; notes overflow drops oldest, keeps newest; summarize
does not fire consecutively once throttled, still fires after enough new turns.

### Phase 5 — Output-budget headroom + `<think>` strip (mitigates 1B, 2F; Ollama)

**Files:** `config.py`, `nodes/reason.py` (and/or `provider.py`).

1. Give the *reason* call (may emit tool calls) more `max_tokens` than the *respond* call (only
   speaks) — per-invoke override or two model handles — so calls aren't truncated mid-emission.
   (Cheaper alternative: bump `response_max_tokens` 180→~256 globally.)
2. Add a `<think>…</think>` strip in `reason.py` before other processing, since
   `ollama_reasoning_effort="none"` (`provider.py:58-59`) may be ignored by the `/v1` shim.

**Tests:** `<think>` stripped from content; settings load smoke test.
**Verify:** manual run vs the friend's local Ollama model over ~10 action turns — no truncated calls,
no `<think>` leakage.

### Phase 6 — Recursion / loop guard (defensive)

**Files:** `npc_agent.py`, `registry.py`.

1. Pass explicit `recursion_limit` on `agent.ainvoke` (`registry.py:229`) so a looping model fails
   fast into the existing graceful `except` instead of an odd default-25 blow-up.
2. Optionally cap act↔reason iterations: per-turn `act_count` in state, route reason→respond once a
   small cap (≈3) is hit, so a stuck tool-calling model still speaks.

**Tests:** stub LLM that always returns tool_calls → bounded LLM-call count, non-empty dialogue.

---

## 5. Cross-cutting verification

1. `rtk make check` (ruff + ruff format --check + mypy strict + eslint + tsc + pytest + vitest).
2. New `tests/domains/agents/test_long_conversation.py`: drive one NPC 30+ turns (chat + tool calls +
   insults) with a scripted LLM; assert across the run: no exception to `registry.invoke`; every
   dialogue free of tool residue (`<tool_call>`, `name(`, `*name `); `conversation_summary` never ends
   mid-word; `relationship_score` recovers after a friendly turn following a hostile streak.
3. Manual Ollama repro — **confirm the friend's exact `ollama_model` first** (qwen3.5 vs qwen2.5 vs
   llama changes which inline shape dominates).

---

## 6. Sequencing & effort

| Phase | Fixes | Risk | Effort | Order |
|-------|-------|------|--------|-------|
| 1 — windowing | 2A, 2B | med | M | 1 |
| 2 — Qwen/truncation parse | 1A, 1B | low | M | 2 |
| 3 — fast-path clean + cache | 1C, 1D, 2D | low | S | 3 |
| 4 — summary/notes compaction | 2C, 2E | low | M | 4 |
| 5 — budget + `<think>` | 1B, 2F | low | S | 5 |
| 6 — recursion guard | crazy-loop | low | S | 6 |

Phases 1–3 deliver the bulk of the user-visible fix (no leaks, no hard breaks, no stale replies);
4–6 harden long-term behaviour.

## 7. Risks & mitigations

- **Window helper over-trims → empty window.** Always retain ≥ the latest human message; unit-test the
  degenerate case.
- **Truncation sweep eats legit prose with parens.** Gate strictly on known tool names + literal
  `tool_call`; tests for innocent parentheses.
- **Cache disable adds latency** for repeated greetings. Acceptable: correctness over a saved
  round-trip; first-contact greetings still cached.
- **Budget bump raises Ollama cost/latency.** Prefer the asymmetric reason-vs-respond budget over a
  blanket increase.

## 8. Out of scope / future work

- Durable DB-backed per-player memory surviving restarts.
- LLM-based reflect for richer relationship modelling.
- Streaming dialogue to the client (changes the truncation calculus).
