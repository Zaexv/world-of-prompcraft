# 📚 Documentation Index

## Running Locally

| Service | Command | URL |
|---------|---------|-----|
| **Backend** | `cd server && python -m uvicorn src.main:app --reload --port 8000` | http://localhost:8000 |
| **Frontend** | `cd client && npm run dev` | http://localhost:5173 |

Use `make check` from the repo root to run lint + typecheck + tests for both sides before committing.

## Architecture & Design

| Document | Description |
|----------|-------------|
| [Architecture Blueprint](./architecture/blueprint.md) | Complete engine-agnostic technical spec — every system, algorithm, data structure, and protocol |
| [Backend Deep-Dive](./architecture/backend-deep-dive.md) | Server architecture deep-dive: WebSocket layer, agent system, world state |
| [Client Architecture](./architecture/client.md) | **Frontend deep-dive** — render loop, entity system, collision, procedural world, WebSocket layer, UI layer, state management, ReactionSystem |
| [Server Architecture](./architecture/server.md) | **Backend deep-dive** — FastAPI lifespan, WebSocket layer, LangGraph StateGraph, tool system, NPC isolation, RAG lore, WorldState, LLM provider |

## Tools & Utilities

| Document | Description |
|----------|-------------|
| [World Builder & Editor](./tools/world-editor.md) | **Terrain & Map Editor guide** — using the visual editor to place landmarks and modify terrain |

## Guidelines

| Document | Description |
|----------|-------------|
| [AI Docs Guidelines](./standards/writing-guidelines.md) | **AI-Efficient Documentation Standard** — Rules for writing documentation that AI agents can parse efficiently |

## Agentic System

| Document | Description |
|----------|-------------|
| [Agentic Workflow](./agentic/workflow.md) | **LangGraph pipeline reference** — all 5 nodes, agent state schema, full tool system (all 14 tools with args + lifecycle), end-to-end tool call sequence diagram, concrete attack example trace, checkpointed memory / relationship model, cost strategy, and extension guides |

## Protocol Contract

| Document | Description |
|----------|-------------|
| [Protocol](./protocol/spec.md) | **WebSocket protocol spec** — authoritative contract between TypeScript client and Python server. Every message type, field, and action kind is defined here. Consult this before changing either `MessageProtocol.ts` or `ws/protocol.py` |

## Archive (Implemented Plans & Reports)

Archived plans, research reports, and release summaries:

- [Archived Plans & Research](./plans/) — Past implementation plans and research (marked with `DONE_`)
- [Release Summaries](./release/) — Summaries of PRs and releases
