# Mesh Collision Improvement Plan — MalakaBrokenChurch

The current collision implementation for `MalakaBrokenChurch` (and other buildings using hidden proxies) is failing because the `CollisionSystem` uses `THREE.Box3.setFromObject()`, which by default ignores objects where `visible = false`. Since all high-performance collision proxies in this project are hidden to avoid rendering, they are effectively skipped during world registration.

## 1. Root Cause Analysis
- **System Failure:** `CollisionSystem.createCollisionBody` calls `_box3.setFromObject(obj)`.
- **Three.js Behavior:** `setFromObject` returns an empty box for invisible objects.
- **Consequence:** Proxies are never added to the `BVHManager` or the `SpatialGrid`, making buildings "ghost-like" (player walks through them).

## 2. Implementation Steps for MalakaBrokenChurch

### Step 1: System-Level Fix
Modify `client/src/systems/CollisionSystem.ts` to support invisible proxies.
- Replace `setFromObject(obj)` with a custom helper that calculates the bounding box from the geometry regardless of visibility when `userData.isCollider` is true.

### Step 2: Mesh Component Standardization
Ensure `MalakaBrokenChurch.ts` follows these rigorous tagging rules:
- **Render Meshes:** MUST be tagged `userData.noCollision = true` or placed in a Group that is tagged.
- **Collision Proxies:** MUST use the `boxCollider` / `cylinderCollider` helpers which set `userData.isCollider = true` and `visible = false`.
- **Hierarchy:** Add all proxies directly to the main Group returned by the `build` method.

### Step 3: Granular Proxy Coverage
The current proxies for the broken church are too coarse. To make it "correct," we need:
- **Plinth Proxy:** A low, wide box for the foundation.
- **Nave/Transept Proxies:** Accurate height boxes.
- **Tower Proxy:** A vertical box covering the entire tower height.
- **Stair Proxies:** Small staggered boxes to allow the player to "climb" the ruins.
- **Buttress Proxies:** Individual boxes for the side pillars.

### Step 4: Verification
- **Debug Toggle:** Use the `CollisionDebug` system to render the collision boxes in-game.
- **Visual Check:** Confirm that green/red boxes appear exactly where the stone walls are, even if the render meshes are invisible.

## 3. Action Items
1. [x] Update `CollisionSystem.ts` to handle invisible `isCollider` meshes.
2. [x] Refine `MalakaBrokenChurch.ts` with granular proxies (Steps/Plinth/Buttresses).
3. [x] Confirm registration by checking `collisionSystem.getCollidableCount()`.
