---
name: add-lore-skill
description: Add or update lore entries used by World of Promptcraft RAG retrieval. Use this skill whenever the user asks to add lore, expand worldbuilding, include new factions/events/locations/characters, or improve NPC contextual knowledge. Trigger this skill even when the request says "add backstory" or "teach NPCs about X".
---

# Add Lore Skill

Use this skill to add lore that is actually retrievable at runtime.

## Primary file

- `server/src/rag/knowledge_base.py`
  - Update `KNOWLEDGE_BASE: list[dict[str, Any]]`
  - Each entry must include:
    - `topic` (short title)
    - `category` (e.g. `races`, `locations`, `characters`, `events`, `factions`)
    - `content` (clear factual paragraph(s))

## How retrieval works (important)

`server/src/rag/retriever.py` uses keyword overlap with boosts for:

- topic token matches
- category token matches

So write entries to be discoverable:

1. Put canonical terms in `topic` (exact names users will type).
2. Include synonyms/aliases in `content` naturally.
3. Use a meaningful `category` that users may include in prompts.

## Implementation workflow

1. Search `knowledge_base.py` for existing topic first.
2. If topic exists:
   - extend or correct the existing entry rather than duplicating.
3. If topic does not exist:
   - append a new entry in the most appropriate section.
4. Keep formatting consistent with surrounding entries.
5. If lore introduces new NPC-specific behavior/dialogue constraints, optionally update:
   - `server/src/agents/personalities/templates.py`
   - only when explicitly needed by the user request.

## Validation commands

Run from `server/`:

```bash
.venv/bin/pytest tests/domains/tools/test_retriever.py -q
.venv/bin/pytest tests/domains/agents/test_ai_integration_formal_flow.py -q
```

## Output format

Return:

1. Lore topics added/updated
2. Category used per entry
3. Any related personality updates (if made)
4. Test command summary

## Guardrails

- Do not add contradictory lore without noting it.
- Avoid duplicates with near-identical topics.
- Keep entries lore-centric (no gameplay/tool instructions in lore entries).
- Keep content factual and concise enough for retrieval quality.

