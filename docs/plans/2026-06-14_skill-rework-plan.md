# Skill Rework Plan — 2026-06-14 — ✅ DONE

Goal: collapse current skill sprawl into game-content skills, keep workflow
helpers untouched, create new skills.

**Status: completed on branch `ref/rework-skills`.**
Outcome: 7 game skills + 5 helpers under canonical `.agents/skills/` (with
`.claude/skills` symlinked to it). `mejorar-skills` was created then dropped per
user — global `skill-creator` covers skill authoring instead.

## Final skill set (planned 8 target + kept helpers)

| # | Final skill | Source | Action |
|---|-------------|--------|--------|
| 1 | ~~Mejorar Skills~~ | `skill-creator` (user-level) | created `mejorar-skills`, then DROPPED (use global skill-creator) |
| 2 | **Install Game** | — new — | create; wraps run commands from CLAUDE.md |
| 3 | **Add NPC** | `npc-registry-manager` (project) | rename `add-npc` |
| 4 | **Add Mesh** | `mesh-from-picture` + fold `mesh-quality-reviewer` + `threejs-geometry` | merge → `add-mesh` |
| 5 | **Map-Creators** | `agentic-map-creator` + fold `extend-world` + `3d-terrain-builder` | consolidate → `map-creators` |
| 6 | **Add Quest** | — new — | create; quest system already in code |
| 7 | **Performance-Review** | — new — | create |
| 8 | **Add Tool** | — new — | create; cleanest 3-file pattern |

Kept (workflow helpers, not in count): `rpi-research`, `rpi-plan`, `rpi-implement`,
`commit`, `create-architecture`.

Deleted outright: `agentic-promptcraft`. (`generative-agent` is user-level → leave it,
not in repo.)

## Folder consolidation — `.agents/skills/` is canonical (DECIDED)
Current state: TWO identical, git-tracked, hand-synced copies:
- `.agents/skills/`  (12 skills)
- `.claude/skills/`  (same 12 — `diff -rq` = identical)
Hand-sync via `cp`/`diff` lines polluting `.claude/settings.local.json`.

Target: single source of truth = **`.agents/skills/`**.
- Delete real tree at `.claude/skills/`, replace with symlink
  `.claude/skills -> ../.agents/skills` so Claude Code still loads skills.
  (Symlink is git-trackable; Claude Code reads skills through it.)
- All skill content rework happens inside `.agents/skills/` ONLY.
- Strip stale `cp .claude/skills/... .agents/skills/...` + `diff .claude/skills ... .agents/skills ...`
  permission entries from `.claude/settings.local.json` (no longer needed — one copy).
- VERIFY after symlink: Claude Code lists the skills. If it does NOT follow the
  symlink, fallback = keep `.claude/skills/` real but add a one-shot sync, OR set a
  settings skills-path key. (Symlink attempted first.)

### Reference scan result
Skill-FOLDER refs to fix = `.claude/settings.local.json` only (+ this plan doc).
`src.agents.*` Python imports are server code, NOT the skill folder — untouched.

### Global non-game user skills
`run-plinowapp`, `character-style`, `find-skills` etc. = leave at `~/.claude/skills/`,
do NOT pull into repo. (User: "don't use it".)

## skill-creator / create-architecture (DECIDED: keep)
- `create-architecture` NOT deleted — kept in `.agents/skills/`.
- `skill-creator` → COPY into `.agents/skills/mejorar-skills/` (keep user-level original).

## Per-skill detail

### 1. Mejorar Skills (← skill-creator)
- Copy `~/.claude/skills/skill-creator/` → project `.claude/skills/mejorar-skills/`.
- Update frontmatter `name: mejorar-skills`, Spanish-friendly description/trigger
  ("mejorar skill", "crear skill", "create/improve a skill").
- Keep skill-creator's eval/benchmark tooling intact.

### 2. Install Game (NEW)
- Wraps CLAUDE.md Quick Start. Two services:
  - server: `cd server && pip install -e ".[dev]" && python -m uvicorn src.main:app --reload --port 8000`
  - client: `cd client && corepack enable && pnpm install && pnpm run dev`
- Skill checks deps, runs both (background), reports ports (5173 client / 8000 server WS).
- Trigger: "install game", "run the game", "start dev servers", "set up locally".

### 3. Add NPC (← npc-registry-manager)
- Rename dir + `name: add-npc`.
- Pattern (CLAUDE.md "Adding a new NPC"): personality `templates.py` → definition
  `npc_definitions.py` → auto-register. Plus `npc-registry-manager` manifest logic.

### 4. Add Mesh (merge 3)
- Base = `mesh-from-picture` (image → Three.js mesh class → register → place).
- Fold in `threejs-geometry` (geometry/instancing reference) as supporting doc.
- Fold in `mesh-quality-reviewer` (PBR/LOD/collider audit) as a verify step.
- Result: create from picture OR scratch, then self-review quality. `name: add-mesh`.

### 5. Map-Creators (consolidate 3) — RESOLUTION
- Overlap risk: 3 skills cover different layers. Decision:
  - `agentic-map-creator` (manifest: biomes/landmarks) = core.
  - `extend-world` (buildings/veg/effects/collision placement) = folded as "place content" mode.
  - `3d-terrain-builder` (terrain seams/LOD/physics debug) = folded as "debug terrain" mode.
- One skill, three modes documented in SKILL.md. `name: map-creators`.
- Alt rejected: pushing terrain-debug into Performance-Review (terrain debug is
  authoring, not perf profiling).

### 6. Add Quest (NEW)
- Quest system exists. Touch points:
  - server tool: `server/src/agents/tools/quest.py` (`create_quest_tools`)
  - quest data: `server/src/world/quests.py` (`QuestInstance`/`QuestObjective`/`QuestReward` dataclasses)
  - progress: `server/src/world/quest_progress.py`; ws handler `server/src/ws/handlers/quest.py`
  - generator: `server/src/agents/quests/generator.py`
  - client render-only: `client/src/state/QuestDefinitions.ts`, UI `QuestLog/QuestMarker/QuestTracker.ts`
- Skill = author a quest end-to-end (objective kinds: kill|collect|talk|reach|enter_dungeon),
  wire reward, server-authoritative. `name: add-quest`.

### 7. Performance-Review (NEW)
- Scope = profile + report perf, client + server.
- Client: Three.js draw calls, instancing, GC pressure (CLAUDE.md: reuse vectors),
  LOD, chunk streaming cost.
- Server: agent latency, LangGraph node timing, WS throughput.
- Output = findings report (not auto-fix). Trigger: "performance review", "profile",
  "why is it slow", "optimize perf". `name: performance-review`.

### 8. Add Tool (NEW) — researched, cleanest pattern
- 3 mechanical steps:
  1. New `server/src/agents/tools/<name>.py` — closure `create_<name>_tools(pending_actions, world_state) -> list[Any]`, `@tool` fns append structured action to `pending_actions`.
  2. Register in `server/src/agents/tools/__init__.py`: add to `TOOL_FACTORIES` dict (~line 26) AND `get_all_tools` extend (~line 80).
  3. Client: handle action `kind` in `client/src/systems/ReactionSystem.ts` → 3D effect.
- Mirror existing combat/dialogue/trade/quest/music tools. `name: add-tool`.

## Execution order (after this plan approved) — all work in `.agents/skills/`
1. Folder consolidation FIRST:
   - `rm -rf .claude/skills` (real tree) → `ln -s ../.agents/skills .claude/skills`.
   - Strip stale cp/diff sync perms from `.claude/settings.local.json`.
   - Verify Claude Code still lists skills through symlink.
2. Renames (zero-risk): npc-registry-manager→add-npc, agentic-map-creator→map-creators.
3. Merges: add-mesh (mesh-from-picture + mesh-quality-reviewer + threejs-geometry),
   map-creators folds (extend-world + 3d-terrain-builder).
4. Copy skill-creator → .agents/skills/mejorar-skills.
5. Create new: install-game, add-quest, performance-review, add-tool.
6. Delete: agentic-promptcraft.
7. Verify: each SKILL.md frontmatter valid, no dangling references, symlink resolves.

## Final `.agents/skills/` contents (target)
8 game skills: mejorar-skills, install-game, add-npc, add-mesh, map-creators,
add-quest, performance-review, add-tool.
4 helpers kept: rpi-research, rpi-plan, rpi-implement, commit, create-architecture.
