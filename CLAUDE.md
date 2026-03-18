# World of Promptcraft

A 3D WoW-inspired browser game where the core mechanic is **prompting**: type free-form text and LangGraph-powered NPC agents react dynamically.

## Stack

- **Client**: Three.js + TypeScript + Vite (`client/`)
- **Server**: FastAPI + LangGraph + Python 3.11+ (`server/`)
- **Communication**: WebSocket (port 8000)

## Quick Start

```bash
# Client
cd client && npm install && npm run dev

# Server (needs .env with LLM keys)
cd server && pip install -e ".[dev]" && uvicorn src.main:app --reload --port 8000
```

## Project Structure

```
client/src/
  main.ts            # Game bootstrap (called from LoginScreen)
  scene/             # Three.js scene: Terrain, Water, Skybox, Lighting, Buildings, Vegetation, Effects
  entities/          # Player, NPC, EntityManager, NPCAnimator, PlayerController
  systems/           # InteractionSystem, ReactionSystem, CollisionSystem, WorldGenerator
  ui/                # InteractionPanel, StatusBars, InventoryPanel, CombatHUD, CombatLog, DeathScreen, LoginScreen
  network/           # WebSocketClient, MessageProtocol
  state/             # PlayerState (singleton), WorldState, NPCState
  utils/             # MathHelpers, AssetLoader

server/src/
  main.py            # FastAPI app + WebSocket endpoint
  config.py          # Pydantic Settings (LLM provider config)
  agents/            # LangGraph NPC agents
    npc_agent.py     # StateGraph factory (reason → act → respond)
    registry.py      # NPC ID → compiled agent map
    agent_state.py   # TypedDict state schema
    nodes/           # reason.py, act.py, respond.py
    tools/           # combat.py, dialogue.py, trade.py, environment.py, world_query.py
    personalities/   # templates.py (system prompts per NPC archetype)
  world/             # world_state.py, player_state.py, npc_definitions.py, zones.py
  rag/               # knowledge_base.py (47 WoW lore entries), retriever.py (keyword matching)
  llm/               # provider.py (configurable Claude/OpenAI)
  ws/                # handler.py, protocol.py, connection_manager.py
```

## Key Architecture

- **Server-authoritative state**: WorldState lives on the server; client is a render mirror.
- **Per-NPC agents**: Each NPC gets its own LangGraph StateGraph with independent memory (MemorySaver).
- **Tool-driven mechanics**: LLM calls typed tools (`deal_damage`, `heal_target`, `offer_item`, etc.) that produce structured actions.
- **Prompt as the only input**: No attack/trade buttons — text prompt IS the game interface.
- **Generative world**: Infinite chunk-based terrain (64x64), NPCs/trees spawned procedurally on exploration.

## Development Commands

```bash
# Lint
cd client && npm run lint          # ESLint
cd server && ruff check src tests  # Ruff linter
cd server && ruff format --check src tests  # Ruff formatter check

# Test
cd client && npm test              # Vitest
cd server && pytest                # pytest

# Type check
cd client && npx tsc --noEmit      # TypeScript
cd server && mypy src              # mypy

# All checks (from project root)
make check                         # runs lint + typecheck + tests for both
```

## Conventions

### TypeScript (Client)
- Strict mode enabled (`tsconfig.json`)
- ESLint with `@typescript-eslint` for linting
- No `any` unless absolutely necessary — prefer unknown + type guards
- Classes for entities/systems, interfaces for data shapes
- Three.js objects: reuse vectors/matrices to avoid GC pressure (see `PlayerController.ts`)

### Python (Server)
- Python 3.11+, `from __future__ import annotations` in every file
- Ruff for linting and formatting (replaces flake8/black/isort)
- mypy for type checking (strict mode)
- `@dataclass` for data containers, Pydantic `BaseModel` for API schemas
- Tools use the factory/closure pattern: `create_X_tools(pending_actions, world_state)` returns `@tool`-decorated functions

### Testing
- **Client**: Vitest for unit tests (utils, state, protocol)
- **Server**: pytest + pytest-asyncio for async tests
- Tests live in `client/src/__tests__/` and `server/tests/`
- Test file naming: `test_<module>.py` (Python), `<Module>.test.ts` (TypeScript)

### Git
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Pre-commit hooks run lint + typecheck + tests automatically
- Never commit `.env` files or API keys

## Common Patterns

### Adding a new NPC
1. Add personality in `server/src/agents/personalities/templates.py` (include `_TOOL_RULES_PREAMBLE`)
2. Add definition in `server/src/world/npc_definitions.py`
3. Agent is auto-registered by `registry.py` on server start
4. Client spawns the NPC model via EntityManager using server-pushed NPC list

### Adding a new tool
1. Create tool function in the appropriate `server/src/agents/tools/` file
2. Use the closure pattern: accept `pending_actions` and `world_state`
3. Register in `server/src/agents/npc_agent.py` tool binding
4. Handle the action `kind` in `ReactionSystem.ts` on the client

### WebSocket message flow
1. Client sends `PlayerInteraction` (type: "interaction", npcId, prompt, playerState)
2. Server routes to NPC's LangGraph agent via `registry.invoke()`
3. Agent returns `AgentResponse` (dialogue + actions[])
4. Client `ReactionSystem` processes actions → 3D effects, HP changes, items, etc.
