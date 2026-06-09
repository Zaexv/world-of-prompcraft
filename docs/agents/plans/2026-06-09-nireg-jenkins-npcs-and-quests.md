---
date: 2026-06-09T15:08:05+00:00
git_commit: d76a7e3eba4000df5a5bb765a19211c47bf0a082
branch: feature/nireg-improvements
topic: "Nireg Jenkins NPCs and Quests"
tags: [plan, npcs, quests, personalities, lore, rag, fort-malaka]
status: draft
---

# Nireg Jenkins NPCs and Quests — Implementation Plan

## Overview

Add eight Fort Malaka characters and five quests defined in the Notion brief, wire
their personalities, place them in the world manifest, seed the requested canon
lore (Cárgarath / Fort Malaka) into the RAG knowledge base, and fix the existing
but personality-less `nireg_jenkins` NPC.

Two of these characters already have authored individual meshes (`zaex_01`,
`nireg_jenkins`); `eltito_01` is fully built. The remaining five (Juan, Abelardo,
Luisa, Sancho, Alonso) are net-new and will render via the existing keyword/style
mesh inference — **no new mesh authoring is in scope.**

## Current State Analysis

- **NPC definitions** are data-driven from `shared/data/world_manifest.json`
  (`zones.<zone>.population.npcs[]`), flattened by
  `server/src/world/npc_definitions.py:44`.
- **Personalities** live in `server/src/agents/personalities/templates.py`
  (`NPC_PERSONALITIES` dict). `world_state.refresh_npcs()`
  (`server/src/world/world_state.py:108`) resolves a manifest NPC's
  `ai.personality_key` (defaults to the NPC id) against this dict. A **missing
  key silently falls back** to `"You are a mysterious stranger."`
  (`world_state.py:110`).
- **Quests** are curated `QuestInstance` templates in
  `server/src/world/quests.py:204` (`QUEST_TEMPLATES`). Objective kinds are the
  closed set `("kill", "collect", "talk", "reach", "enter_dungeon")`
  (`quests.py:22`). NPCs offer them via `offer_quest(quest_id)`
  (`server/src/agents/tools/quest.py:50`) and confirm "report back" steps via
  `advance_quest_objective` + `complete_quest`.
- **Client rendering**: `NPC.create()` →
  `client/src/entities/npc/NPCAppearanceResolver.ts` resolves a mesh in priority
  order: `appearance.mesh` → `npc_individual_<id>` → `npc_style_<style>` →
  keyword inference from id/name. Individual meshes already registered:
  `npc_individual_zaex_01`, `npc_individual_nireg_jenkins`,
  `npc_individual_eltito_01`, `npc_individual_merchant_malaka_01`.
- **Lore / RAG**: `server/src/rag/knowledge_base.py` is currently **World of
  Warcraft lore** — none of the Cárgarath / Fort Malaka canon exists there.

### Key Discoveries:
- `nireg_jenkins` is in the manifest (`teldrassil_central`, lvl 60 / 5000 HP) but
  has **no personality template** → renders as "mysterious stranger". Its mesh
  exists. This is the core bug the branch name targets. (`world_state.py:108-110`)
- `zaex_01` has an authored mesh (`client/src/meshes/npcs/individual/Zaex.ts:47`)
  but is **absent from the manifest** and has no personality.
- `eltito_01` is fully implemented and already gives the `sacred_flame` quest
  (`templates.py:322`, `quests.py:205`).
- Custom quests are reward-clamped by player level; **curated** templates are not
  (`quest.py:115` vs `offer_quest`). New quests will be curated templates.
- Item rewards are free-form strings auto-resolved by `items.py`; explicit
  `ItemDef`s are optional.
- Fort Malaka zone bounds: x ∈ [-300, -100], z ∈ [-350, -150]
  (existing landmarks: church @ z≈-318, olive farm @ [-284, -334], plaza well @
  [-145, -282], guards @ ≈[-105, -262]).

### Decisions (confirmed with user):
1. **Relocate** Nireg (beach/fogata) and El Tito (near Fort Malaka) into the
   `fort_malaka` zone, matching Notion lore. New NPCs placed in `fort_malaka`.
2. **Use Notion ficha stats**: heroes lvl 9 / 900 HP, commoners lvl 1 / 100 HP
   (Alonso lvl 2 / 200 HP). Lower existing `nireg_jenkins` from 5000→900 HP.
3. **Include lore ingestion**: seed the Cárgarath / Fort Malaka canon into the
   RAG knowledge base so NPCs are lore-aware.

## Desired End State

Talking to each of the eight NPCs produces an in-character response (Spanish
flavor, correct speech patterns, greetings, attack triggers). Each quest giver
offers its quest, tracks objectives, and pays out on completion. The chain quest
(`Misión de cadena`) routes the player Zaex → El Tito → Nireg → back to Zaex.
Asking any Fort Malaka NPC about Cárgarath, King Paco, or the hermandad yields
lore-grounded answers via RAG. `make check` is green.

## What We're NOT Doing

- Authoring new individual meshes for Juan / Abelardo / Luisa / Sancho / Alonso
  (they use style/keyword inference; bespoke meshes are a future task).
- New objective *kinds* or quest-engine changes — all quests map to existing
  kinds.
- New tools (`deal_damage`, `offer_item`, etc. already cover every behavior).
- A reputation/guild system, patriarca mechanics, or hidden-guild access from the
  Fort Malaka lore (lore is ingested as knowledge, not as mechanics).
- Branching/stateful "make him laugh" judgement beyond a `talk` objective the NPC
  confirms via `advance_quest_objective`.

## Implementation Approach

Server-first, data-driven. Order: (1) personalities, (2) curated quests,
(3) manifest placement + relocation/stat edits, (4) lore ingestion, (5) client
verification + optional explicit styles, (6) tests. The manifest is the single
source of truth; agents auto-register on server start.

## Architecture and Code Reuse

```
Notion ficha ──► templates.py (NPC_PERSONALITIES[key])
                      ▲ resolved by personality_key
shared/data/world_manifest.json (zones.fort_malaka.population.npcs[])
   id ─► npc_individual_<id> mesh (zaex_01, nireg_jenkins)  [client]
   ai.style ─► npc_style_<style> mesh (new commoners)       [client]
quests.py QUEST_TEMPLATES ──► offer_quest(quest_id) tool ──► accept_quest action
knowledge_base.py KNOWLEDGE_BASE[] ──► retriever ──► NPC reason node (RAG)
```

Affected files:
```
server/src/agents/personalities/templates.py   # +7 personality entries
server/src/world/quests.py                      # +5 curated QuestInstance templates
shared/data/world_manifest.json                 # +6 NPCs, relocate+restat nireg/eltito
server/src/rag/knowledge_base.py                # + Cárgarath/Fort Malaka lore entries
server/src/world/items.py                       # (optional) explicit reward ItemDefs
server/tests/                                    # new tests for personalities+quests
```

---

## Phase 1: NPC Personalities

### Overview
Add 7 personality entries to `NPC_PERSONALITIES`. Keys must exactly match each
NPC's `personality_key` in the manifest. Each follows the existing structure:
`name`, `archetype`, `initial_hp`, `position`, `system_prompt` built from
identity + PERSONALITY + `_TOOL_RULES_PREAMBLE` + behavior/quest rules.

### Changes Required:

#### [ ] 1. Add personality templates
**File**: `server/src/agents/personalities/templates.py`
**Changes**: Add entries keyed `juan_pescador`, `guardia_abelardo`,
`luisa_patatera`, `sancho_barriga`, `alonso_quijano`, `zaex_01`, `nireg_jenkins`.

Each must encode, from the ficha:
- **juan_pescador** (archetype `quest_giver`): joyful & nostalgic, speaks like a
  poet in prose, pauses to gaze at the sea, strokes his chin. From Fuengirola;
  honoring his fisherman father; in love with Sara. Greets with `emote('wave')`.
  Attacks (`deal_damage`) only if his father is insulted. Offers quest
  `juan_story`.
- **guardia_abelardo** (`neutral_guard`): military, stern, ends most lines with
  "¡Por el Rey Paco!", stomps the ground (`emote`) on commands. Born in Fort
  Malaka center; enforces the law; adores King Paco, loathes thieves. Greets by
  standing at attention (`emote('bow')`/salute). Attacks if a crime is declared
  or the guard/King Paco is threatened. Offers quest `malaka_thieves`.
- **luisa_patatera** (`quest_giver`): energetic, rural Andalusian dialect
  (ceceo, clipped words), SHOUTS. Lives on the farms; wants to harvest potatoes
  before they spoil; friend of Nireg Jenkins (philosophizes with him). Greets
  with a whistle, calls the player like a goat. Attacks only if threatened with
  burning her farm. Loves potatoes. Offers quest `glorious_potatoes`.
- **sancho_barriga** (`quest_giver`): folksy but distrustful, speaks in refranes
  (proverbs), loudly insists the player join his quest. From northern plains;
  wants fair participation; lifelong friend of Alonso Quijano. Greets
  energetically (`emote('wave')`). Attacks if Alonso is insulted. Offers quest
  `make_him_laugh`.
- **alonso_quijano** (`neutral_wanderer`, lvl 2 / 200 HP): serious & meditative,
  well-read, speaks like an old caballero andante (archaic, elaborate Castilian),
  "the most serious man in the realm" — very hard to make laugh (not impossible).
  Friend of Sancho. Greets with long courtly archaic phrases. Attacks if Sancho
  is insulted. **Participates in** `make_him_laugh`: confirms a genuinely funny
  player line by calling `advance_quest_objective('make_him_laugh', 'amuse_alonso')`
  then `emote('laugh')`. Does NOT offer the quest himself.
- **zaex_01** (`quest_giver`, lvl 9 / 900 HP, historical hero): manly &
  mysterious, confident veteran adventurer/rogue, shouts "¡Chooo choooo!" when
  joyful (the hermandad's howl that slew Cárgarath). Legendary Fort Malaka
  rogue; wants riches to buy beer; great friend of El Tito & Nireg. Greets
  "Buenos días camarada" (`emote('wave')`). Attacks if someone tries to rob him.
  Gives useful adventurer/rogue advice. Offers the chain quest `heroes_reunion`.
- **nireg_jenkins** (`quest_giver`/oracle, lvl 9 / 900 HP, historical hero):
  mystical philosopher, conversations drift to existential themes / beauty of
  life / praise of shared wisdom, shouts "¡Xuuu xuuuu!" when joyful (hermandad
  howl). From the Tanis Desert; seeks the mysteries within and beyond this world;
  great friend of Zaex & El Tito. Greets "¡Buenas viajero!" with mixed joy and
  weariness. Floats slightly, bobbing (describe via dialogue / `spawn_effect`).
  Attacks only if challenged to a duel. **Participates in** `heroes_reunion`:
  when the player relays Zaex's request, confirm via
  `advance_quest_objective('heroes_reunion', 'consult_nireg')`.

Note El Tito (`eltito_01`) already participates conceptually as the wizard hero
("Chuuu chuuuu!"). Phase 2 wires him into `heroes_reunion`; his prompt gets one
appended block confirming `advance_quest_objective('heroes_reunion', 'consult_tito')`.

```python
"nireg_jenkins": {
    "name": "Nireg Jenkins",
    "archetype": "quest_giver",
    "initial_hp": 900,
    "position": [-220, 0, -345],
    "system_prompt": (
        "You are Nireg Jenkins, the Oracle — a mystic philosopher who slew the "
        "Dragon Emperor Cárgarath alongside Zaex Uve and El Tito...\n\n"
        "PERSONALITY:\n- ... existential, praises shared wisdom ...\n"
        "- When overjoyed you shout '¡Xuuu xuuuu!' (the hermandad's howl).\n\n"
        + _TOOL_RULES_PREAMBLE + "\n"
        "BEHAVIOR RULES:\n- Greet with '¡Buenas viajero!' ...\n"
        "- Only fight if challenged to a duel (deal_damage 30-50).\n\n"
        "QUEST - MISIÓN DE CADENA (heroes_reunion):\n"
        "- If the player comes bearing Zaex's question, share your wisdom and call "
        "advance_quest_objective('heroes_reunion', 'consult_nireg').\n"
    ),
},
```

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `make typecheck`
- [ ] Linting passes: `make lint`
- [ ] Module imports cleanly: `cd server && python -c "from src.agents.personalities.templates import NPC_PERSONALITIES; assert all(k in NPC_PERSONALITIES for k in ['juan_pescador','guardia_abelardo','luisa_patatera','sancho_barriga','alonso_quijano','zaex_01','nireg_jenkins'])"`

---

## Phase 2: Curated Quests

### Overview
Add 5 `QuestInstance` templates to `QUEST_TEMPLATES`. All map to existing
objective kinds. The chain quest is a multi-`talk` sequence the participating NPCs
confirm via `advance_quest_objective`.

### Changes Required:

#### [ ] 1. Add quest templates
**File**: `server/src/world/quests.py`
**Changes**: Append to `QUEST_TEMPLATES`:

- **`juan_story`** — "Escucha la historia del pescador". Objective: `talk`
  target `juan_pescador` (Juan advances/completes after telling his tale).
  Reward: small gold + "Anzuelo de la Suerte" + xp.
- **`malaka_thieves`** — "Hay nuevos ladrones en ésta zona". Objectives:
  `kill` target `any` required 3 (bandits), then `talk` target `guardia_abelardo`
  (report back). Reward: gold + "Comenda de la Guardia" + xp.
- **`glorious_potatoes`** — "¡Gloriosas patatas!". Objectives: `collect` target
  `"Patata"` required 5, then `talk` target `luisa_patatera`. Reward: gold +
  "Saco de Patatas Gloriosas" + xp.
- **`make_him_laugh`** — "Haz reír al hombre más serio del reino". Objective:
  `talk` target `alonso_quijano` id `amuse_alonso` (Alonso confirms via
  `advance_quest_objective` only on a genuinely funny line), then `talk` target
  `sancho_barriga` to report. Reward: gold + "Sonrisa de Alonso" + xp.
- **`heroes_reunion`** — "Misión de cadena". Objectives:
  `talk` `eltito_01` (`consult_tito`), `talk` `nireg_jenkins` (`consult_nireg`),
  `talk` `zaex_01` (`return_zaex`). Larger hero-tier reward: gold + a legendary
  item ("Aullido de la Hermandad") + xp.

```python
"heroes_reunion": QuestInstance(
    id="heroes_reunion",
    title="Misión de Cadena",
    description=(
        "Zaex Uve sends you to gather the wisdom of his fellow dragon-slayers: "
        "consult El Tito the mage, then Nireg Jenkins the oracle, then return."
    ),
    giver_npc_id="zaex_01",
    giver_name="Zaex Uve",
    objectives=[
        QuestObjective("consult_tito", "Consult El Tito", "talk", "eltito_01"),
        QuestObjective("consult_nireg", "Consult Nireg Jenkins", "talk", "nireg_jenkins"),
        QuestObjective("return_zaex", "Return to Zaex Uve", "talk", "zaex_01"),
    ],
    reward=QuestReward(
        gold=300, items=["Aullido de la Hermandad"], xp=250,
        description="The hermandad's howl — a token of the heroes who slew Cárgarath.",
    ),
),
```

#### [ ] 2. Wire quest givers in personalities
**File**: `server/src/agents/personalities/templates.py`
**Changes**: Each giver's prompt gets a `QUEST` block: call
`check_player_quests()` first; if absent → `offer_quest('<id>')`; if all
objectives done → `advance_quest_objective(...)` (report step) + `complete_quest`.
Append a `heroes_reunion` confirmation block to the existing `eltito_01` prompt
(`templates.py:322`) for `consult_tito`.

#### [ ] 3. (Optional) explicit reward ItemDefs
**File**: `server/src/world/items.py`
**Changes**: Optionally register the five reward items with rarity/description.
Free-form names already resolve, so this is polish only.

### Success Criteria:

#### Automated Verification:
- [ ] Type checking passes: `make typecheck`
- [ ] Quests instantiate: `cd server && python -c "from src.world.quests import instantiate; assert all(instantiate(q) for q in ['juan_story','malaka_thieves','glorious_potatoes','make_him_laugh','heroes_reunion'])"`
- [ ] Tests pass: `make test`

---

## Phase 3: Manifest Placement, Relocation & Stats

### Overview
Add the 6 new/missing NPCs to `zones.fort_malaka.population.npcs`, relocate Nireg
and El Tito into Fort Malaka, and apply ficha stats. All positions within bounds
x ∈ [-300,-100], z ∈ [-350,-150]. Y is best-effort (client ground-snaps).

### Changes Required:

#### [ ] 1. Add new NPCs to fort_malaka
**File**: `shared/data/world_manifest.json`
**Changes**: Append NPC objects (shape per `merchant_malaka_01`). `ai.style`
controls the placeholder mesh for the five commoners; `zaex_01` resolves its
individual mesh by id (no style needed).

| id | name | role | personality_key | level/HP | position | ai.style |
|----|------|------|-----------------|----------|----------|----------|
| `juan_pescador` | Juan el Pescador | quest_giver | juan_pescador | 1 / 100 | [-205, 0, -342] (beach) | merchant |
| `guardia_abelardo` | Guardia Abelardo | guard | guardia_abelardo | 1 / 100 | [-112, 3.6, -258] (by buildings) | guard |
| `luisa_patatera` | Luisa la Patatera | quest_giver | luisa_patatera | 1 / 100 | [-278, 2, -328] (potato field) | merchant |
| `sancho_barriga` | Sancho Barriga | quest_giver | sancho_barriga | 1 / 100 | [-150, 4, -280] (plaza) | merchant |
| `alonso_quijano` | Alonso Quijano | quest_giver | alonso_quijano | 2 / 200 | [-146, 4, -280] (plaza, by Sancho) | guard |
| `zaex_01` | Zaex Uve | quest_giver | zaex_01 | 9 / 900 | [-140, 4, -276] (front of tavern) | — (individual mesh) |

Verify `ai.style` propagates manifest → `npc_definitions` (`style` already read at
`npc_definitions.py:53`) → `world_state` → client NPC payload.

#### [ ] 2. Relocate + restat Nireg
**File**: `shared/data/world_manifest.json`
**Changes**: Move `nireg_jenkins` from `teldrassil_central` to `fort_malaka`
population. Set `stats.max_hp = 900`, `stats.level = 9`, `transform.position =
[-220, 0, -345]` (beach fogata, near Juan). Keep `ai.personality_key =
nireg_jenkins` (now backed by Phase 1 template).

#### [ ] 3. Relocate El Tito
**File**: `shared/data/world_manifest.json`
**Changes**: Move `eltito_01` from `teldrassil_central` to `fort_malaka`,
`transform.position ≈ [-185, 3, -300]` (Paseo Marítimo). Leave its stats as-is
(decision 2: ficha for new only; El Tito stats untouched).

#### [ ] 4. JSON validity
- [ ] `python3 -c "import json; json.load(open('shared/data/world_manifest.json'))"`

### Success Criteria:

#### Automated Verification:
- [ ] Manifest parses: `python3 -c "import json; json.load(open('shared/data/world_manifest.json'))"`
- [ ] NPC defs load all 8: `cd server && python -c "from src.world.npc_definitions import get_npc_definitions as g; d=g(); assert all(i in d for i in ['juan_pescador','guardia_abelardo','luisa_patatera','sancho_barriga','alonso_quijano','zaex_01','nireg_jenkins','eltito_01']); assert d['nireg_jenkins']['initial_hp']==900"`
- [ ] Personalities resolve (no "mysterious stranger"): `cd server && python -c "from src.world.world_state import WorldState; ws=WorldState(); ws.refresh_npcs(); assert 'mysterious stranger' not in ws.npcs['nireg_jenkins'].personality"`

#### Manual Verification:
- [ ] Start server + client; all 8 NPCs spawn in Fort Malaka with correct meshes/nameplates.
- [ ] Nireg renders his individual mesh on the beach (not the placeholder).

---

## Phase 4: Lore Ingestion (RAG)

### Overview
Seed the Cárgarath / Fort Malaka canon into `KNOWLEDGE_BASE` so NPCs can reference
it through the existing retriever.

### Changes Required:

#### [ ] 1. Add lore entries
**File**: `server/src/rag/knowledge_base.py`
**Changes**: Append `{topic, category, content}` entries covering:
- **Cárgarath el Inabarcable** & the 420-year "Era del Dragón"; the hermandad of
  heroes (Zaex Uve, El Tito, Destello Azul, Nireg Jenkins) who slew him; the
  current "Era de la Libertad" (year 100), "La Alianza".
- **Common religion** (nature/ancestor/celestial cults) + per-zone faiths.
- **Fort Malaka**: Phoenician origin, maritime trade, espetos, poets; danger from
  its people (thieves/pirates/bandits); guild/cofradía/patriarca structure.
- **King Paco de las Torres "el Eterno"**: unknown-age ruler, hotel/turismo
  economy, housing tension, growing guilds.
- **Landmarks**: La Alcazaba, El Teatro Romano, La Manquita, coastal watchtowers.
- **The hermandad howl** ("Chooo/Chuuu/Xuuu") shared by the three heroes.

Use a new category string (e.g. `"promptcraft_lore"`) consistent with existing
entry shape (`knowledge_base.py:11`).

### Success Criteria:

#### Automated Verification:
- [ ] Module imports: `cd server && python -c "from src.rag.knowledge_base import KNOWLEDGE_BASE; assert any('Cárgarath' in e['content'] for e in KNOWLEDGE_BASE)"`
- [ ] Retriever returns lore: `cd server && python -c "from src.rag.retriever import *"` (adapt to actual retriever API; confirm a query for 'Cárgarath' or 'Fort Malaka' returns ≥1 entry)
- [ ] Tests pass: `make test`

#### Manual Verification:
- [ ] Ask Zaex/Nireg "who killed Cárgarath?" → lore-grounded answer naming the hermandad.

---

## Phase 5: Client Verification & Optional Styles

### Overview
Confirm the client spawns and renders every NPC correctly. Mostly verification;
the only possible code touch is registering explicit `npc_style_*` for commoners
if keyword inference picks a poor placeholder.

### Changes Required:

#### [ ] 1. Verify mesh resolution
**Files**: `client/src/entities/npc/NPCAppearanceResolver.ts` (read-only),
`client/src/entities/NPCModels.ts` (read-only).
**Changes**: Confirm `zaex_01` and `nireg_jenkins` hit their individual meshes and
the commoners' `ai.style` (or keyword inference) yields acceptable placeholders.
Adjust `ai.style` values in the manifest if a placeholder looks wrong (data-only).

### Success Criteria:

#### Automated Verification:
- [ ] Client typechecks: `cd client && pnpm run typecheck` (or `make typecheck`)
- [ ] Client lints: `make lint`

#### Manual Verification:
- [ ] Each of the 8 NPCs is visually distinct and on-theme in the running client.

---

## Phase 6: Tests

### Overview
Lock behavior with unit tests mirroring existing conventions
(`server/tests/test_<module>.py`).

### Changes Required:

#### [ ] 1. Personality + quest tests
**File**: `server/tests/test_nireg_npcs_quests.py` (new)
**Changes**:
- Every new `personality_key` exists in `NPC_PERSONALITIES` and has a non-empty
  `system_prompt`, `archetype`, `initial_hp`.
- Each manifest NPC's `personality_key` resolves (no "mysterious stranger").
- The 5 new quests instantiate with the expected objective kinds/targets and a
  non-zero reward.
- `heroes_reunion` has 3 `talk` objectives targeting `eltito_01`, `nireg_jenkins`,
  `zaex_01` in order.

### Success Criteria:

#### Automated Verification:
- [ ] New tests pass: `cd server && python -m pytest tests/test_nireg_npcs_quests.py`
- [ ] Full suite green: `make check`

---

## Testing Strategy

### Unit Tests:
- Personality keys present + resolve for all 8 NPCs.
- 5 quests instantiate; objective kinds within `OBJECTIVE_KINDS`; rewards > 0.
- `nireg_jenkins` HP == 900 after `refresh_npcs()`.
- Lore: `KNOWLEDGE_BASE` contains Cárgarath/Fort Malaka entries; retriever surfaces them.

### Integration Tests:
- Manifest parses and `get_npc_definitions()` returns all 8.
- `WorldState.refresh_npcs()` builds all agents without fallback personality.

### Manual Testing Steps:
1. Run server + client (`make` quick-start from CLAUDE.md).
2. Walk Fort Malaka: confirm all 8 NPCs spawn at their positions with correct meshes.
3. Talk to each — verify voice/greeting/attack triggers per ficha.
4. Take `juan_story`, `malaka_thieves`, `glorious_potatoes`, `make_him_laugh` →
   complete each → reward paid.
5. Run the chain: Zaex offers `heroes_reunion` → talk El Tito → talk Nireg →
   return to Zaex → reward paid.
6. Ask an NPC about Cárgarath / King Paco → lore-grounded reply.

## Performance Considerations

Adding ~8 agents and ~6 lore entries is negligible (existing world has ~40 NPCs).
RAG entries are keyword-retrieved; a handful more has no measurable cost.

## Migration Notes

Removing `nireg_jenkins`/`eltito_01` from `teldrassil_central` and re-adding under
`fort_malaka` keeps the same ids, so `world_state.refresh_npcs()` treats them as
moves, not deletes (HP/dynamic state reset to new `max_hp`, expected here).

## References

- Notion brief: NPC fichas + Fort Malaka / Cárgarath lore (provided in request).
- `server/src/world/world_state.py:108-110` — personality_key resolution + fallback.
- `server/src/world/quests.py:204` — `QUEST_TEMPLATES` pattern.
- `server/src/agents/tools/quest.py:50` — `offer_quest` / `advance_quest_objective`.
- `client/src/entities/npc/NPCAppearanceResolver.ts` — mesh resolution priority.
- Existing exemplar quest: `sacred_flame` (`quests.py:205`, `templates.py:322`).
