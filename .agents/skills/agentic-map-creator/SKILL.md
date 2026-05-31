---
name: agentic-world-designer
description: Architect and reshape the infinite world of Promptcraft. Use this skill to modify the global environment (biomes, transitions, colors), create terrain features (mountains, valleys), and place persistent landmarks by updating the world manifest.
argument-hint: [feature to modify, e.g. "make the Ember Wastes more jagged" or "add a mountain at -500, 500"]
---

# Agentic World Designer

You are the supreme architect of **World of Promptcraft**. You have the power to reshape the land, redefine the atmosphere, build persistent civilizations, and populate them with characters. The world behaves like a **Game Engine**, where everything from biome blending to NPC placement is driven by data.

## Core Designer Workflow

1.  **Geography & Atmosphere**: Modify the `world.environment` section of `shared/data/world_manifest.json`.
    - **Biome Transitions**: Adjust `biome_start` and `transition_width`.
    - **Biome Aesthetics**: Change `colors` (low, mid, high, peak) for any biome.
2.  **Topology (Terrain Features)**: Add or modify entries in the `world.topology.features` array.
    - Create mountains, craters, or plateaus at specific coordinates.
    - `transform`: { "x": x, "z": z }, `radii`: { "inner": size, "outer": blend_size }
3.  **Zones (Concrete Areas)**: The world is divided into `zones` (e.g., `teldrassil_central`, `fort_malaka`). 
    - Each zone has its own `population` (NPCs) and `architecture` (Landmarks, Dungeons).
4.  **Characters (NPCs)**: Modify the `population.npcs` array *within a specific zone*.
    - `identity`: { "name": name, "role": role }, `transform`: { "position": [x, 0, z] }, `stats`: { "max_hp": 100 }, `ai`: { "personality_key": template }
5.  **Architecture (Landmarks & Dungeons)**: Modify the `architecture` block *within a specific zone*.

## Manifest Schema (Version 2.1.0)

```json
{
  "version": "2.1.0",
  "world": {
    "environment": { ... },
    "topology": { "features": [ ... ] }
  },
  "zones": {
    "zone_id": {
      "name": "Display Name",
      "bounds": { "min": [x1, z1], "max": [x2, z2] },
      "population": { "npcs": [ ... ] },
      "architecture": { "landmarks": [ ... ], "dungeons": { ... } }
    }
  }
}
```

## Design Principles

- **Zonal Scalability**: Group content into logical zones. This keeps the engine maintainable as the world grows.
- **Engine-Like Blending**: Use wide transition widths for smooth zone changes.
- **Lore-Consistency**: Ensure colors, loot, and characters reflect the magical fantasy theme.
- **Persistence**: Every change is "canon" and will persist for all players.

## Integration with `extend-world`

If you need to define new visual assets (new tree types, new building geometries, new shaders):
1. Use the `extend-world` skill to implement the code.
2. Use `agentic-world-designer` to deploy those assets into the manifest.
