# World of Promptcraft — Presentation (LLMdays)

Interactive slide deck that lives **inside the client front-end** and reuses the
real game engine as its live 3D backdrop. CLI / hacker aesthetic (dark slate,
neon cyan + terminal green, JetBrains Mono) layered as glassmorphism panels over
the actual `SceneManager` (procedural terrain, biomes, water, skybox, bloom).

> The deck is a **Vite entry in `client/`** (not standalone HTML) so it imports
> live project modules and is covered by `tsc` + ESLint in the pre-commit hooks.

## Run

```bash
cd client && pnpm install && pnpm run dev
# open http://localhost:5173/src/presentation/
```

Fullscreen with `F` for the talk.

## Files

All presentation files live under one layer — `client/src/presentation/`.

| File | Role |
|------|------|
| `client/src/presentation/index.html` | Vite entry — slide markup + Mermaid blocks + Mermaid CDN global |
| `client/src/presentation/main.ts` | Boots the backdrop, then the deck + diagrams |
| `client/src/presentation/backdrop.ts` | **Reuses** `SceneManager` + `WorldGenerator` + `EntityManager`; full procedural world shown as-is, eye-level camera walk |
| `client/src/presentation/deck.ts` | Navigation (keys / scroll / click) + Mermaid render + diagram pan/zoom; notifies `onSlide` |
| `client/src/presentation/styles.css` | CLI/glassmorphism theme (imported by `main.ts`) |

## Controls

| Input | Action |
|-------|--------|
| `←` `→` / `↑` `↓` / `Space` / `PageUp`·`PageDown` | Prev / next slide |
| Scroll / trackpad | Prev / next (debounced) |
| Click left / right edge | Prev / next |
| `Home` / `End` | First / last |
| `F` | Toggle fullscreen |
| `?` / `h` | Toggle the controls help overlay (`Esc` closes) |
| `#n` in URL | Deep-link to slide n (e.g. `/src/presentation/#5`) |

The footer shows the current section name (from each slide's kicker/pillar tag)
between the brand and the slide counter.

## Code reuse (the point)

- **Backdrop = the real game world.** `backdrop.ts` boots `SceneManager`
  (terrain, biomes, water, skybox, bloom) *and* the full `WorldGenerator`
  streaming pipeline wired exactly like `GameBootstrapper`:
  `terrain.setManifest(...)`, `terrain.onChunkLoaded/Unloaded → worldGenerator`,
  then `terrain.init()`. That last call is what makes procedural population
  happen — without it the world is empty. Procedural buildings, vegetation,
  props and biome NPCs spawn per chunk. No bespoke geometry is injected.
- **Nothing presentation-specific is added.** The world is shown exactly as it
  is — every mesh on screen is genuine procedural output. No hand-placed NPCs.
- **Per-slide camera focus, at eye level.** Each slide eases the camera (very
  slowly — it must not distract the speaker) to a viewpoint and re-centres world
  streaming there. Viewpoints are a person-height walk through the world
  (~2.5 m eye height, small orbit, horizontal gaze), not aerial. See
  `Backdrop.SPECS`.
- **Mermaid diagrams** sit on the right of the architecture slides, in the game
  palette, and are pan/zoom interactive (drag · scroll · double-click to fit).
  Loaded at runtime as ESM (the v11 IIFE build exposes no global). Mermaid lays
  out using container width, so the render pass temporarily forces every slide
  to lay out; SVGs are then sized from their `viewBox` for deterministic fit.
  Diagrams adapted from `ARCHITECTURE.md` (agent pipeline = server's, top-down).
- **Formal in-game style:** gold-on-dark with Cinzel headings (matching the
  in-game UI palette), transparent glass panels kept throughout.

## Slides (15, English)

1. **Title** — World of Promptcraft · speaker (Eduardo Pertierra Puche) · llmday.com
2. **Who am I?** — Senior AI Engineer, MSc Software Engineering, 3D side projects (+ portrait)
3. **What is it?** — procedural agentic RPG, entirely AI-generated (+ live mesh showcase; backdrop roams the world)
4. **How the idea started** — state of the art + Stanford generative-agents paper
5. **Architecture overview** — thin client / authoritative server (+ system diagram)
6. **Pillar 1 — Generative 3D CLI** with Three.js (+ prompt→render diagram)
7. **3D deep dive — Rendering** — TAA→Bloom, ACES, IBL, adaptive PR, LOD/BVH (+ pipeline diagram)
8. **3D deep dive — Terrain** — 64-chunk streaming, biome math, pads, mesh catalog, BVH collision (+ chunk diagram)
9. **Pillar 2 — Agentic backend** — one StateGraph per NPC (+ reason→…→summarize graph)
10. **Agent deep dive — Pipeline** — node-by-node responsibilities, 1–2 LLM calls
11. **Agent deep dive — Memory** — MemorySaver thread per NPC×player, relationship scale, response cache
12. **Tool system** — closure factories, 8 categories, single authoritative `apply_actions` (+ tool diagram)
13. **Concurrency & authority** — server-authoritative, asyncio task/msg, Semaphore(10), combat fast-path, keyword RAG
14. **Pillar 3 — Agentic coding** (+ research→implement→pre-commit diagram)
15. **Takeaways & features** — lessons learnt · Terrain Builder · Mesh Viewer · World Builder

Technical content is mined from `client/ARCHITECTURE.md` and
`server/ARCHITECTURE.md`; diagrams are adapted from the same.

**Tone:** copy and diagram labels are deliberately plain-language — they explain
*how things are built* without jargon (e.g. "the land is made of square tiles
that appear as you walk" instead of "64-unit chunk streaming"). The deep-dive
slides are titled "A Closer Look — …".

## State / TODO

- ✅ Built as `.ts` Vite entry; reuses full procedural game world
  (`SceneManager` + `WorldGenerator`, wired like `GameBootstrapper`); world shown
  as-is with no hand-placed NPCs; slow eye-level per-slide camera walk; pan/zoom
  Mermaid (gold theme); formal in-game style with glass transparency;
  high-quality English copy.
- ✅ Passes `tsc --noEmit` + ESLint.
- ◻️ Optional: register `src/presentation/index.html` in `vite.config.ts`
  `rollupOptions.input` for a production `pnpm build` (currently dev-served, like
  the other tool HTMLs).
- ◻️ Optional: add per-slide camera framings (e.g. dive toward a biome on the 3D-zoom slide).
- ◻️ Optional: swap Mermaid CDN for a bundled dep if offline rendering is needed.
