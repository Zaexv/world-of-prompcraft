---
name: create-architecture
description: Research the World of Promptcraft codebase and regenerate (or update) client/ARCHITECTURE.md and server/ARCHITECTURE.md with accurate Mermaid diagrams.
argument-hint: [client | server | both (default: both)]
---

# Create / Update Architecture Docs

Regenerate architecture documentation for one or both sides of the World of Promptcraft stack.

**Output files:**
- `client/ARCHITECTURE.md` — Three.js + TypeScript frontend
- `server/ARCHITECTURE.md` — FastAPI + LangGraph backend

If `$ARGUMENTS` is `client`, only update `client/ARCHITECTURE.md`.
If `$ARGUMENTS` is `server`, only update `server/ARCHITECTURE.md`.
Otherwise update both.

---

## Client research checklist (skip if `$ARGUMENTS == server`)

Read these files (parallel reads where possible):

1. `client/src/main.ts` — bootstrap flow, system instantiation order
2. `client/src/scene/SceneManager.ts` — renderer, camera, EffectComposer, subscene construction
3. `client/src/entities/EntityManager.ts` — NPC/RemotePlayer lifecycle
4. `client/src/entities/Player.ts` + `client/src/entities/PlayerController.ts` — local player, camera, controls
5. `client/src/entities/NPC.ts` + `client/src/entities/RemotePlayer.ts` — entity details
6. `client/src/systems/CollisionSystem.ts` — swept AABB, static/dynamic, tag-based filtering
7. `client/src/systems/WorldGenerator.ts` — chunk size, biome pools, spawn logic
8. `client/src/systems/InteractionSystem.ts` — raycaster, click/hover, pointer lock
9. `client/src/systems/ReactionSystem.ts` — action kinds + 3D effects
10. `client/src/network/WebSocketClient.ts` — reconnect, heartbeat, message types
11. `client/src/network/MessageProtocol.ts` — discriminated union message types
12. `client/src/state/PlayerState.ts` — singleton fields
13. `client/src/ui/` — list directory, read key UI components (InteractionPanel, CombatHUD, etc.)

For each section below, check if the current `client/ARCHITECTURE.md` is still accurate. If the code diverges from the doc, update the doc.

---

## Server research checklist (skip if `$ARGUMENTS == client`)

Read these files (parallel reads where possible):

1. `server/src/main.py` — lifespan, routes, startup order
2. `server/src/ws/handler.py` — message routing, attack scoring
3. `server/src/ws/connection_manager.py` — broadcast_nearby, player tracking
4. `server/src/ws/protocol.py` — Pydantic message models
5. `server/src/agents/npc_agent.py` — StateGraph factory, node wiring, edge routing
6. `server/src/agents/registry.py` — agent compilation, invoke, dynamic NPC registration
7. `server/src/agents/agent_state.py` — NPCAgentState TypedDict fields
8. `server/src/agents/nodes/reason.py` — system prompt construction, tool binding
9. `server/src/agents/nodes/act.py` — tool execution loop
10. `server/src/agents/nodes/respond.py` — dialogue extraction
11. `server/src/agents/nodes/reflect.py` — mood/relationship heuristics
12. `server/src/agents/nodes/summarize.py` — conditional memory compression
13. `server/src/agents/tools/__init__.py` — get_all_tools
14. `server/src/agents/tools/` — list directory + read each tool file
15. `server/src/world/world_state.py` — WorldState operations, apply_actions
16. `server/src/world/player_state.py` — PlayerData fields
17. `server/src/world/npc_definitions.py` — NPC_DEFINITIONS
18. `server/src/rag/retriever.py` + `server/src/rag/knowledge_base.py` — RAG scoring
19. `server/src/llm/` — provider config

For each section, check if the current `server/ARCHITECTURE.md` is still accurate. Update any diverging sections.

---

## Writing rules

- Use `flowchart TD` for layered diagrams (top-level overview, data flows)
- Use `flowchart LR` for pipeline flows (tool closure, RAG pipeline)
- Use `sequenceDiagram` for end-to-end request flows across multiple components
- Use subgraphs to group related nodes in Mermaid
- Add colour to key nodes: `style node fill:#4a90d9,color:#fff,stroke:#2c6fad`
- Keep section headers consistent with the existing files
- Follow Python conventions from CLAUDE.md: `dict[str, Any]`, `list[Any]`
- Do NOT add speculative sections about features that don't exist in code

## After writing

Confirm that:
- All Mermaid diagrams are syntactically valid (no mismatched brackets or arrows)
- Section structure matches the current files (Layer Overview, Bootstrap Flow, key subsystems, Extension Guides)
- Commit message: `docs(architecture): update client/server architecture docs`
