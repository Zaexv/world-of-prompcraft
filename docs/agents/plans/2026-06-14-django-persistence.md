---
date: 2026-06-14T00:18:10Z
git_commit: 52c4a426f690e6314a91fe995191b3c6cc430a6f
branch: main
topic: "Full game-state persistence via Django ORM"
tags: [plan, persistence, django, world-state, npc-memory, ui]
status: implemented
---

# Full Game-State Persistence (Django ORM) Implementation Plan

## Overview

Replace the quick-and-dirty raw-`sqlite3` `GameStore` with a Django-ORM-backed
persistence layer (models + migrations + admin), running **in-process** inside
the existing FastAPI server against the **same SQLite file**. Persist the full
durable game state — player vitals, gold, relational inventory, active/completed
quests — and, for the first time, **per-NPC relationship + conversation memory**
(today held only in LangGraph's in-memory `MemorySaver`, wiped on every restart).
All restored state must flow back to the client UI on join/interaction.

## Current State Analysis

**What already persists (crudely):**
- `PlayerData` (`server/src/world/player_state.py:10`) — hp, mana, level, gold,
  `inventory: list[str]`, `active_quests`, `completed_quests`, etc. Saved as a
  **single JSON blob** in the `players` table via `GameStore.save_player`
  (`server/src/persistence/store.py:57`), restored on join
  (`server/src/ws/handlers/join.py:96-103`) keyed by **`username`**.
- NPC mutable state (hp, position, loot_dropped) — `npcs` table
  (`store.py:84`), overlaid onto manifest NPCs at startup (`store.py:118`).
  **Dead NPCs survive**: hp=0 + loot_dropped persist, and `restore_world`
  re-spawns dead `proc_`/`enc_` NPCs as corpses so clients refuse respawn
  (`store.py:126-148`).
- Player-built **`world_objects`** (world-builder spawns) persist, but to a
  **separate disk JSON file** `shared/data/world_objects.json`
  (`world_state.py:245` `save_world_objects`), *not* the SQLite store.

**Other mutable WorldState NOT persisted:**
- **NPC `mood`** (`world_state.py:35`, mutated by `update_npc_mood`
  action `world_state.py:361`) — lives only in RAM; the `npcs` table stores
  hp/position/loot but **not mood**.
- `environment` (weather, time_of_day), `chat_history`, `recent_events`
  (`world_state.py:84-89`) — ephemeral, RAM only.
- Save cadence: periodic tick (`main.py:91`, default 30s), per-player on
  disconnect (`main.py:175`), whole-world on shutdown (`main.py:78`).

**What does NOT persist (the real gap):**
- **Per-NPC relationship + memory.** `NPCAgentState` carries
  `relationship_score`, `conversation_summary`, `mood`, `personality_notes`
  (`server/src/agents/agent_state.py:17-24`), kept across turns only by
  `MemorySaver()` (`server/src/agents/npc_agent.py:82`) — **in-process RAM,
  lost on restart.** `thread_id` is `f"{npc_id}_{player_id}"`
  (`server/src/agents/registry.py:226`).

**Pain points with the current approach:**
- Raw SQL string upserts, no schema versioning/migrations.
- Player stored as opaque JSON → not queryable, schema drift handled by
  silently discarding rows (`join.py:105`).
- `inventory` is a flat `list[str]` (`items.py:166` `stacked_inventory`) — no
  relational quantity model.
- No admin/inspection tooling.

**Client side (mostly ready):**
- `PlayerState.merge` already consumes hp/gold/inventory/activeQuests/
  completedQuests (`client/src/state/PlayerState.ts:81-101`).
- `NPCState` already stores `relationship_score`
  (`client/src/state/NPCState.ts:22,34`) — but it is not surfaced visually.

## Desired End State

1. A Django app owns the schema; `python server/manage.py makemigrations`/
   `migrate` manage it; migrations auto-run at server startup so dev needs no
   extra step.
2. `GameStore`'s public surface is reimplemented over the ORM (same call sites
   in `main.py`/`join.py` keep working) — raw SQL deleted.
3. Player persistence is **relational**: scalar columns + a `PlayerInventory`
   (player, item_name, quantity) table + completed-quest rows; active quests
   and **equipped items** stay JSON columns. Equipped gear (today only in
   `HandlerContext.player_equipment`, wiped on disconnect) becomes part of
   `PlayerData` and survives restart.
4. **NPC relationship + conversation memory survives restart** via a persisted
   LangGraph checkpointer (`AsyncSqliteSaver`), with `relationship_score`
   mirrored into a queryable `NPCRelationship` row for UI/admin.
5. Restored relationship is **visible in the UI** (interaction panel / nameplate).
6. Existing `data/world.db` blob data is imported once into the new tables.

### UI Mockups

Relationship surfaced on the NPC interaction panel (new line) and as a small
tint/badge on the nameplate:

```
 Current (interaction panel)            Proposed
 ┌────────────────────────────┐         ┌────────────────────────────┐
 │ Gnarled the Hermit         │         │ Gnarled the Hermit   ♥ +42 │
 │ "What do you want?"        │   ->    │ Friendly · "Ah, you again."│
 │ [ type a prompt … ]        │         │ [ type a prompt … ]        │
 └────────────────────────────┘         └────────────────────────────┘
        (relationship hidden)            (persisted score + label shown)
```

### Key Discoveries
- Persistence is cleanly decoupled: only `GameStore` knows data shapes; `main.py`
  owns *when* (`persistence/__init__.py:1-7`). Reimplementing internals is low-blast-radius.
- Player keyed by `username` everywhere (`join.py`, `main.py:175`) — natural PK.
- `relationship_score` already round-trips server→client (`registry.py:254` →
  `NPCState.ts:34`); the UI just doesn't render it.
- LangGraph ships `langgraph.checkpoint.sqlite.aio.AsyncSqliteSaver` — a drop-in
  persistent replacement for `MemorySaver` keyed on the same `thread_id`.
- `asgiref` (a Django dependency) provides `sync_to_async`; Django 5 also has
  native async ORM methods (`aget`, `acreate`, `asave`) for hot paths.

## What We're NOT Doing
- **No Postgres** — staying on SQLite (per decision).
- **No separate Django web service / no REST API** — ORM in-process only.
- **No per-instance item entities** — relational *stacks* only (uuid/durability/
  enchantment out of scope).
- **No auth/accounts** — `username` stays the identity key; no passwords.
- **No quest-objective normalization** — active quests stay JSON; only the
  completed-quest list and inventory go relational.
- **No persistence of ephemeral world state** — `environment` (weather/time),
  `chat_history`, `recent_events` reset each boot (capped deques, no gameplay
  value across sessions).
- **No client networking protocol changes** — reuse existing `playerStateUpdate`
  / `npcStateUpdate` payloads.

## Implementation Approach

Django runs **embedded**: a minimal settings module + one app
(`gamedata`) pointed at the existing SQLite path from `config.py`. `django.setup()`
+ `call_command("migrate")` run inside the FastAPI `lifespan` before the world is
restored. A thin **repository** module (the new `GameStore`) exposes the same
methods `main.py`/`join.py` already call, internally using async ORM. NPC memory
moves from `MemorySaver` to `AsyncSqliteSaver`; a `respond`-time hook mirrors
`relationship_score` into `NPCRelationship` for query/UI.

## Architecture and Code Reuse

```
                       FastAPI process (one)
  ┌──────────────────────────────────────────────────────────────┐
  │  lifespan(): django.setup() → migrate → GameStore(repo)       │
  │                                                                │
  │  ws handlers ──► GameStore (repo, async ORM) ──┐               │
  │  registry.invoke() ──► AsyncSqliteSaver ───────┤               │
  │                          (npc memory)          ▼               │
  │                                       ┌──────────────────┐     │
  │                                       │  data/world.db   │     │
  │                                       │  (single SQLite) │     │
  │   gamedata app tables:                │  + langgraph     │     │
  │   Player, PlayerInventory,            │    checkpoint    │     │
  │   CompletedQuest, NPCState,           │    tables        │     │
  │   NPCRelationship                     └──────────────────┘     │
  └──────────────────────────────────────────────────────────────┘
```

Reuse:
- `PlayerData` dataclass stays the **runtime** in-memory shape; the ORM is the
  storage shape. Repo converts `PlayerData ⇄ rows` (replacing `asdict`/`**doc`).
- `items.stacked_inventory` / `items.resolve` unchanged — repo stores stacks,
  runtime still flattens to `list[str]`.
- `QuestInstance` storage/client dicts unchanged.
- Existing call sites in `main.py` and `join.py` unchanged (same method names).

Affected file tree:
```
server/
  manage.py                              # NEW — makemigrations/migrate entry
  pyproject.toml                         # +django, (asgiref transitive)
  src/
    config.py                            # + django settings knobs (reuse persistence_db_path)
    persistence/
      __init__.py                        # export GameStore (unchanged surface)
      store.py                           # REWRITE — ORM-backed repo (raw SQL deleted)
      django_settings.py                 # NEW — embedded Django settings
      gamedata/                          # NEW — Django app
        __init__.py
        apps.py
        models.py                        # Player, PlayerInventory, CompletedQuest, NPCState, NPCRelationship, WorldObject
        admin.py                         # register models
        migrations/                      # generated
      importer.py                        # NEW — one-shot blob→ORM import of old world.db
    main.py                              # lifespan: django.setup()+migrate; checkpointer lifecycle
    world/world_state.py                 # load/save_world_objects → ORM (was JSON file)
    agents/
      npc_agent.py                       # MemorySaver → injected AsyncSqliteSaver
      registry.py                        # accept checkpointer; mirror relationship→NPCRelationship
client/
  src/ui/InteractionPanel.ts             # render relationship label/score
  src/ui/Nameplate.ts                    # optional relationship tint
  src/state/NPCState.ts                  # (already holds relationship_score)
```

---

## Phase 1: Embedded Django bootstrap (no behavior change)

### Overview
Stand up Django in-process with an empty `gamedata` app, settings, `manage.py`,
and startup `migrate`. No persistence rewired yet — proves the embed works.

### Changes Required:

#### [x] 1. Dependencies
**File**: `server/pyproject.toml`
**Changes**: add `"django>=5.0,<6.0"` to `dependencies`.

#### [x] 2. Embedded settings
**File**: `server/src/persistence/django_settings.py`
```python
from __future__ import annotations
from ..config import settings as app_settings
DATABASES = {"default": {"ENGINE": "django.db.backends.sqlite3",
                         "NAME": app_settings.persistence_db_path}}
INSTALLED_APPS = ["django.contrib.contenttypes", "django.contrib.auth",
                  "django.contrib.admin", "src.persistence.gamedata"]
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
USE_TZ = True
SECRET_KEY = "dev-only-not-secret"  # noqa: S105 — local admin only
```

#### [x] 3. App skeleton + manage.py
**Files**: `server/src/persistence/gamedata/{__init__.py,apps.py,models.py,admin.py}`,
`server/manage.py`
```python
# apps.py
class GamedataConfig(AppConfig):
    name = "src.persistence.gamedata"
    default_auto_field = "django.db.models.BigAutoField"
# manage.py sets DJANGO_SETTINGS_MODULE=src.persistence.django_settings then
# execute_from_command_line(sys.argv)
```

#### [x] 4. Startup wiring
**File**: `server/src/main.py` (in `lifespan`, before world restore)
```python
import os, django
from django.core.management import call_command
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "src.persistence.django_settings")
django.setup()
await asyncio.to_thread(call_command, "migrate", "--no-input")
```

### Success Criteria:

#### Automated Verification:
- [x] `cd server && python manage.py makemigrations gamedata` produces a migration
- [x] `cd server && python manage.py migrate` succeeds against `data/world.db`
- [x] Type checking passes: `make typecheck`
- [x] Linting passes: `make lint`
- [x] Server boots: `python -m uvicorn src.main:app --port 8000` logs "Backend ready"

---

## Phase 2: Player persistence over the ORM

### Overview
Model the player relationally and reimplement `GameStore`'s player methods over
the ORM, keeping the exact public surface (`save_player`, `load_player`).

### Changes Required:

#### [x] 1. Models
**File**: `server/src/persistence/gamedata/models.py`
```python
class Player(models.Model):
    username = models.CharField(primary_key=True, max_length=20)
    hp = models.IntegerField(default=100); max_hp = models.IntegerField(default=100)
    mana = models.IntegerField(default=50); max_mana = models.IntegerField(default=50)
    level = models.IntegerField(default=1); gold = models.IntegerField(default=0)
    kill_count = models.IntegerField(default=0)
    race = models.CharField(max_length=32, default="human")
    faction = models.CharField(max_length=32, default="alliance")
    position = models.JSONField(default=list); yaw = models.FloatField(default=0.0)
    active_quests = models.JSONField(default=list)   # nested objective shape kept as JSON
    equipped = models.JSONField(default=dict)        # slot -> item_name (weapon/shield/trinket)
    updated_at = models.DateTimeField(auto_now=True)

class PlayerInventory(models.Model):       # relational stacks
    player = models.ForeignKey(Player, related_name="items", on_delete=models.CASCADE)
    item_name = models.CharField(max_length=64)
    quantity = models.IntegerField(default=1)
    class Meta: unique_together = ("player", "item_name")

class CompletedQuest(models.Model):
    player = models.ForeignKey(Player, related_name="completed", on_delete=models.CASCADE)
    quest_id = models.CharField(max_length=64)
    class Meta: unique_together = ("player", "quest_id")
```

#### [x] 2. Repo: PlayerData ⇄ rows
**File**: `server/src/persistence/store.py`
**Changes**: `save_player(username, player: PlayerData)` upserts `Player` row +
diffs inventory into stacked `PlayerInventory` rows (collapse `list[str]` via a
Counter) + syncs `CompletedQuest`. `load_player(username) -> dict | None` rebuilds
the dict consumed by `PlayerData(**doc)` in `join.py` (flatten inventory stacks
back to `list[str]`). Wrap multi-row writes in `sync_to_async(transaction.atomic)`.

#### [x] 2b. Equipped items in PlayerData (single source of truth)
**Files**: `server/src/world/player_state.py`, `server/src/ws/handlers/items.py`,
`server/src/ws/handlers/join.py`
**Changes**: add `equipped: dict[str, str | None] = field(default_factory=dict)`
to `PlayerData` + include in `to_dict`. `handle_equip_item` writes
`world_state.get_player(pid).equipped = equipped` (persisted) while still
mirroring `ctx.player_equipment[pid]` (combat read cache). On join restore, seed
`ctx.player_equipment[username]` from the restored `player.equipped` so combat
multipliers work immediately. Persisted via the `Player.equipped` JSON column.

#### [x] 3. Admin
**File**: `server/src/persistence/gamedata/admin.py` — register all models.

### Success Criteria:

#### Automated Verification:
- [x] Player round-trip test passes (rewrite `server/tests/domains/test_persistence.py`):
      save `PlayerData` with gold/inventory/quests → `load_player` returns
      equivalent dict; `PlayerData(**doc)` reconstructs equal state.
- [x] Inventory stacks: 3×"health potion" persists as one row qty=3, restores to 3 strings.
- [x] `make test` (server) passes; `make typecheck`; `make lint`.

#### Manual Verification:
- [ ] Join as `zaex`, gain gold + items + complete a quest, restart server,
      rejoin → gold, inventory, completed quests all restored in the UI panels.

---

## Phase 3: NPC + world-object state over the ORM

### Overview
Move hp/position/loot_dropped/**mood** off the raw `npcs` table onto an ORM
model (preserving corpse-restore for dead `proc_`/`enc_` NPCs), and fold the
player-built `world_objects` (today a separate JSON file) into the same DB so
all world state has one source of truth.

### Changes Required:

#### [x] 1. NPC model (incl. mood)
**File**: `gamedata/models.py`
```python
class NPCState(models.Model):
    npc_id = models.CharField(primary_key=True, max_length=64)
    hp = models.IntegerField(); position = models.JSONField(default=list)
    loot_dropped = models.BooleanField(default=False)
    mood = models.CharField(max_length=32, default="neutral")  # NEW — was RAM-only
    updated_at = models.DateTimeField(auto_now=True)
```

#### [x] 2. NPC repo methods
**File**: `store.py` — reimplement `save_npc`, `load_npc_overrides`,
`save_world`, `restore_world` over the ORM. Persist + restore `mood` alongside
hp/position/loot. Keep `restore_world`'s manifest-overlay + dead-proc-corpse
logic byte-for-byte (`store.py:126-148`).

#### [x] 3. World objects → ORM
**File**: `gamedata/models.py`, `server/src/world/world_state.py`
```python
class WorldObject(models.Model):
    object_id = models.CharField(primary_key=True, max_length=64)
    params = models.JSONField()   # full spawn dict (objectType, position, scale, spec…)
```
**Changes**: reimplement `WorldState.load_world_objects` / `save_world_objects`
(`world_state.py:230-252`) over `WorldObject` rows instead of the JSON file.
One-shot import of existing `shared/data/world_objects.json` (fold into Phase 6
importer). Keep the in-memory `self.world_objects` dict + `add/remove` API
unchanged — only the load/save backends change.

### Success Criteria:

#### Automated Verification:
- [x] `test_world_roundtrip_restores_player_and_npc_state` (ported) passes.
- [x] Dead `proc_*` NPC restored as corpse (hp=0, loot_dropped) test passes.
- [x] NPC `mood` round-trips (set mood → save → restore → same mood).
- [x] World-object round-trip: spawn object → save → reload → object present.
- [x] `make test` / `make typecheck` / `make lint` pass.

#### Manual Verification:
- [ ] Kill an NPC, build a structure, restart → NPC stays dead (corpse, no
      respawn) and the built structure is still there.

---

## Phase 4: Persist NPC relationship + conversation memory

### Overview
Replace in-memory `MemorySaver` with `AsyncSqliteSaver` so each `(npc, player)`
thread's `relationship_score`, `conversation_summary`, `mood`, `personality_notes`
and message history survive restart. Mirror `relationship_score` into a queryable
`NPCRelationship` row.

### Changes Required:

#### [x] 1. Mirror model
**File**: `gamedata/models.py`
```python
class NPCRelationship(models.Model):
    npc_id = models.CharField(max_length=64); player = models.CharField(max_length=20)
    relationship_score = models.IntegerField(default=0)
    mood = models.CharField(max_length=32, default="neutral")
    updated_at = models.DateTimeField(auto_now=True)
    class Meta: unique_together = ("npc_id", "player")
```

#### [x] 2. Persistent checkpointer
**File**: `server/src/agents/npc_agent.py`, `server/src/agents/registry.py`,
`server/src/main.py`
**Changes**: `create_npc_agent(...)` accepts an injected `checkpointer` instead of
constructing `MemorySaver()` (`npc_agent.py:82`). In `lifespan`, open
`AsyncSqliteSaver.from_conn_string(persistence_db_path)` (async context manager —
enter on startup, exit on shutdown), pass into `AgentRegistry`, thread into every
`graph.compile(checkpointer=...)`. `thread_id` stays `f"{npc_id}_{player_id}"`.

#### [x] 3. Mirror on response
**File**: `server/src/agents/registry.py` (after building `npc_state_update`, ~`:254`)
**Changes**: upsert `NPCRelationship(npc_id, player_id)` with `relationship_score`/
`mood` from `result`, via `sync_to_async`. (Best-effort; failure logged, not fatal.)

### Success Criteria:

#### Automated Verification:
- [x] Test: invoke an NPC twice across two `AgentRegistry` instances sharing one
      DB → second invocation's input state carries the prior `relationship_score`
      / `conversation_summary` (proves checkpointer persisted, not RAM).
- [x] `NPCRelationship` row written with expected score after an interaction.
- [x] `make test` / `make typecheck` / `make lint` pass.

#### Manual Verification:
- [ ] Talk to an NPC until it likes you (score rises), restart server, talk again
      → NPC references the past and `npcStateUpdate.relationship_score` is retained,
      not reset to 0.

---

## Phase 5: Reflect persisted relationship in the UI

### Overview
Surface the (now persistent) relationship in the interaction UI and verify all
restored player state renders. Player vitals/gold/inventory/quests already merge
(`PlayerState.ts:81`); this phase adds the relationship visual.

### Changes Required:

#### [x] 1. Interaction panel
**File**: `client/src/ui/InteractionPanel.ts`
**Changes**: read `NPCState.relationship_score`, render a label + value
(e.g. `Hostile/Wary/Neutral/Friendly/Trusted` thresholds, `♥ +42`).

#### [x] 2. Nameplate tint (optional)
**File**: `client/src/ui/Nameplate.ts`
**Changes**: tint name color by relationship band.

#### [x] 3. Initial relationship on join (optional polish)
**File**: `server/src/ws/handlers/join.py`
**Changes**: include each nearby NPC's persisted `relationship_score` from
`NPCRelationship` in the `join_ok` NPC payload so the bar shows correct value
**before** the first interaction (instead of defaulting to 0).

### Success Criteria:

#### Automated Verification:
- [x] Vitest: relationship-label mapping (score→band) unit test passes.
- [x] `make lint` / `make typecheck` (client) pass.

#### Manual Verification:
- [ ] Open interaction panel for a known NPC → relationship label/score shown.
- [ ] Restart + rejoin → same relationship value displayed (matches Phase 4).

---

## Phase 6: Migrate old data + delete raw SQL

### Overview
One-shot import of any existing `data/world.db` blob rows into the new tables,
then remove the legacy raw-`sqlite3` schema/code paths.

### Changes Required:

#### [x] 1. Importer
**File**: `server/src/persistence/importer.py`
**Changes**: if legacy `players`/`npcs` blob tables exist, read each row, build
`PlayerData`/NPC overrides, write via the new repo, mark imported (drop or rename
legacy tables). Also import existing `shared/data/world_objects.json` into
`WorldObject` rows (then leave the file as a backup). Invoke once from `lifespan`
after `migrate`, guarded by a flag.

#### [x] 2. Delete legacy SQL
**File**: `server/src/persistence/store.py`
**Changes**: remove `_SCHEMA`, `sqlite3.connect`, `executescript`, all raw
upsert strings — repo is fully ORM.

### Success Criteria:

#### Automated Verification:
- [x] Importer test: seed a legacy-shaped sqlite blob DB → import → ORM rows match.
- [x] `grep -rn "executescript\|sqlite3.connect\|INSERT INTO" server/src/persistence`
      returns nothing.
- [x] Full `make check` passes.

#### Manual Verification:
- [ ] Boot once against a real pre-existing `data/world.db` → existing players keep
      their gold/items/quests; no data loss.

---

## Testing Strategy

### Unit Tests (server, pytest):
- Player round-trip: scalars + relational inventory stacks + completed quests +
  active-quest JSON.
- Inventory collapse/expand symmetry (`list[str]` ⇄ stacked rows).
- NPC override restore incl. dead-proc corpse path.
- Checkpointer persistence across two registry instances (relationship survives).
- `NPCRelationship` mirror upsert.
- Legacy blob importer → ORM parity.

### Unit Tests (client, Vitest):
- relationship score → band/label mapping.

### Integration Tests:
- Boot → join → mutate (gold/item/quest/relationship) → shutdown (forces save) →
  reboot → join → assert all restored (drive via WS handler functions).

### Manual Testing Steps:
1. Run server + client; join as a username; buy/receive items, earn gold, accept
   and complete a quest.
2. Talk to one NPC repeatedly until its relationship label changes.
3. Restart the server; rejoin with the same username.
4. Confirm gold, inventory, quest log, and the NPC's relationship label are all
   exactly as left.
5. Open `http://localhost:8000/admin` (after `createsuperuser`) and confirm rows
   for the player, inventory, and relationship.

## Performance Considerations
- Persistence calls are low-frequency (join, disconnect, 30s tick, shutdown) and
  the relationship mirror is one tiny upsert per NPC turn — `sync_to_async`
  thread-pool cost is negligible vs. LLM latency.
- SQLite single-writer: keep `transaction.atomic` blocks short; enable WAL
  (`PRAGMA journal_mode=WAL`) in settings `OPTIONS` to reduce write contention
  under concurrent players.
- `AsyncSqliteSaver` writes graph state per NPC turn; same DB file — WAL covers it.

## Migration Notes
- First boot after deploy runs `migrate` (creates tables) then the one-shot
  `importer` (Phase 6) folds legacy blob rows in. Idempotent: guard by checking
  for legacy tables / an `imported` marker.
- Rollback: legacy `GameStore` is replaced, so rollback = revert the branch; the
  SQLite file gains new tables but legacy `players`/`npcs` blobs are left intact
  until the importer drops them — keep a `data/world.db` backup before first boot.

## References
- Current store: `server/src/persistence/store.py`
- Player runtime shape: `server/src/world/player_state.py:10`
- NPC memory gap: `server/src/agents/agent_state.py:17`, `server/src/agents/npc_agent.py:82`, `server/src/agents/registry.py:226`
- Save lifecycle: `server/src/main.py:45-100`
- Restore on join: `server/src/ws/handlers/join.py:96-103`
- Item model: `server/src/world/items.py:166`
- Client merge: `client/src/state/PlayerState.ts:81`, `client/src/state/NPCState.ts:34`
- LangGraph persistent checkpointer: `langgraph.checkpoint.sqlite.aio.AsyncSqliteSaver`
