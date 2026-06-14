---
name: performance-review
description: Profile and report performance of World of Promptcraft — client render pipeline (Three.js draw calls, instancing, GC, LOD, chunk streaming, shaders) and server (LangGraph agent latency, WebSocket throughput). Use whenever the user asks why the game is slow, wants a perf/profiling pass, FPS/frame-time analysis, memory/GC review, or a performance audit. Produces a findings report; does not blindly auto-fix.
argument-hint: [optional focus, e.g. "client FPS" or "agent latency"]
---

# Performance Review

Produce a **findings report** (bottleneck → evidence → fix recommendation). Profile
before changing anything; measure, don't guess.

## Client (Three.js render pipeline)
Existing instrumentation to use first:
- `client/src/debug/PerfHUD.ts` — live FPS / frame time / draw calls.
- `client/src/debug/WorldDebugOverlay.ts`, `DebugInfo.ts` — scene state.
- `client/src/debug/shaderTrace.ts`, `client/src/core/ShaderWarmup.ts` — shader compile cost.

Checklist:
- **Draw calls / batching** — are static meshes merged / instanced? (`renderer.info.render.calls`).
  Instancing is the lever for many repeated meshes (trees, props).
- **GC pressure** — per-frame `new THREE.Vector3()`/`Matrix4()` in hot loops. Convention:
  reuse vectors/matrices (CLAUDE.md). Hunt allocations in update loops.
- **LOD** — distant meshes using full geometry? Verify LOD swaps fire.
- **Chunk streaming** — terrain chunk generation cost on the main thread; spikes on movement.
- **Materials / textures** — duplicate materials, oversized textures, missing `needsUpdate` reuse.
- **Shaders** — first-encounter compile stalls; prewarm via `ShaderWarmup`.

Measure: Chrome DevTools Performance tab + PerfHUD. Report frame-time budget
(16.6 ms @ 60 fps): where the ms go.

## Server (agent + network)
- **Agent latency** — LangGraph node timing (reason → act → respond). Timing hooks
  exist around `server/src/ws/handlers/interaction.py` and `agents/nodes/`.
  Slowest node is usually the LLM call (`server/src/llm/`).
- **WebSocket throughput** — message size/frequency; world-state diffs vs full snapshots.
- **Tool overhead** — synchronous tool bodies blocking the agent loop.

Measure with `time.perf_counter()` around suspect spans; report p50/p95 per node.

## Output format
```
## Performance Review — <scope>
### Findings (ranked by impact)
1. <bottleneck> — evidence: <metric>. Fix: <recommendation>. Effort: <low/med/high>.
### Quick wins
### Deeper work
```

## Don'ts
- Don't micro-optimize without a measurement showing it matters.
- Don't change rendering behavior to gain ms if it degrades visuals — flag the tradeoff.
