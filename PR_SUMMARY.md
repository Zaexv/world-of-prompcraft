# Pull Request: Fort Malaka High-Fidelity Architectural Overhaul & Ancient Sand Environment

## 🚀 Overview
This PR delivers a comprehensive visual and structural transformation of **Fort Malaka**, evolving it from a placeholder residential area into a high-fidelity, historically-inspired Mediterranean city. The overhaul focuses on architectural realism, authentic Andalusian aesthetics, and advanced procedural terrain integration.

## 🏗️ Major Changes

### 1. High-Fidelity Andalusian Architectural Set
Implemented a full suite of traditional Spanish building models based on historical references:
- **Cathedral of Malaka ("La Manquita"):** A grand Renaissance landmark featuring a massive dome, flying buttresses, and its iconic single completed tower.
- **Moorish Alcazaba (Castle):** Upgraded the fortress to a multi-tiered defensive structure with terraced levels, horseshoe arches, and inner courtyard gardens.
- **Ermita de Pueblo (Village Hermitage):** Added a traditional chapel with a tall "Espadaña" bell-gable, a realistic lathe-curved brass bell, and a recessed oculus window.
- **Casa de Patio Andaluz (Palacio):** A "Hero" residential model featuring a central open-air courtyard with a **functional fountain** and interior arched porticos.
- **Cortijo & Bodega:** Added rural and industrial building types including L-shaped oil mills and long winery naves with high ventilation windows.

### 2. "Ancient Sand" Environmental Overhaul
- **Procedural Sand Shader:** Replaced the generic ground with a realistic multi-layered sand floor featuring wind-swept ripples, mineral glints, and sun-bleached ochre tones.
- **Grounded Realism:** Raised the entire city platform to **4.0 meters** and implemented a deep-foundation system for all buildings. This ensures all structures are firmly grounded into the terrain, eliminating the "flying building" effect on hills.
- **Dune Undulations:** Added subtle, natural height variations to the city floor to simulate wind-blown coastal sand.

### 3. High-Fidelity Material Palette
- **Standardized Colors:** Synchronized all city assets to use pure **Andalusian White (#FFFFFF)** stucco, deep saturated **Terracotta Red (#A63D2D)** roofs, and sharp **Black Iron/Dark Wood (#1A1A1A)** detailing.
- **3D Detailing:** Added actual 3D curved clay tiles (tejas) to all roof eaves, brass door hardware, and ornate iron "rejería" grilles to all windows.

### 4. Urban Reorganization & Performance
- **City Audit:** Completely redesigned the layout in `world_manifest.json` to resolve all building overlaps and create a proper, walkable urban plan with distinct districts.
- **Physics Optimization:** Globally marked all high-density decorative meshes (roof tiles, grilles, flower pots) as **non-collidable** (`userData.noCollision = true`). This prevents the physics engine from hanging and ensures instant loading times.

## 🧪 Verification & Quality
- **Loading Performance:** Verified that the city loads instantly without "preparing collisions" hangs.
- **Visual Integrity:** Confirmed that all buildings sit flush on the raised sand plateau.
- **Type Safety:** Ran `npm run typecheck` to ensure 0 TypeScript regressions across the client.

## 🔗 Final Action Required
The branch `feat/malaka-architectural-overhaul` has been pushed to GitHub. Click the link below to finalize the submission:

👉 **[CREATE PULL REQUEST ON GITHUB](https://github.com/Zaexv/world-of-prompcraft/pull/new/feat/malaka-architectural-overhaul)**
