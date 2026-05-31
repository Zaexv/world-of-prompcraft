# Agentic Merge Report + Plan

Branch reviewed: `origin/feature/improving-agents` / PR #19  
Working branch: `merge/agentic-cool-stuff`

## What was added

### Server / agent layer
- A richer NPC `reason` node that now builds prompts from zone, weather, nearby entities, recent chat, player state, memory, mood, and relationship score.
- Short social prompts now use a compact path, so tiny greetings do not pay the full tool-heavy prompt cost.
- Personality templates were expanded heavily for the named NPCs, with stronger tool directives and more specific behavior rules.
- The agent tools were split into focused modules:
  - `combat`
  - `dialogue`
  - `environment`
  - `quest`
  - `trade`
  - `world_query`
  - `world_builder`
- A new `world_builder_agent` was added so the server can answer world-editing prompts by placing/removing structures and vegetation.
- World state now tracks more live context: chat history, recent events, NPC refresh from the manifest, and action handling for damage/heal/items/weather/quests/movement/mood.
- Startup wiring was extended so the backend initializes the registry, world builder agent, and shared pending actions together.

### Client / world presentation
- A new scene split was introduced for the starting forest and desert areas.
- `SceneManager` was expanded to manage biome-specific scenes, quality scaling, LOD/shadow caches, and post-processing setup.
- The procedural populator and zone atmosphere logic were updated to fit the new world structure.
- The worldbuilder object catalog was reorganized into clearer groups:
  - `structures`
  - `mediterranean`
  - `vegetation`
  - `furniture`
  - `biomeProps`
- The world manifest was rewritten with richer biome tuning, topology features, zone definitions, NPC placement, and landmark data.
- Visual tuning work landed around terrain, water, biomes, and PBR map handling.

### Supporting/docs changes
- New architecture and plan documents were added around the world-building work.
- Test and integration updates were included for the new agent and world flows.

## What I would keep now

| Keep | Why |
|---|---|
| Agent prompt/context refactor | It improves NPC quality without changing core gameplay rules. |
| Tool modularization | It makes the agent layer easier to extend and reason about. |
| World builder agent | It adds a clear new capability and fits the agentic direction. |
| World state enrichment | It supports better NPC decisions and persistence. |
| Scene/world manifest updates | They are the main content-side expression of the new agentic system. |

## What I would defer

| Defer | Why |
|---|---|
| Forest/desert scene split | User asked to keep the mesh-based `main` path instead. |
| Broad audio stack removals | They are unrelated to the agentic merge goal. |
| Mesh-catalog deletions | Those are too destructive to take in blindly without a replacement plan. |
| Legacy doc/test cleanup tied to removed systems | Better to remove after the replacement path is fully confirmed. |
| Texture deletions | Keep only if the replacement assets are already wired in and validated. |

## Merge plan

1. Land the server-side agent improvements first so the new prompt/context logic is stable.
2. Merge the world-builder tooling and manifest-driven placement flow next.
3. Bring over the client scene/world updates that support the new world layout.
4. Review legacy removals separately and only keep the ones that still have a real replacement.
5. Run the normal repo checks before finalizing the merge.
