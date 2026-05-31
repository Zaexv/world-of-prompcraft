---
name: mesh-quality-reviewer
description: Evaluate the technical and visual quality of 3D meshes (PBR materials, LODs, tiling, colliders). Use this when reviewing new mesh implementations or auditing existing ones.
argument-hint: [path to a mesh file, e.g. "client/src/meshes/buildings/malaka/MalakaHouse.ts"]
---

# Mesh Quality Reviewer Skill

This skill provides a rigorous framework for evaluating the technical and visual quality of 3D meshes within the **World of Promptcraft** engine. Use this when reviewing new mesh implementations or auditing existing ones.

## Quality Standards Checklist

### 1. Rendering & Visual Integrity
- [ ] **No Z-Fighting:** Overlapping geometries (e.g., walls meeting floors) must be "buried" (intersected) rather than coplanar. Use small nudges or "sinks" (e.g., `0.3 * scale`) to ensure distinct depth. **Check internal intersections: composite/radial parts (arches, crosses, moldings) must use "Alternating Nudges" (e.g., `0.002 * scale` on every other segment) to avoid coplanar faces. Foundations/plinters must be slightly LARGER (expanded by ~0.1 * scale) than the walls they support to create a distinct step and prevent base flickering.**
  - **Stacked flat planes:** Two large coplanar/near-coplanar planes (patio border + floor, terraces, plazas) z-fight at distance/grazing angles even with a tiny gap. Separate them by `> 0.01 * scale` in Y (or bury one in solid geometry).
  - **Backing/glow planes:** An emissive "glow"/backlight plane behind a transparent glass pane must sit BEHIND the glass *back face* (clear its half-depth, e.g. glass spans `±0.05` → glow at `-0.08 * scale`), never on the same plane as it.
  - **Stacked same-material trim (cornice+cap, zócalo+cap):** Two same-material stone boxes stacked to fake a moulding flicker as a band between floors / at the base — the cap's bottom is coplanar with the band's top AND its slightly-larger footprint leaves near-coplanar *parallel vertical* faces a hair apart. Half-burying the cap is **not** enough (the parallel faces remain). **Prefer a single proud band box**; if a real cap is needed, make it clearly proud (`> 0.05 * scale` offset) or clearly inset, never ~coincident.
  - **Embedded members on a shared plane:** A beam / string-course / band embedded in a wall must not place a face exactly on the wall's own face plane — e.g. a "ceiling beam" whose top sits at the floor line `y = groundH` is coplanar with the wall top across the full width and flickers. Sink the member a few cm clear of the shared plane.
- [ ] **No Clipping / Oversized Features:** A centred or recessed feature (balcony slab, terrace, awning, sign) sized to the *full façade width* pokes out past walls that are narrower or set back. Size such features to the **actual opening/recess** they belong to (e.g. the gap between flanking wings), not the building's outer width.
- [ ] **No Texture Stretching:** Large or non-uniform primitives MUST use `applyWorldTiling(group, material)` to drive UVs from world units. **Custom BufferGeometry MUST explicitly define a `uv` attribute based on world units (e.g., 1 unit = 1 meter) rather than a 0-1 range, or textures will stretch.**
- [ ] **Normal Maps & PBR:** All architectural materials (stone, stucco, roof, wood) must utilize the shared `PBRMaps.ts` utility. **Custom BufferGeometry MUST call `geo.computeVertexNormals()` and use `DoubleSide` for thin surfaces to ensure correct lighting and visibility.**
- [ ] **Geometric Continuity:** Rounded, diagonal, or complex shapes must have their UVs corrected (usually via `applyWorldTiling`) to ensure patterns align across seams.
- [ ] **All-Sides Coverage:** Perimeter decoration (crenellations, quoins, cornices, machicolations) must wrap every exposed face, not just the front — a loop hard-coded to one edge (`z = width/2`) leaves three bare sides. Buildings are seen from all angles.
- [ ] **No Floating Geometry:** All structures must sit on a solid base or "plinth" that extends slightly into the ground to account for terrain slope.
  - **Attached fixtures need a wall behind them:** For every window/door/shutter/grille/balcony placed at an `(x, z)`, verify a flush wall actually exists there. Common float traps: **recessed upper floors / balconies / galleries** (the upper wall is set back, so a window at the lower-floor `x`/`z` hangs in air), setbacks, and **wings shorter than the façade** (a side-window loop spanning the full footprint overshoots a wing that only spans the courtyard). Drive opening positions from the *actual* wall extent, and skip openings over recesses.
  - **Sink without a gap:** When a base's TOP must stay at a fixed height (a body sits on it), sink it into the terrain by extending the geometry *downward* — raise its height and lower its centre so the top is unchanged and only the skirt drops below grade. Lowering the whole box instead makes whatever sits on it float.
- [ ] **Scale-Aware Offsets:** Every literal margin / step / nudge / overhang must be multiplied by `scale` — `width + 0.1 * scale`, never `width + 0.1`. A bare constant collapses to nothing at large scale and dominates at small scale (this was a recurring foundation-step bug). Audit every `+ 0.x` / `- 0.x` that is not already `* scale`.

### 2. Performance & Optimization (LOD)
- [ ] **Distance LOD:** Every building MUST be wrapped in `withLOD(group)` at the end of the `build()` method.
- [ ] **Flat Color Fallback:** Materials must define `userData.flatColor` to allow the LOD system to swap high-cost textures for matching solid colors at a distance.
- [ ] **Geometry Simplification:** Far LOD levels must automatically strip "fine detail" (smaller than ~1.8m) like windows, grilles, or small props to save draw calls.

### 3. Physics & Collisions
- [ ] **Explicit Proxies:** Do NOT rely on render meshes for collisions. Use `boxCollider` or `cylinderCollider` from `colliderProxy.ts` to create a simplified convex footprint.
- [ ] **Solid Footprint:** Ensure the foundation and main walls have robust proxies. A single body proxy should span from the ground up (covering the plinth/zócalo band), not start above the foundation and leave the base uncollided.
- [ ] **Solid Verticality:** Roofing and staircases must have solid proxies to prevent players from falling through or being unable to climb. Size a roof's box collider to its **footprint + eaves**, not the cone's diagonal bounding radius (`roofRadius * 1.4`) — an oversized box makes players bump invisible air past the walls.
- [ ] **Collider Tagging:** Render-only meshes that should be ignored by the physics engine must be tagged with `mesh.userData.noCollision = true`.

### 4. Code Architecture & Style
- [ ] **Registry Pattern:** The mesh class must call `registerMesh(MyMeshClass)` at the end of the file.
- [ ] **Static Metadata:** `type` and `category` must be defined as static properties.
- [ ] **Pure Geometry:** The `build()` method must be "pure" — it creates and returns an object but does not perform scene insertion or side effects.
- [ ] **Texture Lookup Fallbacks:** Use established kits (like `MalakaKit`) to ensure shared materials are cached and fallback logic (like lookup for missing textures) is centralized.

## Usage Procedure

1. **Research:** Read the mesh file (e.g., `client/src/meshes/buildings/malaka/MyBuilding.ts`).
2. **Analysis:** Compare the implementation against each category in the checklist above.
3. **Audit Report:** Provide a structured report highlighting:
   - **Strengths:** Which standards are well-implemented.
   - **Deficiencies:** Specific line numbers or logic where standards are missed (e.g., "Missing `withLOD` wrapper").
   - **Actionable Fixes:** Concrete code snippets to bring the mesh up to standard.
