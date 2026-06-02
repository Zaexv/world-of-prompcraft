# World Builder & Terrain Editor

The **World Builder** is a standalone application built into World of Promptcraft that provides a production-grade 3D environment for composing the world map, placing landmarks, creating terrain features, and populating NPCs.

## Access
You can access the editor by navigating directly to `/terrain-editor.html` while the server is running.

## Key Features

1. **Manifest-Driven Pipeline:**
   Every change made in the World Builder is instantly reflected in memory and, when saved, is written to `shared/data/world_manifest.json`. The editor automatically distributes placed items into the correct JSON `zones` based on their spatial coordinates.

2. **1:1 Visual Parity:**
   The editor mounts the exact same `WorldGenerator`, `ProceduralPopulator`, and `ZoneAtmosphere` systems as the main game engine. If a procedural forest or lighting preset looks a certain way in the editor, it will look identical in the game.

3. **Dynamic Terrain Alignment:**
   Buildings and flat patches dynamically alter the terrain underneath them. Moving a building recalculates its terraforming "pad" in real-time, ensuring structures never look "drowned" or float above the ground.

4. **Procedural Masking:**
   In `REMOVE` mode, clicking on a procedurally generated tree or rock will hide it for the session. While it does not permanently banish the object from the math seed yet, it allows you to clear the view to build authored structures unhindered.

## Controls & Navigation

The editor uses a dual-camera system designed for both close-up inspection and rapid world traversal.

| Key / Input | Action |
| :--- | :--- |
| **`V`** | Toggle **Fly Mode** (WASD + Mouse) / **Orbit Mode** |
| **`H`** | Toggle **View Mode** (Hides all UI, gizmos, and bounds logic) |
| **`T`** | Toggle **Properties Panel** |
| **`F`** | **Focus** camera on the cursor's location |
| **`Shift`** | **Turbo Boost** (6x speed) while flying |
| **`Q` / `E`** | Fly Down / Fly Up (in Fly Mode) |
| **Left Click** | Place / Sculpt / Select / Drop |
| **Right Click** | Cancel placement / Deselect |

## Editor Modes

You can switch modes via the UI Panel or keyboard shortcuts:
*   **SELECT:** Idle mode. Hover to see the cursor.
*   **MOVE:** Click and drag authored items (Buildings, NPCs, Paths, Features).
*   **RAISE / LOWER:** True additive sculpting. Each brush deposit adds a smooth, radial height delta on top of the procedural noise; holding the brush in place deepens a hill or valley. These are stored as `world.topology.sculpt` strokes in the manifest and read back by the same `getHeightAt` used for rendering, collision, and player physics — so the deformation looks identical in-game.
*   **PLACE OBJ / NPC:** Spawns an authored item. A translucent ghost preview follows the cursor.
*   **PLACE PATH:** Click once to set the start point (marked by a dirt peg), click again to set the end point.
*   **REMOVE:** Click to delete authored items from the manifest, or click procedural items to hide them.

## Best Practices

*   **Saving Often:** The world is vast. Save your manifest (`SAVE MANIFEST` button) frequently to commit your layout to the shared JSON.
*   **Water Layers:** The editor allows you to click *through* water to pick objects or sculpt the lakebed below.
*   **Path Widths:** You can adjust the width of paths in the *Object Properties* tab after selecting them. Paths automatically hug the terrain using a specialized depth offset to prevent z-fighting.
*   **Zone Lighting:** The editor tracks your camera position. As you fly across the map, the lighting and fog will automatically interpolate between Zone presets, exactly as it does for players.
