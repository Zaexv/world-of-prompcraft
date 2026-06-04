---
date: 2026-06-04T13:06:10+00:00
git_commit: c2bed188ba35f98550153eb6625fdc129597d3b7
branch: fix/various-bug-fixe
topic: "Why do NPCs sometimes respond with '...' randomly?"
tags: [research, codebase, npc-agent, langgraph, llm, ollama, root-cause]
status: complete
---

# Research: Why do NPCs sometimes respond with "..." randomly?

## Research Question
NPCs occasionally reply with just `...`. It happens at random and the root cause is unknown. Find it.

## Summary

`...` is the system's **empty-dialogue placeholder**. It is emitted in three
distinct places in the agent pipeline, every one of which fires when the LLM
returns **empty or tool-call-only content**. The default LLM provider is a
**local Qwen "thinking" model** (`ollama` / `qwen3.5:9b`) with a tight
`response_max_tokens = 180` budget. Local models intermittently (a) burn the
token budget on hidden reasoning and return empty content, or (b) emit tool
calls as plain text with no surrounding dialogue. Both cases collapse to `...`.
The response cache then makes a one-off `...` *sticky* for that exact prompt.

The randomness is inherent: it depends on whether the model happens to wrap
dialogue around its tool call and whether it spends its token budget on
reasoning vs. output — non-deterministic at `temperature = 0.1`.

## The three `...` emission sites

### 1. `respond_node` — empty final message content
`server/src/agents/nodes/respond.py:8-19`
```python
last_message = state["messages"][-1]
dialogue = getattr(last_message, "content", "")
if not dialogue:
    dialogue = "..."          # ← player sees this
```
Fires when the final `AIMessage` in the graph has empty `content`. The graph
flow is `reason → [act loop] → reason → respond` (`npc_agent.py:42,64-77`). The
last LLM turn before `respond` can legitimately return empty content when:
- a **thinking model exhausts the 180-token budget on hidden reasoning** before
  producing any visible text (documented directly in `config.py:41-46`), or
- the model, after a tool round-trip, considers the tool result sufficient and
  returns an empty assistant turn with no further tool calls.

### 2. `reason_node` — inline tool call with no dialogue
`server/src/agents/nodes/reason.py:218-236`
```python
cleaned, parsed = extract_inline_tool_calls(content, params_by_tool)
if parsed:
    ...
    ai_message.content = cleaned or "..."   # ← whole message was a tool call
    return {"messages": [ai_message], ...}
```
Local models often emit tool calls as **plain text** instead of structured
`tool_calls` (`inline_tools.py:1-13`). When the *entire* message is a call
(e.g. `give_quest('Whispers in the Wind', ...)`) with no prose around it,
`extract_inline_tool_calls` strips the syntax and `cleaned` is `""` →
`content = "..."`. The router (`npc_agent.py:23-29`) sees no structured
`tool_calls`, routes to `respond`, and `...` reaches the player.

### 3. `registry.invoke` / handler fallbacks — defensive defaults
- `server/src/agents/registry.py:251` — `result.get("response_text", "...")`
  (only if `respond_node` somehow set nothing).
- `server/src/ws/handler.py:1010` — `result.get("dialogue", "...")`.
- Hard-stop fallbacks for timeout / exception use longer strings, not bare
  `...`: `registry.py:226`, `handler.py:968,978`.

## Why it is *random* (not deterministic)

1. **Provider + model.** `config.py:10-46` defaults to
   `llm_provider = "ollama"`, `ollama_model = "qwen3.5:9b"`. Qwen3 is a
   reasoning model; the code comment at `config.py:41-46` states it "exhaust[s]
   [the budget] on reasoning and return[s] empty content, so the NPC says
   nothing." The mitigation `ollama_reasoning_effort = "none"` reduces but does
   not eliminate this — the model can still spend output on thought.
2. **Tight budget.** `response_max_tokens = 180` (`config.py:51`) leaves little
   room; any reasoning leakage starves the visible reply.
3. **Tool-call formatting lottery.** Whether Qwen wraps prose around an inline
   tool call varies turn to turn → site #2 fires unpredictably.
4. **Temperature 0.1** (`config.py:49`) is low but not zero — same prompt can
   flip between a real reply and `...`.

## Cache makes one-off `...` sticky

`server/src/agents/registry.py:200-205, 256-259`
```python
cache_key = sha256(f"{npc_id}|{player_id}|{prompt}|{hp}|{zone}")
...
if not pending:                       # no actions fired
    self._response_cache[cache_key] = response_payload
```
A `...` reply has no pending actions, so it **is cached**. Re-sending the exact
same prompt (same NPC, player, HP, zone) returns the cached `...` until the key
changes — turning a transient model hiccup into a repeatable one for that input.

## Secondary `...` paths (different feature, same placeholder)

- **Chat reactions** (`handler.py:521-562`): the prompt *instructs* the model to
  reply `...` when a nearby chat message is irrelevant, then **drops** it
  (`handler.py:561` returns without broadcasting). This path does **not** show
  `...` to players — it is by design and filtered out. Not the bug.
- **World-builder agent** (`world_builder_agent.py:87-88`) uses
  `"The world shifts..."`, not bare `...`.

## Code References
- `server/src/agents/nodes/respond.py:14-15` — empty content → `...` (primary).
- `server/src/agents/nodes/reason.py:232` — inline-only tool call → `...`.
- `server/src/agents/nodes/act.py:23-55` — runs tools, loops back to reason.
- `server/src/agents/npc_agent.py:23-29,64-77` — reason→act→reason→respond flow.
- `server/src/agents/registry.py:251,256-259` — default `...` + cache stickiness.
- `server/src/ws/handler.py:1010` — handler-level default `...`.
- `server/src/config.py:11,34,41-46,51` — ollama default, budget, thinking-model note.
- `server/src/agents/nodes/inline_tools.py:1-13,143-196` — plain-text tool parsing.

## Root Cause (one line)
The local Qwen thinking model intermittently returns empty / tool-call-only
content under a 180-token budget; the pipeline maps empty content to the `...`
placeholder (`respond.py:14`, `reason.py:232`), and the response cache pins that
`...` to the exact prompt.

## Open Questions
- Is production actually running `ollama`, or is `.env` overriding to
  `claude`/`openai`? Claude/OpenAI emit structured tool_calls and rarely return
  empty content, so the bug would be far rarer there. Confirm the deployed
  `llm_provider`.
- Does `ollama_reasoning_effort = "none"` reach the Ollama API correctly for
  `qwen3.5:9b`? Verify in the llm provider wiring.
- Should `...` responses be excluded from the cache and/or retried once before
  surfacing to the player? (Out of scope — fix, not documentation.)
