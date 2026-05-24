---
name: agentic-promptcraft
description: Explain, document, or present the World of Promptcraft agentic system — LangGraph NPC agents, tool calls, memory, relationship model, NPC personalities, and the full pipeline from player prompt to 3D effect. Use when the user wants to understand how the AI system works, prepare a presentation or talk, generate a summary of the architecture, or answer "how does X work" questions about the agent system.
argument-hint: [topic — e.g. "tool calls", "NPCs", "memory", "full overview", "conference summary"]
---

# Agentic System — World of Promptcraft

Use this skill to explain, summarise, or present any part of the agentic system.

## Key documentation to read first

Always load the relevant docs before answering. Read in parallel where possible:

| Topic | File to read |
|-------|-------------|
| Full agentic pipeline | `docs/agentic-workflow.md` |
| NPC personalities & prompts | `server/src/agents/personalities/templates.py` |
| NPC world definitions | `server/src/world/npc_definitions.py` |
| StateGraph wiring | `server/src/agents/npc_agent.py` |
| Agent registry & routing | `server/src/agents/registry.py` |
| All 14 tools | `server/src/agents/tools/` (read each file) |
| Agent state schema | `server/src/agents/agent_state.py` |
| Nodes (reason/act/respond/reflect/summarize) | `server/src/agents/nodes/` |
| Server architecture overview | `server/ARCHITECTURE.md` |
| Client architecture overview | `client/ARCHITECTURE.md` |

---

## What to explain depending on `$ARGUMENTS`

### "full overview" or no argument
Give a complete plain-English walkthrough:
1. What the game is — text prompt as the only interface
2. Each NPC is a fully independent LangGraph StateGraph (not a shared graph)
3. The 5-node pipeline: reason → act (loop) → respond → reflect → [summarize]
4. How tool calls work: LLM emits tool_calls → act executes → pending_actions[] → client effects
5. Memory: MemorySaver per thread_id = "{npc_id}_{player_id}", mood + relationship_score persist
6. The 9 static NPCs and their archetypes
7. Cost strategy: only 1–2 LLM calls per turn (reflect is heuristic, summarize conditional)

### "tool calls" or "tools"
Explain:
- All 14 tools grouped by category (combat, dialogue, trade, environment, world_query, quest)
- The closure pattern: each NPC's tools close over its own pending_actions[] and world_snapshot{}
- Action tools vs query tools (read-only)
- The act → reason loop: LLM can call multiple tools before producing dialogue
- How pending_actions flows: tool closure → pending_actions[] → apply_actions() after graph → WorldState → client
- The give_quest vs start_quest distinction

### "NPCs" or "personalities"
Explain:
- The 9 static NPCs: name, archetype, HP, zone, combat stance
- How differentiation works: same graph topology, different system_prompt in reason
- Three layers in every system prompt: personality/voice, _TOOL_RULES_PREAMBLE, NPC-specific tool rules
- How the LLM's tool-call behavior is controlled via prompt rules (not graph structure)
- Quest ownership per NPC

### "memory" or "relationship"
Explain:
- MemorySaver: thread_id = "{npc_id}_{player_id}" — two players talking to same NPC have independent memory
- Persistent fields: conversation_summary, mood, relationship_score, personality_notes
- reflect node: zero-cost heuristic — keyword token sets for mood + delta math for relationship
- Relationship tiers: ENEMY / DISTRUSTFUL / STRANGER / FRIEND / TRUSTED ALLY
- summarize node: conditional LLM call, fires at human_count ≥ 10 every 3rd turn, caps at 500 chars
- How all persistent fields are injected back into the system prompt on the next turn

### "conference summary" or "presentation"
Produce a clear, audience-friendly explanation suitable for a technical talk. Structure it as:

1. **The Idea** — why text-as-interface is interesting; no buttons, no scripts
2. **The Architecture** — one LangGraph StateGraph per NPC (not one shared graph), compiled at startup
3. **The Pipeline** — walk through a single player interaction step by step with the Ignathar example
4. **Tool Calls** — how the LLM calls typed functions that produce real game effects
5. **Memory** — how NPCs remember you across sessions without any database
6. **Cost** — why this is cheaper than it looks (reflect heuristic, conditional summarize, keyword RAG)
7. **Takeaways** — what this shows about agentic design patterns

Use the concrete Ignathar attack example from `docs/agentic-workflow.md` as a live demo trace.

---

## Tone and format rules

- Plain English first — avoid jargon unless explaining it
- Use bullet points for lists of facts, prose for explanations of how things connect
- Include code snippets only when showing the exact implementation adds clarity
- Reference exact file paths (e.g. `server/src/agents/nodes/reason.py:115`) when pointing to specific behaviour
- If producing a presentation outline, use numbered sections with short punchy headers
- For conference use: lead with the player experience ("you type anything, the dragon reacts"), then reveal the implementation underneath
