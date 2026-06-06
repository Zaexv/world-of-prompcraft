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
# open http://localhost:5173/presentation.html
```

Fullscreen with `F` for the talk.

## Files

| File | Role |
|------|------|
| `client/presentation.html` | Vite entry — slide markup (exact Spanish copy) + Mermaid blocks + Mermaid CDN global |
| `client/src/presentation/main.ts` | Boots the backdrop, then the deck + diagrams |
| `client/src/presentation/backdrop.ts` | **Reuses** `SceneManager` + `WorldGenerator` + `EntityManager` + `buildMesh`; full procedural world, per-slide camera focus |
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
| `#n` in URL | Deep-link to slide n (e.g. `presentation.html#5`) |

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
- **Only two meshes are hand-placed:** the named NPCs **Nireg Jenkins** and
  **El Tito** (`buildMesh`, same catalog as Mesh Viewer / World Builder), as
  points of interest. Everything else on screen is genuine procedural output.
- **Per-slide camera focus.** Each slide eases the camera (very slowly — it must
  not distract the speaker) to a viewpoint and re-centres world streaming there.
  Viewpoints are wide vistas over the world + the two NPCs. See `Backdrop.SPECS`.
- **Mermaid diagrams** sit on the right of the architecture slides, in the game
  palette, and are pan/zoom interactive (drag · scroll · double-click to fit).
  Loaded at runtime as ESM (the v11 IIFE build exposes no global). Mermaid lays
  out using container width, so the render pass temporarily forces every slide
  to lay out; SVGs are then sized from their `viewBox` for deterministic fit.
  Diagrams adapted from `ARCHITECTURE.md` (agent pipeline = server's, top-down).
- **Formal in-game style:** gold-on-dark with Cinzel headings (matching the
  in-game UI palette), transparent glass panels kept throughout.

## Slides (14, English)

1. **Title** — World of Promptcraft · LLMdays
2. **What is it?** — procedural agentic RPG, entirely AI-generated
3. **How the idea started** — state of the art + Stanford generative-agents paper
4. **Architecture overview** — thin client / authoritative server (+ system diagram)
5. **Pillar 1 — Generative 3D CLI** with Three.js (+ prompt→render diagram)
6. **3D deep dive — Rendering** — TAA→Bloom, ACES, IBL, adaptive PR, LOD/BVH (+ pipeline diagram)
7. **3D deep dive — Terrain** — 64-chunk streaming, biome math, pads, mesh catalog, BVH collision (+ chunk diagram)
8. **Pillar 2 — Agentic backend** — one StateGraph per NPC (+ reason→…→summarize graph)
9. **Agent deep dive — Pipeline** — node-by-node responsibilities, 1–2 LLM calls
10. **Agent deep dive — Memory** — MemorySaver thread per NPC×player, relationship scale, response cache
11. **Tool system** — closure factories, 8 categories, single authoritative `apply_actions` (+ tool diagram)
12. **Concurrency & authority** — server-authoritative, asyncio task/msg, Semaphore(10), combat fast-path, keyword RAG
13. **Pillar 3 — Agentic coding** (+ research→implement→pre-commit diagram)
14. **Takeaways & features** — lessons learnt · Terrain Builder · Mesh Viewer · World Builder

Technical content is mined from `client/ARCHITECTURE.md` and
`server/ARCHITECTURE.md`; diagrams are adapted from the same.

**Tone:** copy and diagram labels are deliberately plain-language — they explain
*how things are built* without jargon (e.g. "the land is made of square tiles
that appear as you walk" instead of "64-unit chunk streaming"). The deep-dive
slides are titled "A Closer Look — …".

## State / TODO

- ✅ Built as `.ts` Vite entry; reuses full procedural game world
  (`SceneManager` + `WorldGenerator`, wired like `GameBootstrapper`); only
  hand-placed meshes are the NPCs Nireg Jenkins + El Tito; slow per-slide camera
  focus; pan/zoom Mermaid (gold theme); formal in-game style with glass
  transparency; high-quality English copy.
- ✅ Verified headless (Playwright/WebGL): all 14 slides reachable, none overflow;
  6 architecture diagrams render visibly and fill the panel; zoom +
  double-click-fit work; deep-link-on-load + `hashchange` work; rapid-nav clamps;
  **0 console errors**. Camera viewpoints in `Backdrop.SPECS` map 1:1 to slides
  (NPCs land on the agent-backend / agent-graph slides).
- ✅ Passes `tsc --noEmit` + ESLint.
- ◻️ Optional: register `presentation.html` in `vite.config.ts` `rollupOptions.input`
  for a production `pnpm build` (currently dev-served, like the other tool HTMLs).
- ◻️ Optional: add per-slide camera framings (e.g. dive toward a biome on the 3D-zoom slide).
- ◻️ Optional: swap Mermaid CDN for a bundled dep if offline rendering is needed.
