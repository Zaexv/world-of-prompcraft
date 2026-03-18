# World of Promptcraft

A 3D WoW-inspired browser game where the core mechanic is **prompting**: type free-form text and LangGraph-powered NPC agents react dynamically. No attack buttons, no trade menus — your prompt IS the game interface.

## Stack

| Layer | Tech |
|-------|------|
| Client | Three.js + TypeScript + Vite |
| Server | FastAPI + LangGraph + Python 3.11+ |
| Communication | WebSocket (port 8000) |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- An LLM API key (Claude or OpenAI)

### Client

```bash
cd client
npm install
npm run dev
```

### Server

```bash
cd server
cp .env.example .env   # add your LLM API keys
pip install -e ".[dev]"
uvicorn src.main:app --reload --port 8000
```

## How It Works

- **Server-authoritative state** — `WorldState` lives on the server; the client is a render mirror.
- **Per-NPC agents** — Each NPC gets its own LangGraph `StateGraph` with independent memory.
- **Tool-driven mechanics** — The LLM calls typed tools (`deal_damage`, `heal_target`, `offer_item`, etc.) that produce structured actions.
- **Generative world** — Infinite chunk-based terrain (64x64 chunks), with NPCs and vegetation spawned procedurally as you explore.

## Project Structure

```
client/src/
  main.ts              # Game bootstrap
  scene/               # Three.js scene (Terrain, Water, Skybox, Vegetation, Effects, …)
  entities/            # Player, NPC, EntityManager, PlayerController
  systems/             # InteractionSystem, ReactionSystem, CollisionSystem, WorldGenerator
  ui/                  # InteractionPanel, StatusBars, InventoryPanel, CombatHUD, …
  network/             # WebSocketClient, MessageProtocol
  state/               # PlayerState, WorldState, NPCState

server/src/
  main.py              # FastAPI app + WebSocket endpoint
  agents/              # LangGraph NPC agents
    npc_agent.py       # StateGraph factory (reason → act → respond)
    registry.py        # NPC ID → compiled agent map
    nodes/             # reason.py, act.py, respond.py
    tools/             # combat.py, dialogue.py, trade.py, environment.py, world_query.py
    personalities/     # System prompts per NPC archetype
  world/               # WorldState, player state, NPC definitions, zones
  rag/                 # WoW lore knowledge base + keyword retriever
  llm/                 # Configurable LLM provider (Claude / OpenAI)
  ws/                  # WebSocket handler, protocol, connection manager
```

## Development

```bash
# Lint
cd client && npm run lint
cd server && ruff check src tests

# Test
cd client && npm test
cd server && pytest

# Type check
cd client && npx tsc --noEmit
cd server && mypy src

# Run all checks
make check
```

## License

MIT
