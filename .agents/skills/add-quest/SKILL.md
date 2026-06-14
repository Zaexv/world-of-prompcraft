---
name: add-quest
description: Add a new quest to World of Promptcraft — curated (authored template) or improvised (NPC-generated). Use whenever the user wants to create, author, define, or wire up a quest, a quest objective, or a quest reward. Covers the server-authoritative quest data, NPC offering tools, progress/reward flow, and client rendering.
argument-hint: [quest idea, e.g. "a fetch quest for 5 herbs from Nireg rewarding 50 gold"]
---

# Add Quest

Quests are **server-authoritative**. The client only renders what the server sends
(`client/src/state/QuestDefinitions.ts` normalizes the wire shape; UI in
`client/src/ui/QuestLog.ts`, `QuestMarker.ts`, `QuestTracker.ts`). Do NOT define
quests on the client.

Two kinds:
- **Curated** — authored template, deterministic. Add to `QUEST_TEMPLATES`.
- **Improvised** — NPC generates one at runtime via the LLM (`offer_custom_quest`
  tool + `server/src/agents/quests/generator.py`). Server clamps rewards.

## Data model (`server/src/world/quests.py`)
```python
@dataclass
class QuestInstance:
    id, title, description, giver_npc_id, giver_name
    objectives: list[QuestObjective]   # each: id, description, kind, target, required, progress, completed
    reward: QuestReward                # gold, items, xp, description
    origin: str   # "curated" | "improvised"
    status: str   # "offered" | "active" | "completed"
```
Objective `kind` is one of: **kill | collect | talk | reach | enter_dungeon**.

## Add a CURATED quest
1. Add an entry to `QUEST_TEMPLATES: dict[str, QuestInstance]` in
   `server/src/world/quests.py` (~line 214). Mirror an existing template
   (`sacred_flame`, `village_patrol`, …): set `id`, `title`, `description`,
   `giver_npc_id`, objectives (with `kind`/`target`/`required`), and `reward`.
2. The NPC that gives it calls the `offer_quest("<your_quest_id>")` tool
   (`server/src/agents/tools/quest.py`). Make sure the giver's personality/prompt
   knows to offer it, or that `giver_npc_id` matches.
3. Rewards are clamped server-side by player level — keep them sane.

## Progress + completion flow (already wired)
- Player action advances objectives → `advance_quest_objective` tool emits
  `kind: "advance_objective"`; ws path in `server/src/ws/handlers/quest.py`.
- On all objectives complete → `quest_progress.complete_and_reward(player, quest_id)`
  (`server/src/world/quest_progress.py`) emits `complete_quest` + reward actions.
- `complete_quest` tool also exists for explicit turn-in.

## Improvised quests (no authoring needed)
NPCs may call `offer_custom_quest(title, description, objective_kind, ...)`.
Tune generation/clamping in `server/src/agents/quests/generator.py`
(`generate_quest`, `clamp_proposal`, `_reward_caps`).

## Verify
```bash
cd server && python -m pytest tests/domains/world/test_quests.py \
  tests/domains/world/test_quest_progress.py \
  tests/domains/tools/test_quest_tools.py -q
```

## Related
- New mechanic the quest needs (new action kind)? → **add-tool**.
- Quest giver is a new character? → **add-npc**.
