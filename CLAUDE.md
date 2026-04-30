# World of Promptcraft

3D multiplayer RPG where the core mechanic is prompting — type free-form text and LangGraph-powered NPC agents react dynamically.

## Stack

- **Client**: Three.js + TypeScript + Vite (`client/`)
- **Server**: FastAPI + LangGraph + Python 3.11+ (`server/`)
- **Communication**: WebSocket (port 8000)

## Quick Start

```bash
cd client && npm install && npm run dev
cd server && pip install -e ".[dev]" && uvicorn src.main:app --reload --port 8000
```

## Project Structure

```
client/src/
  main.ts                # Game bootstrap (called from LoginScreen)
  scene/                 # Terrain, Water, Skybox, Lighting, Buildings, Vegetation, Effects
  entities/              # Player, NPC, RemotePlayer, EntityManager, PlayerController
  systems/               # Interaction, Reaction, Collision, WorldGenerator, Dungeon, ZoneTracker
  ui/                    # InteractionPanel, CombatHUD, Inventory, QuestLog, Minimap, ChatPanel, etc.
  network/               # WebSocketClient, MessageProtocol
  state/                 # PlayerState (singleton), WorldState, NPCState
  utils/                 # MathHelpers, AssetLoader

server/src/
  main.py                # FastAPI app + WebSocket endpoint
  config.py              # Pydantic Settings (LLM provider config)
  agents/                # LangGraph NPC agents
    npc_agent.py         # StateGraph factory (reason → act → respond)
    registry.py          # NPC ID → compiled agent map
    nodes/               # reason.py, act.py, respond.py
    tools/               # combat, dialogue, trade, environment, quest, world_query
    personalities/       # System prompts per NPC archetype
  world/                 # WorldState, PlayerState, NPC definitions, zones
  rag/                   # Lore knowledge base + keyword retriever
  llm/                   # Configurable LLM provider (Claude / OpenAI)
  ws/                    # WebSocket handler, protocol, connection manager

docs/                    # Architecture docs, research, planning (see docs/README.md)
```

## Key Architecture

- **Server-authoritative**: WorldState lives on the server; client is a render mirror
- **Per-NPC agents**: Each NPC runs its own LangGraph StateGraph with independent memory
- **Tool-driven**: LLM calls typed tools (`deal_damage`, `heal_target`, `offer_item`) → structured game actions
- **Prompt as interface**: No buttons — text prompt IS the game interface
- **Procedural world**: Infinite chunk-based terrain (64×64), NPCs/trees spawned on exploration

## Development

```bash
make check                              # All checks (lint + typecheck + tests)
make lint                               # ESLint + Ruff
make typecheck                          # tsc --noEmit + mypy
make test                               # Vitest + pytest
make format                             # Auto-fix lint issues
```

## Conventions

### TypeScript (Client)
- Strict mode, ESLint with `@typescript-eslint`
- No `any` — prefer `unknown` + type guards
- Classes for entities/systems, interfaces for data shapes
- Reuse Three.js vectors/matrices to avoid GC pressure

### Python (Server)
- `from __future__ import annotations` in every file
- Ruff for linting/formatting, mypy for type checking (strict)
- `@dataclass` for data containers, Pydantic `BaseModel` for API schemas
- Tools use factory/closure pattern: `create_X_tools(pending_actions, world_state)` → `@tool` functions

### Testing
- **Client**: Vitest — tests in `client/src/__tests__/`
- **Server**: pytest + pytest-asyncio — tests in `server/tests/`
- Naming: `test_<module>.py` (Python), `<Module>.test.ts` (TypeScript)

### Git
- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Pre-commit hooks: Ruff + ESLint + tsc
- Never commit `.env` files or API keys

## Common Patterns

### Adding a new NPC
1. Add personality in `server/src/agents/personalities/templates.py`
2. Add definition in `server/src/world/npc_definitions.py`
3. Agent auto-registers on server start — client spawns from server data

### Adding a new tool
1. Create tool in `server/src/agents/tools/` using the closure pattern
2. Register in `npc_agent.py` tool binding
3. Handle the action `kind` in `client/src/systems/ReactionSystem.ts`

### WebSocket message flow
```
Client: PlayerInteraction(npcId, prompt) → Server: registry.invoke()
Server: AgentResponse(dialogue, actions[])  → Client: ReactionSystem → 3D effects
```
