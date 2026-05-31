# Pull Request: Malaka Ruins Technical Overhaul & Watertight Collision System

## 🚀 Overview
This PR delivers a comprehensive technical and visual standardization of the **Málaga ruin biome** (`malaka-broken` set). It also resolves a critical systemic bug in the `CollisionSystem` that prevented high-performance hidden proxies from registering with the physics engine.

## 🏗️ Technical Improvements

### 1. Systemic Collision Fix (`CollisionSystem.ts`)
- **Visibility-Agnostic Registration**: Identified that `THREE.Box3.setFromObject()` was skipping invisible collision proxies.
- **Custom Bounding Calculation**: Implemented a geometry-based bounding box calculation for meshes tagged as `isCollider`, ensuring all optimized proxies are correctly registered by the physics engine regardless of visibility.

### 2. Mesh Quality Audit & Standardization (13 models)
- **Proxy-Only Physics**: Enforced a strict "Proxy-Only" pattern across the entire `malaka-broken` set. Tagged all render-heavy geometry with `userData.noCollision = true`.
- **Watertight Proxies**: Refactored `MalakaBrokenChurch` and others with ground-extended, overlapping `boxColliders` to eliminate "ghosting" (walking through walls/doors).
- **Z-Fighting Resolution**: Implemented burial "sinks" and staggered Z-layers for decorative elements (e.g., the Rose Window) to ensure flicker-free rendering.
- **Material Standardization**:
    - Aligned all ruins with `MalakaBrokenKit` and `PBRMaps`.
    - Enforced world-unit UV tiling for stone and roofs to prevent texture stretching.
    - Preserved flat, vibrant white stucco for the Andalusian aesthetic.

### 3. Landmark Implementation
- **Broken Church Deployment**: Spawned the newly refined `MalakaBrokenChurch` at the Fort Malaka cathedral site (`malaka_church_01`) in the `world_manifest.json`.

## 🛠️ Refactored Models
- **Religious**: `MalakaBrokenChurch`, `MalakaBrokenErmita`
- **Residential**: `MalakaBrokenHouse`, `MalakaBrokenHouseReconstructed`, `MalakaBrokenPatioHouse`, `MalakaBrokenCortijo`
- **Defensive**: `MalakaBrokenCastle`, `MalakaBrokenTower`, `MalakaBrokenWall`
- **Civic/Industrial**: `MalakaBrokenBodega`, `MalakaBrokenRomanAmphitheatre`

## 🧪 Verification & Quality
- **TypeScript**: Passed `npx tsc --noEmit`.
- **Physics**: Verified solidity of walls, foundations, and doors for the broken church.
- **Visuals**: Confirmed stable rendering at all distances (LODs) and resolution of tangent-line clipping.

## 🗂️ Documentation
- Created `docs/meshes_improvement.md` outlining the new collision implementation standards and the systemic fix applied.
