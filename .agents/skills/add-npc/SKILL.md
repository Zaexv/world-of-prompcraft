---
name: add-npc
description: Add (or remove) persistent NPC characters in World of Promptcraft. Use this skill to manage the global NPC registry — personality, definition, placement — by updating the world manifest. Affects both server-side AI logic and client-side rendering.
argument-hint: [action and NPC details, e.g. "add a guard named Bob at 50, 50"]
---

# NPC Registry Manager

This skill is for managing the population of **World of Promptcraft** during development.

## Operations

### 1. Adding an NPC
To add a new character to the world:
1.  Open `shared/data/world_manifest.json`.
2.  Choose a target **Zone** (e.g., `teldrassil_central`).
3.  Add a new object to the `population.npcs` array *within that zone*:
    ```json
    {
      "id": "unique_id",
      "identity": { "name": "Character Name", "role": "merchant" },
      "transform": { "position": [x, 0, z], "rotation": [0, 0, 0] },
      "stats": { "max_hp": 100, "level": 5 },
      "ai": { "personality_key": "template_id", "wander_radius": 5 }
    }
    ```
4.  **Personality Templates**: Choose from existing keys in `server/src/agents/personalities/templates.py`.

### 2. Removing an NPC
To remove a character:
1.  Open `shared/data/world_manifest.json`.
2.  Find the zone containing the NPC and delete the entry from its `population.npcs` array.

### 3. Modifying an NPC
Update fields within the relevant zone's `population.npcs` array.

## Manifest Sync
The **World of Promptcraft** engine uses the physical file at `shared/data/world_manifest.json` as the single source of truth:
- **Server**: Loads `npc_definitions.py` which reads the shared file on disk.
- **Client**: Imports the shared file directly via Vite/TypeScript. Any changes to the manifest trigger a hot-reload or require a page refresh to update the 3D world.

## Tips
- **Ground Snapping**: You can usually set the Y coordinate to `0`. The client-side `snapToGround` system will automatically move the NPC to the terrain surface.
- **Lore Check**: Ensure new NPCs have names and roles consistent with the magical, nocturnal Teldrassil theme.
