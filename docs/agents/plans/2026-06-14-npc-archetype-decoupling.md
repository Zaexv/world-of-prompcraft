---
date: 2026-06-14T00:00:00Z
git_commit: 52c4a426f690e6314a91fe995191b3c6cc430a6f
branch: feat/django-persistence
topic: "Decouple NPCs, personalities and tools for a future NPC Designer"
tags: [plan, npc, archetype, tools, personalities, refactor, agent]
status: draft
---

# NPC / Personality / Tool Decoupling Implementation Plan

## Overview

NPC identity, personality and tool access are coupled across three layers that
must be hand-synced and are largely Python-coded, not data. Goal: make an NPC a
**composition of `archetype + instance data`**, where the archetype is the single
source of truth for **which tools the NPC may call** (hard limit, not prompt
prose) and for shared prompt rules. This unlocks an "NPC Designer" that writes
plain data and picks an archetype from a list, with tools auto-limited — driven
from the **in-game chat** (Phase 7), reusing the existing prompt-driven
world-builder pipeline.

## Current State Analysis

**An NPC is defined in three disjoint places:**

1. **Identity / transform / stats** — `shared/data/world_manifest.json`, flattened
   by `server/src/world/npc_definitions.py:44` into a dict with `personality_key`,
   `role`, `position`, `initial_hp`, `style`, `appearance`. Data-driven ✓.
2. **Personality** — `server/src/agents/personalities/templates.py`,
   `NPC_PERSONALITIES` (1459-line Python dict). Each entry has `name`,
   `archetype`, `initial_hp`, `position`, `system_prompt`. The `system_prompt`
   string has `_TOOL_RULES_PREAMBLE` (`templates.py:8`) concatenated inline.
3. **Tools** — `server/src/agents/tools/__init__.py`. `get_all_tools()`
   (`tools/__init__.py:61`) returns **every tool to every NPC**. Category
   factories already exist in `_CATEGORY_FACTORIES` (`tools/__init__.py:25`):
   `combat, dialogue, environment, music, quest, trade, world_query`.
   The `combat` factory (`server/src/agents/tools/combat.py:10`) mixes four
   tools with opposite intents: `deal_damage` (offense), `heal_target`
   (support), `defend` + `flee` (survival). So "limit a healer's tools" is
   impossible at category granularity today — gating `combat` either grants a
   healer `deal_damage` or denies it `heal_target`.

**The glue:**
- `WorldState.refresh_npcs()` (`server/src/world/world_state.py:89`) joins manifest
  ↔ `NPC_PERSONALITIES` via `personality_key` (`world_state.py:104-107`), writing
  `system_prompt` into `NPCData.personality` and `archetype` into
  `NPCData.archetype`.
- `AgentRegistry` builds one graph per NPC and calls `get_all_tools()` blindly in
  three spots: `registry.py:82` (`_build_agents`), `registry.py:112`
  (`register_dynamic_npc`), `registry.py:155` (`refresh_agents`).
- Prompt is assembled at `server/src/agents/nodes/reason.py:33` `_build_system_prompt`,
  injecting `npc_personality` verbatim under `## Your Personality`.

**Archetype today is a bare string**, read in only two behaviors:
- `reason.py:216` — gates `short_social` for `hostile_boss` / `hostile_monster`.
- combat fast-path (registry exposes `world_context["npc_archetype"]`, `registry.py:222`).

Existing archetypes (12, from `templates.py`): `hostile_boss`, `hostile_monster`,
`friendly_merchant`, `quest_giver`, `neutral_guard`, `friendly_healer`,
`friendly_stoner`, `eccentric_archmage`, `volatile_pyromancer`,
`mysterious_cryomancer`, `friendly_guide`.

**Pain points:**
- Personality is Python → a Designer cannot edit it safely.
- No tool gating: a healer can `deal_damage`, a monster can `complete_purchase`.
  Only soft prompt prose stops it; the LLM can break it.
- Duplicate truth: `initial_hp`, `archetype`, `position` live in BOTH manifest and
  `NPC_PERSONALITIES` → drift.
- `_TOOL_RULES_PREAMBLE` copy-pasted into every personality string; changing a
  tool means editing the 1459-line file.

## Desired End State

```
Designer / manifest / DB  →  NPCSpec (validated data)
                               ├─ archetype: friendly_merchant
                               └─ flavor_prompt, name, hp override, position...
NPCSpec + ARCHETYPES  →  WorldState.NPCData(allowed_tools=[...])
                          → Registry → get_tools_for(allowed_tools, ...)
                          → prompt = compose(flavor + archetype.tool_rules + global + brevity)
```

An NPC's tool set is decided by its archetype, in code, before the LLM runs.
Personality flavor is data. Prompt rules are composed from the archetype, so they
always match the tools actually bound.

## What We Are NOT Doing

- Not building Django admin screens (follow-up; the chat designer in Phase 7 is
  the front-end this plan delivers).
- Not changing the per-NPC LangGraph node graph (`npc_agent.py`). Phase 7 adds a
  separate designer agent modeled on `world_builder_agent.py`.
- Not migrating `NPC_PERSONALITIES` to a DB in this plan — Phase 4 moves it to
  JSON; DB rows can ride the existing `feat/django-persistence` work later.
- Not changing NPC mesh rendering — Phase 7 reuses `entityManager.addNPC`.

## Implementation Phases

### Phase 1 — Per-NPC tool selection seam (safe, no behavior change)

Add the ability to bind a subset of tools, defaulting to all so nothing changes
yet.

- `server/src/agents/tools/__init__.py`: add
  `get_tools_for(categories: list[str], pending_actions, world_state) -> list[BaseTool]`
  that loops `_CATEGORY_FACTORIES`. Refactor `get_all_tools` to call it with all
  category keys. Raise `KeyError` on unknown category (reuse existing message).
- `server/src/world/world_state.py`: add `allowed_tools: list[str] | None = None`
  to `NPCData` (`world_state.py:20`). `None` = all tools (back-compat). Include in
  `to_dict()` only if set.
- `server/src/agents/registry.py`: in all three build sites
  (`:82`, `:112`, `:155`) read `npc_data.allowed_tools`; call `get_tools_for(...)`
  when set, else `get_all_tools()`. Factor the duplicated build block into one
  private `_build_agent_for(npc_data)` helper while here (removes the 3x copy).

**Verify:** `make test` green; with no archetype data wired, every NPC still gets
all tools. Add a unit test: `get_tools_for(["dialogue"])` returns only dialogue
tools; unknown category raises `KeyError`.

### Phase 2 — Split `combat` into `offense` / `support` / `defense`

Decouple opposite-intent combat tools so archetypes can grant heal without
attack. Blast radius is tiny: `combat`/`create_combat_tools` are referenced only
in `server/src/agents/tools/__init__.py` (`:17`, `:26`, `:80`); `get_tools_by_category`
has no callers. `deal_damage` / `heal_target` tool names are unchanged, so
personality prompt prose and the client action `kind`s (`damage`, `heal`,
`emote`, `move_npc`) are untouched.

- `server/src/agents/tools/combat.py`: split `create_combat_tools` into three
  factories in the same file (keep the file):
  - `create_offense_tools` → `deal_damage`
  - `create_support_tools` → `heal_target`
  - `create_defense_tools` → `defend`, `flee` (survival; shared by hostiles AND
    healers — a healer fleeing is valid)
  Keep `create_combat_tools` as a thin alias returning all three, so nothing
  that imports it breaks during the transition.
- `server/src/agents/tools/__init__.py`: replace the `"combat"` entry in
  `_CATEGORY_FACTORIES` with `"offense"`, `"support"`, `"defense"`. Update
  `get_all_tools` (`:80`) to extend all three. Keep a back-compat `"combat"`
  alias key mapping to the union for one release, or update the docstring list
  (`:42`). `get_all_tools` output is byte-identical (same 4 tools).

**Verify:** `get_tools_for(["support"])` yields only `heal_target`;
`get_tools_for(["offense"])` only `deal_damage`. `get_all_tools()` still returns
the same 4 combat tools. `make check` green.

### Phase 3 — Archetype registry (the unlock)

Introduce archetypes as first-class data.

- New `server/src/agents/personalities/archetypes.py`:
  ```python
  @dataclass(frozen=True)
  class Archetype:
      key: str
      allowed_tools: tuple[str, ...]
      default_hp: int
      hostile: bool
      tool_rules: str           # composed into prompt, replaces inline preamble
  ARCHETYPES: dict[str, Archetype] = {...}  # 12 existing keys
  ```
  Map each existing archetype to a tool set using the Phase 2 split (no more
  all-or-nothing combat):
  - `friendly_merchant`: `dialogue, trade, world_query, quest`
  - `friendly_healer`: `dialogue, support, defense, world_query` — heal + flee,
    **no `offense`**. This is the case that was impossible before Phase 2.
  - `hostile_monster` / `hostile_boss`: `offense, defense, environment, dialogue`
  - `quest_giver` / `friendly_guide`: `dialogue, quest, world_query`
  - `neutral_guard`: `dialogue, offense, defense, world_query`
  - mages (`eccentric_archmage`, `volatile_pyromancer`, `mysterious_cryomancer`):
    `dialogue, environment, offense, defense, world_query`
  - `friendly_stoner`: `dialogue, world_query` (+ `music` if it plays)
- `tool_rules` per archetype = the relevant slices currently bundled in
  `_TOOL_RULES_PREAMBLE` (`templates.py:8`). Keep `_TOOL_RULES_PREAMBLE` for now;
  Phase 5 deletes the inline copies.
- `WorldState.refresh_npcs()` (`world_state.py:103-132`): after resolving
  `archetype`, look up `ARCHETYPES`; set `NPCData.allowed_tools` from it and use
  `default_hp` when manifest gives none. Unknown archetype → `allowed_tools=None`
  (all tools) + WARN log.
- Replace the two ad-hoc archetype string checks (`reason.py:216`) with
  `ARCHETYPES[key].hostile` (single source of truth).

**Verify:** test that a `friendly_merchant` agent has no `deal_damage`, a
`hostile_monster` has no `complete_purchase`, and a `friendly_healer` has
`heal_target` but NOT `deal_damage`. `make check` green.

### Phase 4 — Personalities to data

Move flavor out of Python.

- New `shared/data/personalities/<personality_key>.json` (or one
  `personalities.json`), schema:
  ```json
  { "key": "merchant_01", "name": "...", "archetype": "friendly_merchant",
    "hp": 100, "flavor_prompt": "<character voice only, NO tool rules>",
    "style": null, "appearance": null }
  ```
- New Pydantic `NPCSpec` model (`server/src/agents/personalities/spec.py`):
  validates `archetype in ARCHETYPES`, hp range, required fields. This is the
  contract the Designer writes.
- Loader: `templates.py` `NPC_PERSONALITIES` becomes a function that reads the
  JSON into `NPCSpec` objects (keep the name/shape for back-compat, or update the
  one consumer `world_state.py:11`).
- Migration: script to extract current `system_prompt` strings → split into
  `flavor_prompt` (everything before `_TOOL_RULES_PREAMBLE`) + archetype-owned
  rules. One-time; verify diff of generated prompt vs old per NPC.

**Verify:** generated full prompt per NPC byte-compared to pre-migration (allow
whitespace) for a sample; `make check` green.

### Phase 5 — Compose prompt from parts

Stop storing tool rules per NPC.

- `server/src/agents/nodes/prompt_parts.py`: add `archetype_tool_rules(key)` and
  `tool_rules_for(allowed_tools)` returning only rules for bound tool categories.
- `reason.py:_build_system_prompt` (`reason.py:33`): build
  `flavor_prompt + archetype.tool_rules + global_directive_section + brevity`.
  Needs archetype/allowed_tools in `NPCAgentState` — thread them through
  `_build_input_state` (`registry.py:25`) like `npc_personality` already is.
- Delete inline `_TOOL_RULES_PREAMBLE` concatenations from personality strings
  (now in `flavor_prompt`, rules come from archetype).

**Verify:** prompts contain only rules for tools the NPC has; `make test` green;
manual smoke: chat a merchant, a dragon, a healer — behavior unchanged.

### Phase 6 — Designer foundation (stub, optional in this PR)

- Expose `ARCHETYPES` keys + tool categories via a read endpoint (FastAPI) so a
  future Designer can populate dropdowns.
- CRUD on `NPCSpec` JSON/DB rows: trivial later via Django admin given
  `feat/django-persistence`. Out of scope to build screens here.

### Phase 7 — Front-end: design NPCs from the in-game chat

Let a player create / edit an NPC by talking to an in-game designer, reusing the
existing prompt-driven world-build pipeline rather than inventing a new one.

**Existing pattern to mirror** (the World Spirit / world-builder):
- Client `WorldBuilderPanel` (`client/src/ui/WorldBuilderPanel.ts`) sends a
  `world_modify` message (`client/src/core/GameBootstrapper.ts:247`).
- Server `handle_world_modify` (`server/src/ws/handlers/world_builder.py:23`)
  invokes the `world_builder_agent` (`server/src/agents/world_builder_agent.py`)
  whose tools mutate state, then **persists the manifest and broadcasts** the
  result. Streaming via `world_modify_start/chunk/end`
  (`client/src/core/WebSocketHandler.ts:384-394`).
- Clients spawn NPCs at runtime via `entityManager.addNPC(...)`
  (`client/src/entities/EntityManager.ts:50`, already driven from
  `WebSocketHandler.ts:136`).

**Server:**
- New designer tools (closure pattern, `server/src/agents/tools/npc_designer.py`):
  - `create_npc(name, archetype, flavor_prompt, position?, hp?)` — validates
    `archetype in ARCHETYPES` (Phase 3), builds an `NPCSpec` (Phase 4), appends an
    `npc_spawn` action.
  - `edit_npc(npc_id, field, value)` — patch name / flavor / archetype / hp on an
    existing spec; appends `npc_update`.
  - `list_archetypes()` — read-only, returns keys + tool sets so the agent can
    guide the player ("a healer can't attack").
- New "NPC Architect" agent (`server/src/agents/npc_designer_agent.py`), same
  3-node shape as `world_builder_agent`, bound ONLY to the designer tools. Reuse
  the act/respond nodes; do not touch `npc_agent.py`.
- New handler `handle_npc_design(ctx, data, ws, manager)` mirroring
  `handle_world_modify`: invoke agent → for `npc_spawn`/`npc_update` actions,
  write the `NPCSpec` (JSON/DB, Phase 4), call
  `registry.register_dynamic_npc(...)` / `refresh_agents()`
  (`server/src/agents/registry.py:103,130`) and `world_state.refresh_npcs()`, then
  **broadcast `npc_spawn` / `npc_update`** to all clients. Register the new
  message type in `server/src/ws/handler.py` + `protocol.py`.

**Client:**
- Add an **NPC tab/mode** to `WorldBuilderPanel.ts` (or a small `NpcDesignerPanel`)
  that sends a new `npc_design` message `{ prompt, position }` — copy the
  `world_modify` send path (`GameBootstrapper.ts:247`).
- Populate an **archetype dropdown** from the Phase 6 endpoint so the player picks
  a role and sees its allowed tools (the UI surface of the hard tool limit).
- Add message types to `client/src/network/MessageProtocol.ts` (request
  `npc_design`; responses can reuse the `world_modify_*` streaming shapes or add
  `npc_design_*`).
- Handle the `npc_spawn` / `npc_update` broadcast in
  `client/src/core/WebSocketHandler.ts` → `entityManager.addNPC(...)` (and an
  update/remove path), reusing the existing dynamic-NPC spawn at
  `WebSocketHandler.ts:136`.

**Auth note:** NPC creation is a powerful edit. Gate `npc_design` behind the same
permission the world-builder uses (builder/admin mode) — do not expose it to every
player by default.

**Alternative (not chosen):** a pure form panel (dropdowns + text fields, no LLM)
writing `NPCSpec` directly via `world_direct_edit`-style messages. Lower magic,
but the user asked for chat. The form can be added later on the same server
endpoints.

**Verify:** in-game, type "make a grumpy blacksmith merchant here" → NPC appears
for all connected clients, survives restart (persisted spec), and has only
merchant tools (no `deal_damage`). `make check` + client `pnpm test` green.

## Risks & Mitigations

- **Heal/attack coupling (resolved by Phase 2).** `combat` mixed `deal_damage`
  and `heal_target`, making "healer with no attack" impossible. Phase 2 splits it
  into `offense` / `support` / `defense`, so gating is intent-level. `defend` and
  `flee` go to `defense`, shared by hostiles and healers (fleeing is valid for
  both).
- **Tool-name stability across the split.** Keep tool *names* (`deal_damage`,
  `heal_target`, `defend`, `flee`) and client action `kind`s identical when
  splitting the factory, so personality prose and `ReactionSystem` are untouched.
  Keep `create_combat_tools` as an alias for one release.
- **Dynamic / procedural NPCs** (`register_dynamic_npc`, `proc_`/`enc_`) have no
  manifest archetype. Default them to a sensible archetype
  (e.g. `hostile_monster`) or `allowed_tools=None`. Decide in Phase 3.
- **Prompt drift in migration.** Mitigate with the byte-compare check in Phase 4.
- **Back-compat.** Phases 1–3 default to all-tools when data absent, so each phase
  is independently shippable and revertible.

## Recommended Order / Sequencing

Phases are ordered low-risk→high-value and each is independently mergeable:
1 (tool seam) → 2 (split combat = heal/attack decoupling) → 3 (archetype gating =
the actual tool-limit unlock) → 4 (data) → 5 (compose) → 6 (Designer foundation)
→ 7 (front-end chat designer). Stopping after Phase 3 already delivers hard,
intent-level per-NPC tool limits (including healers with no attack); 4–5 deliver
Designer-editable data; 6–7 deliver the in-game chat NPC Designer. Phase 7 depends
on 3 (archetypes), 4 (`NPCSpec`) and 6 (archetype endpoint).

## Key Files

- `server/src/agents/tools/combat.py` — split into offense/support/defense
  factories (Phase 2)
- `server/src/agents/tools/__init__.py` — `get_tools_for` (new, Phase 1),
  category map update (Phase 2), `get_all_tools`
- `server/src/agents/personalities/archetypes.py` — `ARCHETYPES` (new, Phase 3)
- `server/src/agents/personalities/spec.py` — `NPCSpec` (new, Phase 4)
- `server/src/agents/personalities/templates.py` — JSON loader (Phase 4)
- `server/src/world/world_state.py` — `NPCData.allowed_tools`, `refresh_npcs`
- `server/src/agents/registry.py` — `_build_agent_for`, tool selection
- `server/src/agents/nodes/reason.py` — prompt composition, hostile check
- `server/src/agents/nodes/prompt_parts.py` — tool-rule composers
- `shared/data/personalities/*.json` — flavor data (new, Phase 4)
- `server/src/agents/tools/npc_designer.py` — `create_npc`/`edit_npc` tools (new, Phase 7)
- `server/src/agents/npc_designer_agent.py` — NPC Architect agent (new, Phase 7)
- `server/src/ws/handlers/world_builder.py` + `handler.py` + `protocol.py` —
  `npc_design` handler + message (Phase 7)
- `client/src/ui/WorldBuilderPanel.ts` — NPC tab + archetype dropdown (Phase 7)
- `client/src/core/GameBootstrapper.ts` / `core/WebSocketHandler.ts` /
  `network/MessageProtocol.ts` — send `npc_design`, handle `npc_spawn`/`npc_update`
  via `entityManager.addNPC` (Phase 7)
