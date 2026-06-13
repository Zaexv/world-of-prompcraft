---
name: install-game
description: Install dependencies and run World of Promptcraft locally — backend (FastAPI + LangGraph) and frontend (Three.js + Vite). Use whenever the user wants to install, set up, run, start, launch, or boot the game / dev servers locally, or asks "how do I run this".
argument-hint: [optional, e.g. "backend only" or "fresh install"]
---

# Install Game

Boot **World of Promptcraft** locally. Two services run in parallel: a Python
backend (port 8000, WebSocket) and a Vite frontend (port 5173).

## Prerequisites
- Python 3.11+ (`python --version`)
- Node + Corepack (`corepack --version`) for pnpm
- A terminal per service (or run them in the background)

## 1. Backend — http://localhost:8000

```bash
cd server
pip install -e ".[dev]"
python -m uvicorn src.main:app --reload --port 8000
```

Note: invoke uvicorn via `python -m uvicorn` — the `uvicorn` binary may not be on
`$PATH`. The server is authoritative; WorldState lives here.

## 2. Frontend — http://localhost:5173

```bash
cd client
corepack enable
pnpm install
pnpm run dev
```

## 3. Play
Open **http://localhost:5173**. The client connects to the backend WebSocket on
port 8000. If NPCs never respond, confirm the backend is up and an LLM provider is
configured (`server/src/config.py` / `.env`).

## Verify install
```bash
# backend health
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/
# frontend
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/
```

## Free busy ports (if "address already in use")
```bash
lsof -ti:8000 | xargs kill   # backend
lsof -ti:5173 | xargs kill   # frontend
```

## Full check before running
```bash
make check    # lint + typecheck + tests (client + server)
```
