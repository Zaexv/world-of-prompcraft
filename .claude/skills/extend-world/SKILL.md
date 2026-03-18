---
name: extend-world
description: Extend the 3D world of Promptcraft with new terrain features, buildings, vegetation, NPCs, effects, or environmental elements. Use when the user wants to add new 3D content, expand the map, create new zones, add structures, or enhance the visual atmosphere.
argument-hint: [what to add, e.g. "a crystal cave zone" or "floating lanterns effect"]
---

# Extend the 3D World of Promptcraft

You are extending **World of Promptcraft**, a Three.js + TypeScript browser RPG with a Teldrassil/Night Elf fantasy theme. The world uses procedural terrain, instanced vegetation, post-processing bloom, and PBR materials.

## Before Making Changes

1. **Read the relevant scene files** to understand existing patterns:
   - `client/src/scene/Terrain.ts` — Procedural terrain with chunk loading and height queries
   - `client/src/scene/Buildings.ts` — Elven structures (Moonwell, TreeHouse, Tower, Pavilion)
   - `client/src/scene/Vegetation.ts` — Instanced trees, mushrooms, ferns
   - `client/src/scene/Water.ts` — Reflective water plane with shaders
   - `client/src/scene/Effects.ts` — Wisps, particles, ground glow, falling leaves
   - `client/src/scene/Skybox.ts` — Stars, moons, nebula
   - `client/src/scene/Lighting.ts` — Moonlight, spotlights, shadows
   - `client/src/scene/SceneManager.ts` — Renderer, post-processing, bloom setup
   - `client/src/main.ts` — Game initialization and main loop

2. **Read the server NPC/zone definitions** if adding NPCs or zones:
   - `server/src/world/npc_definitions.py` — NPC configs (name, personality, position, HP)
   - `server/src/world/zones.py` — Zone definitions with lore
   - `server/src/agents/personalities/templates.py` — NPC personality system prompts

## Architecture Rules

Follow these patterns strictly when extending the world:

### Rendering & Performance
- Use **InstancedMesh** for any object placed more than ~10 times (mushrooms, rocks, grass, etc.)
- Use **MeshStandardMaterial** for PBR consistency; add `emissive` and `emissiveIntensity` for glowing elements
- Snap all objects to terrain height using `Terrain.getHeightAt(x, z)` — never hardcode Y positions
- Avoid placing objects inside building footprints or water areas
- Keep triangle counts reasonable: use simple geometry (boxes, cylinders, cones, spheres) composed together
- Add new objects to the collision system in `client/src/systems/CollisionSystem.ts` if they should block the player

### Visual Style
- **Color palette**: Deep purples (0x2a0845), teals (0x00ffaa), moonlit blues (0x8899ff), bioluminescent greens (0x44ff88)
- **Emissive elements**: Runes, crystals, fungi, magical effects should glow — use emissive materials + Unreal Bloom
- **Atmosphere**: Mystical, ancient, nocturnal forest. Everything feels alive and slightly magical
- All new geometry should cast and receive shadows (`mesh.castShadow = true; mesh.receiveShadow = true`)

### Code Organization
- Create a **new file** in `client/src/scene/` for substantial new features (e.g., `Caves.ts`, `Bridges.ts`)
- Export a creation function that takes `scene: THREE.Scene` and `terrain: Terrain` as parameters
- Register the new module in `SceneManager.ts` and call it during scene setup
- For animated effects, add an `update(delta: number)` export and call it from the main loop in `main.ts`

### Adding NPCs
When adding a new NPC, you must update both client and server:

**Server side:**
1. Add NPC definition in `server/src/world/npc_definitions.py` (id, name, position, HP, faction, color)
2. Add personality system prompt in `server/src/agents/personalities/templates.py`
3. The agent will be auto-created by the registry on server startup

**Client side:**
- NPCs are spawned from server data via WebSocket — no client-side NPC hardcoding needed
- Ensure the NPC position snaps to terrain and doesn't overlap buildings

### Adding Zones
1. Define the zone in `server/src/world/zones.py` with boundaries, description, and lore
2. Add terrain features, buildings, or vegetation in the client that visually represent the zone
3. Consider adding zone-specific lighting or effects

## What the User Wants

The user wants to add: **$ARGUMENTS**

Implement this addition following all the rules above. Show the user what you plan to add before writing code. After implementation, verify the code compiles by checking for TypeScript errors.
