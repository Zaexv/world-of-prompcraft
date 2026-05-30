---
name: add-npc-skill
description: Add or update NPCs in World of Promptcraft, including manifest placement, personality templates, and SQLite-persisted NPC state. Use this skill whenever the user asks to create a new NPC, adjust NPC stats/position/zone, assign or change personality_key, or tune NPC behavior/dialogue. Prefer this skill even if the request only mentions "spawn", "monster", "vendor", "boss", or "NPC personality".
---

# Add NPC Skill

Use this skill to implement NPC changes safely across the full backend flow.

## What this project requires

NPC behavior and identity span **three layers**:

1. `shared/data/world_manifest.json` (spawn/identity/stats/ai key)
2. `server/src/agents/personalities/templates.py` (`NPC_PERSONALITIES` prompt + archetype)
3. `server/data/game_state.db` (persisted personality/state used by runtime)

You must keep these in sync.

## Required input from user request

If not explicitly provided, make reasonable defaults:

- `npc_id` (snake_case, unique)
- display name
- zone and position `[x, y, z]`
- role (`guide`, `citizen`, `merchant`, `monster`, etc.)
- `max_hp` and level
- `personality_key` (can equal `npc_id`)
- behavior intent (friendly/hostile/trader/quest giver/etc.)

## Implementation workflow

1. Add/update manifest entry in `shared/data/world_manifest.json` under the target zone:
   - `id`
   - `identity.name`, `identity.role`
   - `transform.position` (+ optional `rotation`, `scale`)
   - `stats.max_hp`, `stats.level`
   - `ai.personality_key`, optional `ai.wander_radius`
2. Add/update personality in `server/src/agents/personalities/templates.py`:
   - key: `personality_key`
   - required fields: `name`, `archetype`, `initial_hp`, `position`, `system_prompt`
   - ensure prompt includes `TOOL USAGE RULES` (tests expect this)
3. Keep manifest + personality consistent:
   - `stats.max_hp` should align with `initial_hp`
   - `transform.position` should align with template `position` unless intentionally different
4. Sync persisted runtime state (SQLite):
   - run reseed for repository DB updates:
     ```bash
     cd server
     rm -f data/game_state.db
     .venv/bin/python - <<'PY'
     import asyncio
     from src.world.world_state import WorldState
     WorldState._instance = None
     ws = WorldState()
     asyncio.run(ws.persist_all_state())
     print("Seeded NPC rows:", len(ws.npcs))
     PY
     ```
5. If changing an existing NPC’s personality and preserving player progress DB is important, do targeted upsert instead of deleting DB:
   - update that NPC through `WorldState.register_npc(...)` and `persist_all_state()`.

## Validation commands

Run these from `server/`:

```bash
.venv/bin/pytest tests/domains/agents/test_personalities.py -q
.venv/bin/pytest tests/domains/world/test_world_state.py tests/domains/world/test_world_state_persistence.py -q
.venv/bin/pytest tests/domains/agents/test_ai_integration_formal_flow.py -q
```

## Output format

Return:

1. Files changed
2. New/updated NPC IDs and personality keys
3. DB sync action taken (reseed or targeted upsert)
4. Test command summary

## Guardrails

- Never add NPCs only in one place; update both manifest and personality definitions.
- Do not silently reuse an unrelated `personality_key`.
- Keep IDs stable once introduced; avoid renaming unless explicitly requested.
- Preserve JSON/Python style already used in neighboring entries.

