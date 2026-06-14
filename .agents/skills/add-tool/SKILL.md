---
name: add-tool
description: Add a new LangGraph agent tool to World of Promptcraft — a typed action NPCs can call (like deal_damage, offer_item, play_music). Use whenever the user wants to create, add, or wire up a new NPC tool / agent action / capability that the LLM can invoke and that produces a game effect.
argument-hint: [tool idea, e.g. "a tool that lets an NPC teleport the player"]
---

# Add Tool

Tools are the substrate of NPC behavior: the LLM calls a typed `@tool`, which appends
a structured action to `pending_actions`; the server ships those actions to the client,
which turns each `kind` into a 3D effect. Every domain (combat, dialogue, trade, quest,
music, environment, world_query) follows the SAME closure pattern. Adding one is three
mechanical steps.

## Step 1 — create the tool file
`server/src/agents/tools/<name>.py`, factory/closure pattern:

```python
from __future__ import annotations
from typing import Any
from langchain_core.tools import tool

def create_<name>_tools(pending_actions: list[Any], world_state: dict[str, Any]) -> list[Any]:
    @tool
    def my_action(target: str, amount: int) -> str:
        """One-line description the LLM reads to decide when to call this."""
        pending_actions.append({
            "kind": "my_action",      # unique action kind
            "target": target,
            "amount": amount,
        })
        return f"Did my_action to {target}."

    return [my_action]
```
Mirror an existing tool (e.g. `combat.py`, `trade.py`) for signature + return-string
conventions. Keep `from __future__ import annotations`; parameterize all generics
(`list[Any]`, `dict[str, Any]`) — mypy is strict.

## Step 2 — register it
`server/src/agents/tools/__init__.py`:
1. `from .<name> import create_<name>_tools`
2. Add to the `TOOL_FACTORIES` dict (~line 26): `"<name>": create_<name>_tools,`
3. Add to `get_all_tools` (~line 80): `tools.extend(create_<name>_tools(pending_actions, world_state))`

This is the single registration point — `registry.py` builds every NPC's toolset from
`get_all_tools`, so the tool is now available to all agents.

## Step 3 — handle the action on the client
`client/src/systems/ReactionSystem.ts`: handle the new action `kind` and produce the
3D effect (animation, particle, state change). The `kind` string must match Step 1.

## Verify
```bash
cd server && python -m py_compile src/agents/tools/<name>.py src/agents/tools/__init__.py
cd server && python -m pytest tests/domains/tools/ -q
cd client && npx tsc --noEmit
```
Add a `server/tests/domains/tools/test_<name>_tools.py` mirroring existing tool tests.

## Notes
- Tools should be deterministic action emitters — the LLM decides WHEN, the tool just
  records WHAT. Don't put game-state mutation the server owns inside the tool body
  unless that mirrors existing tools.
- A purely world-builder tool? See `world_builder.py` + `world_builder_agent.py`
  (separate agent, its own tool set).
