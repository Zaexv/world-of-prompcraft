# Deployment Research Plan (World of Promptcraft)

## Problem statement
The repository has extensive documentation about architecture and local development, but no single, deployment-oriented guide that explains where and how to run the full stack (client + FastAPI WebSocket server + external LLM provider) in a realistic, low-cost/free setup.

## Proposed approach
Research the existing docs and runtime configuration, then produce a deployment recommendation focused on free tiers first, with clear trade-offs and a practical path to go live.

## Current-state findings (from documentation + config review)
- Client: Vite + Three.js frontend (`client/`), currently wired to `ws://${window.location.hostname}:8000/ws` in `client/src/main.ts`.
- Dev proxy exists in `client/vite.config.ts` for `/ws` -> `ws://localhost:8000`.
- Server: FastAPI WebSocket backend (`server/src/main.py`) exposing `/ws` and `/health`.
- Runtime requires external LLM credentials (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`) via `.env`.
- Docker Compose is present, but configured for local dev (`--reload`, bind mounts), not production.
- Docs mention security hardening gaps relevant for public deploy (notably WebSocket origin validation).

## Execution plan
1. Build a deployment requirements matrix from docs and code
   - Identify all must-have runtime needs: ports, WebSocket behavior, env vars, process model, static hosting requirements, and health checks.
   - Capture blockers to “fully free” deployment (LLM API cost and free-tier limitations).

2. Evaluate hosting options with “free-first” priority
   - Compare practical stacks:
     - Frontend static host (Vercel/Netlify/Cloudflare Pages/GitHub Pages)
     - Backend host with WebSocket support (Render/Fly.io/Railway/free alternatives)
   - Score each option for: free tier viability, WebSocket support, sleep/cold-start behavior, setup complexity, and reliability for multiplayer sessions.

3. Define recommended deployment architecture(s)
   - Primary recommendation: best free-ish setup for demo/testing.
   - Secondary fallback: lowest-friction paid/near-free setup if free tier constraints are too limiting.
   - Include domain/protocol decisions (`https` + `wss`) and how client/server URLs are wired.

4. Produce step-by-step deployment runbook
   - Backend deployment steps (build/start command, env vars, health endpoint, runtime checks).
   - Frontend deployment steps (build command, env-based WS URL strategy, publish flow).
   - Post-deploy validation checklist (connectivity, WebSocket handshake, gameplay interaction path).

5. Add risk and hardening notes for public deployment
   - Document immediate security and operational safeguards from existing docs (origin validation, rate limits, timeout behavior, reconnect expectations).
   - Clarify what is acceptable for hobby/demo vs production.

## Deliverables
- A concise deployment recommendation (“where to deploy”).
- A concrete setup guide (“how to deploy”) with commands/config values.
- A trade-off table focused on free-tier realism and known limitations.

## Notes / considerations
- “Ideally free” is feasible for hosting infrastructure in many combinations, but LLM API usage is not truly free at meaningful scale.
- Existing client WS URL is host-derived with fixed port `8000`; deployment guidance may require introducing an environment-driven WS endpoint strategy.
- User preference confirmed: optimize for **free demo/staging with minimal cost**.
