# Agentic Improvements — Latency + Quality Plan

## Goals

1. Reduce median and p95 interaction latency.
2. Improve action correctness and response quality.
3. Keep behavior deterministic and observable under load.

---

## Current Flow (Observed)

Player prompt enters `ws/handler.py` → `AgentRegistry.invoke(...)` → LangGraph pipeline (`reason` ↔ `act` → `respond` → `reflect`) → actions applied to `WorldState` → broadcasts sent to nearby clients.

Key issues:
- Prompt/context growth over time increases token and model latency.
- `summarize` node exists but is not wired into active graph routing.
- Action/tool outputs can drift in shape, creating quality regressions.
- One shared concurrency budget can hurt interactive latency under stress.
- Limited stage-level telemetry makes bottlenecks hard to isolate quickly.

---

## Priority Improvements

## 1) Wire memory summarization into routing

**Why:** Reduces prompt bloat and improves long-session consistency.

**Changes:**
- Route graph through `summarize` conditionally (token/turn thresholds).
- Store rolling summary + only last N raw messages in active prompt.
- Keep summary stable and bounded in size.

**Target files:**
- `server/src/agents/npc_agent.py`
- `server/src/agents/nodes/summarize.py`
- `server/src/agents/registry.py`

---

## 2) Introduce strict action normalization/validation

**Why:** Improves reliability and avoids mismatched action payloads.

**Changes:**
- Define canonical server-side action schema per `kind`.
- Validate and normalize all `pending_actions` before `WorldState.apply_actions`.
- Reject/flag malformed actions with explicit diagnostics.

**Target files:**
- `server/src/agents/tools/*.py`
- `server/src/world/world_state.py`
- `server/src/ws/handler.py`

---

## 3) Split concurrency budgets by traffic type

**Why:** Keep player-initiated interactions fast even during ambient NPC chatter.

**Changes:**
- Separate semaphores/queues:
  - high priority: direct player interactions
  - lower priority: proximity chat/autonomous reactions
- Add bounded queue + timeout policy for low-priority work.

**Target files:**
- `server/src/ws/handler.py`
- `server/src/agents/registry.py`

---

## 4) Add stage-level latency telemetry

**Why:** Enables evidence-based tuning and regressions detection.

**Changes:**
- Measure and log:
  - queue wait
  - `reason` duration
  - `act` duration
  - action apply duration
  - broadcast duration
- Emit structured metrics with `npc_id`, `player_id`, action count, token usage.

**Target files:**
- `server/src/ws/handler.py`
- `server/src/agents/nodes/reason.py`
- `server/src/agents/nodes/act.py`
- `server/src/agents/registry.py`

---

## 5) Expand deterministic fast paths

**Why:** Avoid expensive full-agent runs for simple intents.

**Changes:**
- Add pre-classified routes for:
  - greeting/small talk
  - simple world queries
  - straightforward inventory/quest status checks
- Use concise response templates or reduced-context model calls.

**Target files:**
- `server/src/ws/handler.py`
- `server/src/agents/nodes/reason.py`
- `server/src/agents/tools/world_query.py`

---

## 6) Improve retrieval relevance and cost control

**Why:** Better context improves response quality while avoiding unnecessary tokens.

**Changes:**
- Dynamic `top_k` by intent and confidence (not fixed for all prompts).
- Cache retrieval results for near-duplicate prompts in short windows.
- Penalize stale/low-signal lore chunks.

**Target files:**
- `server/src/rag/retriever.py`
- `server/src/rag/knowledge_base.py`

---

## 7) Tool contract hardening

**Why:** Better tool IO quality improves final dialogue and world consistency.

**Changes:**
- Tighten docstrings and parameter semantics for all tools.
- Add explicit target disambiguation (self, player, npc, entity_id).
- Normalize numeric ranges and enum-like fields before enqueueing actions.

**Target files:**
- `server/src/agents/tools/*.py`

---

## Rollout Plan (Phased)

## Phase 1 (Fast impact)
- Telemetry (P95 visibility)
- Action normalization layer
- Concurrency split

## Phase 2 (Core quality/latency)
- Summarization routing
- Fast-path routing for simple intents

## Phase 3 (Precision + scale)
- Retrieval tuning + caching
- Tool contract hardening across all modules

---

## Success Metrics

- **Latency:** p50 and p95 interaction time reduced (target: p95 -30%).
- **Quality:** fewer malformed actions and fewer no-op tool invocations.
- **Stability:** lower timeout/cancellation rate under concurrent users.
- **Cost:** lower average tokens per interaction without quality drop.

---

## Validation Strategy

1. Add benchmark scenarios: short social prompts, tool-heavy prompts, crowded-area chatter.
2. Capture baseline and post-change metrics by phase.
3. Roll out with feature flags; compare A/B in logs before full enablement.

---

## Risks and Mitigations

- **Over-aggressive fast paths** may reduce personality richness  
  → Gate with confidence threshold + fallback to full pipeline.

- **Summary drift** can lose critical context  
  → Keep recency window and periodic full-context refresh.

- **Schema strictness** can break existing tool outputs  
  → Start in warn mode, then enforce after cleanup.
