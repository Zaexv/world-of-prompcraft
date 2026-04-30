# DEBUG — Tree Collisions & Remote Player Movement

> **Status:** ✅ Both issues resolved. See [Architecture § Collision & Camera System](../architecture.md#11-collision--camera-system) for the current design.

## Issue 1: Generated Trees Have No Collisions — ✅ RESOLVED

### Original Root Cause
`WorldGenerator.spawnTrees()` added trees to the scene but never registered them with `CollisionSystem`.

### Resolution
- `WorldGenerator` now receives a `CollisionSystem` reference
- Trees are registered on spawn via `addCollidableFiltered(tree)` — only trunk meshes (tagged `userData.isCollider = true`) produce collision bodies, keeping canopy/vine geometry non-blocking
- Procedural towns also register hut walls and well bases via `addCollidableFiltered()`
- On chunk unload, `removeCollidable(obj)` walks parent chains to remove all child bodies created by filtered registration
- Cave entrances use `addCollidable()` (whole-group AABB — caves are solid)

### What now has collision
- **Static buildings** → `addCollidablesFiltered()` in `main.ts` (tagged structural elements only)
- **Fort Malaka** → `addCollidablesFiltered()` (tower bases, gateway pillars, walls, pylons, etc.)
- **Massive ancient trees** → `addCollidablesFiltered()` (trunk + root base)
- **WorldGenerator trees** → `addCollidableFiltered()` per tree (trunk meshes)
- **Procedural towns** → `addCollidableFiltered()` (hut walls, well bases)
- **Cave entrances** → `addCollidable()` (whole-group AABB)
- **NPCs** → `setDynamicSource()` (synced each frame)
- **Terrain** → `getHeightAt()` heightmap (no AABB bodies needed)

---

## Issue 2: Remote Player Characters Don't Move — ✅ RESOLVED

### Original Root Cause
In `handler.py`, when Player A moves, the broadcast to other players used the same list with Player A removed, so Player B never received Player A's position.

### Resolution
Include the moving player's public dict in the broadcast list sent to other players.
