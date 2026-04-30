# DEBUG — Tree Collisions & Remote Player Movement

## Issue 1: Generated Trees Have No Collisions

### Root Cause
`WorldGenerator.spawnTrees()` adds trees to the scene but never registers them with `CollisionSystem`. The collision system uses cannon-es AABB bodies — objects must be explicitly added via `addCollidable()`.

### What HAS collision
- Buildings → registered in `main.ts:96`
- Massive ancient trees (4) → registered in `main.ts:99-101`
- NPCs → dynamic source in `main.ts:104`

### What LACKS collision
- **Procedurally spawned trees** (`WorldGenerator.ts:362-377`) — `trackObject()` is called for scene cleanup but `addCollidable()` is never called
- Instanced vegetation (medium trees, mushrooms, ferns) in `Vegetation.ts` — InstancedMesh, lower priority

### Fix
1. Pass `CollisionSystem` into `WorldGenerator`
2. Call `addCollidable(tree)` after spawning each tree in `spawnTrees()`
3. Call `removeCollidable(obj)` during `onChunkUnloaded()` cleanup

---

## Issue 2: Remote Player Characters Don't Move

### Root Cause
In `handler.py:693-712`, when Player A moves:
1. `nearby = get_nearby_players(...)` returns `{A: {...}, B: {...}}`
2. `nearby.pop(player_id)` removes Player A → `{B: {...}}`
3. Server sends `world_update` to Player A with `[B's data]` ✅
4. Server broadcasts `world_update` to nearby (excl A) with **same list that has A removed** ❌

Player B receives a `world_update` containing only their OWN data. Client filters out self (`main.ts:426-428`), leaving an empty list. **Player B never receives Player A's position.**

### Fix
Include the moving player's public dict in the broadcast list sent to other players.
