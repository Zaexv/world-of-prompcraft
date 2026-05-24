# Front-End Improvements TODO (Prioritized)

## P0 — Critical Gameplay/UX

1. Fix **collision detection** so the player cannot clip through terrain, structures, or cave geometry.
2. Fix **world placement/alignment** issues causing meshes or collision volumes to appear in incorrect coordinates.
3. Fix **general world positioning of items** so pickups/objects spawn and remain grounded and reachable.

## P1 — High Visual Consistency

1. Improve and standardize **NPC skins/models** so character visuals are consistent, readable, and correctly assigned per NPC type.
2. Improve **ground skin/material blending** to remove obvious seams/repetition and better match biome context.

## P2 — Stabilization & Polish

1. Add/update frontend tests around collision, positioning, and NPC model assignment to prevent regressions.
2. Do a full world pass to validate placement offsets across zones (town, caves, boats, terrain chunks).
