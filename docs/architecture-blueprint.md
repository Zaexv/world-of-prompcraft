# World of Promptcraft — Complete Technical Architecture

> **Purpose**: This document captures the full technical architecture of World of Promptcraft, a 3D multiplayer RPG where the core mechanic is prompting LLM-powered NPCs via free-form text. It is designed to enable recreation of the game from scratch in any game engine (Unity, Unreal, Godot, etc.) with any LLM framework.
>
> **What's included**: Every system, algorithm, data structure, constant, protocol message, and design pattern.
> **What's excluded**: Lore content, specific NPC dialogue, story text.

---

## High-Level Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    CLIENT (Game Engine)              │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌────────────────┐  │
│  │  Renderer  │  │  Entities │  │   UI System    │  │
│  │  (3D Scene,│  │  (Player, │  │  (Chat, HUD,   │  │
│  │   Terrain, │  │   NPCs,   │  │   Inventory,   │  │
│  │   Effects) │  │   Remote  │  │   Nameplates)  │  │
│  │            │  │   Players)│  │                │  │
│  └─────┬─────┘  └─────┬─────┘  └───────┬────────┘  │
│        │              │                 │            │
│  ┌─────┴──────────────┴─────────────────┴────────┐  │
│  │              Game Systems Layer                │  │
│  │  (Collision, Interaction, Reaction, Dungeons,  │  │
│  │   WorldGen, ZoneTracker)                       │  │
│  └──────────────────────┬────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────┴────────────────────────┐  │
│  │         State (PlayerState, WorldState)         │  │
│  └──────────────────────┬────────────────────────┘  │
│                         │                            │
│  ┌──────────────────────┴────────────────────────┐  │
│  │    Network (WebSocket JSON, auto-reconnect)    │  │
│  └──────────────────────┬────────────────────────┘  │
└─────────────────────────┼───────────────────────────┘
                          │ WebSocket (port 8000)
                          │ JSON messages
┌─────────────────────────┼───────────────────────────┐
│                    SERVER                            │
│  ┌──────────────────────┴────────────────────────┐  │
│  │      WebSocket Handler (message dispatcher)    │  │
│  └───────┬──────────────┬───────────────┬────────┘  │
│          │              │               │            │
│  ┌───────┴──────┐ ┌────┴─────┐  ┌──────┴─────────┐ │
│  │  Connection  │ │  World   │  │  Agent Registry │ │
│  │  Manager     │ │  State   │  │  (per-NPC       │ │
│  │  (broadcast, │ │  (auth-  │  │   LangGraph     │ │
│  │   proximity) │ │  itative)│  │   agents)       │ │
│  └──────────────┘ └──────────┘  └───────┬─────────┘ │
│                                         │            │
│  ┌──────────────────────────────────────┴─────────┐ │
│  │         LangGraph Agent Pipeline               │ │
│  │  reason → act(loop) → respond → reflect →      │ │
│  │  [summarize]                                    │ │
│  │                                                 │ │
│  │  Tools: combat, dialogue, trade, environment,   │ │
│  │         world_query                             │ │
│  │  Memory: MemorySaver (per NPC×player thread)    │ │
│  │  RAG: keyword-matched lore retrieval            │ │
│  └──────────────────────┬─────────────────────────┘ │
│                         │                            │
│  ┌──────────────────────┴────────────────────────┐  │
│  │     LLM Provider (Claude / OpenAI)             │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### Core Design Principles

1. **Server-Authoritative State**: All game state (HP, inventory, positions, NPC state) lives on the server. Client is a render mirror.
2. **Prompt as the Only Input**: No attack/trade/quest buttons — text prompt IS the game interface. LLM decides what actions to take.
3. **Per-NPC Agents**: Each NPC gets its own LangGraph StateGraph with independent memory, mood, and relationship tracking.
4. **Tool-Driven Mechanics**: LLM calls typed tools (`deal_damage`, `heal_target`, `offer_item`, etc.) that produce structured actions processed by both server and client.
5. **Generative World**: Infinite chunk-based terrain, NPCs/trees spawned procedurally on exploration.
6. **Cost-Aware AI**: Heuristic-based reflection (no LLM), conditional summarization (LLM only every ~6 exchanges).

### Key Technology Mapping (Browser → Game Engine)

| Browser Implementation | Game Engine Equivalent |
|---|---|
| Three.js WebGLRenderer | Unity URP / Unreal Renderer / Godot RenderingServer |
| THREE.InstancedMesh | GPU Instancing / MultiMesh |
| UnrealBloomPass (post-processing) | Post-processing Volume / PPv2 |
| HTML DOM UI panels | Unity UI Toolkit / UMG / Godot Control nodes |
| Canvas2D Nameplates | World-space UI / 3D Widgets |
| WebSocket JSON | Native TCP/UDP sockets or WebSocket |
| requestAnimationFrame loop | Engine Update/Tick |
| Three.js Raycaster | Physics Raycast |
| Simplex noise (terrain) | Same (FastNoiseLite / libnoise) |

---

# PART 1: CLIENT ARCHITECTURE

**Architecture Type:** Component-based, event-driven system with immediate-mode rendering  
**Networking:** WebSocket with JSON messages (auto-reconnect + heartbeat)



## **1. GAME BOOTSTRAP & MAIN LOOP**

### **Entry Point: `main.ts`**

**Initialization Flow:**
1. **LoginScreen** displayed first (username, race, faction selection)
2. On login → `initGame(username, race, faction)` called
3. Game state, scene, entities, systems initialized in sequence
4. Network client connects → server sends initial NPC list + players
5. Main render loop begins via `requestAnimationFrame`

**Main Loop Tick Order (every frame):**
```
1. PlayerController.update(delta)       // Input, movement, collision
2. EntityManager.update(delta)          // NPC animation, distance culling
3. Terrain.update(playerX, playerZ)    // Chunk load/unload
4. WorldGenerator.update(...)           // Spawn trees/caves/NPCs
5. ZoneTracker.update(playerX, playerZ) // Zone boundary detection
6. SceneManager.tick()                  // Render + post-processing
```

**Delta Time:** Obtained from `THREE.Clock.getDelta()` — **accurate to frame boundary**. Used for:
- Animation speed normalization
- Movement frame-independence
- Smooth interpolation

**Performance Optimizations:**
- Distance-based NPC culling (visibility at 350 units, full update at 200 units)
- Terrain chunk LOD (CHUNK_SEGMENTS: 32 nearby, 16 mid, 8 far)
- Water reflection skipped when player Y > 15
- Post-processing at half-resolution bloom



## **2. SCENE MANAGEMENT**

### **Core: `SceneManager.ts`**

**Renderer Configuration:**
```typescript
const camera = new THREE.PerspectiveCamera(
  60,           // FOV (wide for immersion)
  aspect,       // Window aspect ratio
  0.1, 800      // Near/far clip (800 unit view distance)
);
camera.position.set(0, 30, 60);  // Elevated starting position

const renderer = new THREE.WebGLRenderer({ 
  antialias: true, 
  powerPreference: 'high-performance' 
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Cap at 2x for perf
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;  // Soft shadows
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.6;  // Cinematic tone curve
```

**Post-Processing Pipeline:**
- **EffectComposer** with pass chain:
  1. **RenderPass** — base scene render
  2. **UnrealBloomPass** (half-resolution for perf):
     - Strength: 0.35 (subtle)
     - Radius: 0.5 (soft spread)
     - Threshold: 0.8 (only emissive blooms)
  - Fallback to direct render if post-processing fails

**Scene Graph Structure:**
```
scene
├── Skybox (CubeTexture background)
├── Lighting (DirectionalLight + HemisphereLight + SpotLights)
├── Terrain (ChunkMeshes with vertex colors)
├── Water (2048×2048 plane, follows player)
├── Buildings (static groups with footprints)
├── FortMalaka (static structures)
├── Vegetation (instanced meshes + massive tree groups)
├── Effects (wisps, particles, glow patches)
├── NPCs (dynamic entity manager meshes)
└── RemotePlayers (interpolated positions)
```

**Key Constants:**
- **Fog:** `THREE.FogExp2(0x1a1133, density=0.004)` — deep purple-blue exponential
- **Background:** Deep indigo `0x0a0612` (fallback while skybox loads)
- **Shadow map size:** 2048×2048
- **Shadow camera:** 160×160 units, far=300, bias=-0.001



## **3. TERRAIN SYSTEM**

### **Core: `Terrain.ts`**

**Chunk-Based Infinite Procedural Terrain**

**Constants:**
```typescript
const CHUNK_SIZE = 64;          // World units per chunk edge
const CHUNK_SEGMENTS = 32;      // Vertex subdivisions (nearby)
const VIEW_RADIUS = 3;          // 7×7 = 49 chunks active
const UNLOAD_RADIUS = VIEW_RADIUS + 2;  // Buffer zone
```

**Height Function — Multi-octave Sin/Cos Noise:**
```
Base terrain (8 frequencies):
  h += sin(x*0.01 + 0.3) * cos(z*0.012 + 1.7) * 8      [large rolling hills]
  h += sin(x*0.007 - 1.2) * sin(z*0.009 + 0.8) * 6     [broad undulation]
  h += cos(x*0.005 + 2.5) * sin(z*0.006 - 0.4) * 4     [medium rolls]
  h += sin(x*0.03 + 2.1) * cos(z*0.028 - 0.5) * 2.5    [medium detail]
  h += cos(x*0.025 + 0.7) * sin(z*0.035 + 1.3) * 2.0   [detail]
  h += sin(x*0.05 - 0.9) * cos(z*0.055 + 2.3) * 1.2    [fine detail]
  h += sin(x*0.08 + 4.0) * cos(z*0.07 - 2.0) * 0.6     [very fine]
  h += cos(x*0.09 - 1.5) * sin(z*0.1 + 3.0) * 0.4      [bumps]
  h += sin(x*0.15 + 1.1) * cos(z*0.13 - 3.2) * 0.2     [root-like]

Biome modifiers: blended per biome weights
Beach blend: Fort Malaka slopes from 2.0 (promenade) → -0.8 (water)
```

**Determinism:** Same `(x, z)` always produces same height — no chunk dependence.

**Chunk Lifecycle:**

**Load:**
1. Create `PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, segments, segments)`
2. Rotate X by -π/2 to lay flat
3. Sample height at each vertex via `Terrain.computeHeight()`
4. Compute vertex normals
5. Apply vertex colors from biome system
6. Apply per-vertex emissive colors
7. Create mesh with shared material
8. Add to scene, track in `chunks: Map<string, ChunkData>`
9. Fire `onChunkLoaded` callback for WorldGenerator

**Unload:**
1. Remove mesh from scene
2. Dispose geometry (material is shared, not disposed)
3. Delete chunk from map
4. Fire `onChunkUnloaded` callback

**LOD System:**
```typescript
const distFromPlayer = Math.max(|cx - playerCX|, |cz - playerCZ|);
const segments = (distFromPlayer <= 1) ? 32
               : (distFromPlayer <= 3) ? 16
               : 8;
```
**Saves ~65% of terrain triangles** beyond view radius.

**Beach Blend Function:**
```typescript
getBeachBlend(x, z): 0..1
  // Fort Malaka beach: X ∈ [-45, 45], Z ∈ [-190, -155]
  // Fast AABB rejection, then edge fade over ~10 units
  // Returns 1.0 in beach core, 0.0 outside
```

**Material Sharing:** Single `MeshStandardMaterial` reused for all chunks (one shader compile). Custom vertex shader adds:
- `aEmissive` per-vertex attribute → `vEmissiveGlow` varying
- Blends into fragment emissive in post-processing



## **4. BIOME SYSTEM**

### **Core: `Biomes.ts`**

**Five Biomes (Radial Blend):**

| Biome | Position | Height Mod | Color Palette | Emissive Glow |
|-------|----------|-----------|---|---|
| **Teldrassil** | Center | None (base) | Deep greens, purples | Purple/teal valley glow |
| **Ember Wastes** | East | Jagged +6 units | Reds, oranges | Orange/red lava glow |
| **Crystal Tundra** | North | Peaks +12 units | Blues, whites | Icy blue shimmer |
| **Twilight Marsh** | South | Flat -2 units | Deep greens, purples | Murky green glow |
| **Sunlit Meadows** | West | Gentle rolling | Golden greens | Warm valley glow |

**Biome Weight Calculation:**

```typescript
export function getBiomeWeights(x, z): BiomeWeights {
  const dist = sqrt(x² + z²);
  const angle = atan2(z, x);  // -π..π
  
  // Center biome fades out with distance
  const centerWeight = clamp(1.0 - (dist - BIOME_START + TRANSITION) / TRANSITION, 0, 1);
  
  // Directional sectors (90° each, raised cosine falloff)
  const ember = directionalWeight(angle, 0);              // 0°: east
  const tundra = directionalWeight(angle, π/2);          // 90°: north
  const meadows = directionalWeight(angle, π);           // 180°: west
  const marsh = directionalWeight(angle, -π/2);          // 270°: south
  
  const outerWeight = clamp((dist - BIOME_START) / TRANSITION, 0, 1);
  
  // Weights normalized to sum to 1
  return { Teldrassil: centerWeight, EmberWastes: ember * outer, ... };
}

function directionalWeight(angle, targetAngle): 0..1 {
  // Raised cosine over ~110° half-width
  const diff = angle - targetAngle (wrapped to [-π, π]);
  const halfWidth = π * 0.6;
  if (|diff| > halfWidth) return 0;
  return 0.5 + 0.5 * cos((diff / halfWidth) * π);
}
```

**Constants:**
- `TRANSITION = 100` units (blend zone width)
- `BIOME_START = 120` units from origin (where non-center biomes begin dominating)

**Color Interpolation:**
```typescript
getBiomeColor(x, z, y, t): THREE.Color {
  // t = normalized height [0..1]
  // For each biome:
  //   t < 0.3: low → mid (valleys)
  //   0.3 < t < 0.55: mid → high (slopes)
  //   0.55 < t < 0.75: high → peak (cliffs)
  //   t > 0.75: peak
  
  // Beach override: Fort Malaka sand gradient
  //   Dry sand (upper) → Mid sand → Wet sand (water's edge)
  //   With subtle noise variation for realism
}
```

**Emissive Glow Per Biome:**
- **Teldrassil:** Valley glow (purple/teal) when t < 0.25
- **Ember Wastes:** Orange/red lava glow when t < 0.35
- **Crystal Tundra:** Icy blue shimmer on peaks (t > 0.5)
- **Twilight Marsh:** Murky green-purple everywhere (t < 0.4)
- **Sunlit Meadows:** Warm golden glow in valleys (t < 0.3)
- **Beach:** Subtle warm glow near water edge

**Beach Blend (Fort Malaka):**
Deterministically blends terrain into sandy beach over specific region. Blends height, color, and emissive separately.



## **5. WATER SYSTEM**

### **Core: `Water.ts`**

**Reflective Water Plane**

**Configuration:**
```typescript
export class Water {
  public static readonly LEVEL = -1.0;  // Water surface Y coordinate
  
  private water: ThreeWater;  // Uses Three.js Water shader
  private geometry = new THREE.PlaneGeometry(2048, 2048, 1, 1);
}
```

**Normal Map Generation:** Procedurally created on canvas (512×512):
```
Overlapping sine waves → ripple-like pattern
  nx = sin(x*0.05)*cos(y*0.12)*0.3 + sin(x*0.12 + y*0.05)*0.2 + cos(x*0.03 - y*0.03)*0.1
  ny = cos(x*0.12)*sin(y*0.05)*0.3 + cos(x*0.05 - y*0.12)*0.2 + sin(x*0.03 + y*0.03)*0.1
Encode to RGB: (nx*0.5+0.5)*255, (ny*0.5+0.5)*255, 220 (strong Z)
```

**Water Material Parameters:**
```typescript
new ThreeWater(geometry, {
  textureWidth: 256,
  textureHeight: 256,
  waterNormals: normalTexture,
  sunDirection: new THREE.Vector3(0.3, 1.0, 0.5).normalize(),
  sunColor: 0x8899bb,        // Silver-blue sun
  waterColor: 0x0a3a3a,      // Deep teal
  distortionScale: 2.5,      // Wave amplitude
  fog: true
});
```

**Update (Every Frame):**
1. Increment shader `time` uniform by `delta * 0.5`
2. Reposition water plane to follow player (X/Z only, Y fixed)
3. Skip water update if player Y > 15 (performance optimization)

**Collision:** Water level checked via `Water.getWaterLevel()` for:
- Swimming trigger (terrain Y below water level)
- Vegetation avoidance
- NPC spawn rejection



## **6. BUILDING SYSTEM**

### **Core: `Buildings.ts` & `FortMalaka.ts`**

**Building System Architecture:**

All buildings built from **Three.js primitive geometries** (cylinders, spheres, boxes, cones, toruses, lathe geometries).

**Teldrassil Buildings (4 locations):**

| Name | Position | Key Components | Footprint |
|------|----------|---|---|
| **Moonwell** | (30, 10) | Basin, inner water (emissive), 6 pillars with runes, arches | r=10 |
| **Tree House** | (-40, -25) | Trunk, roots, platform, walls (lathe), cone roof, door frame, windows, runes, canopy spheres | r=10 |
| **Sentinel Tower** | (15, -35) | Tower cylinder, flared crown, spire, spiral stairs (boxes), rune lines, crown ring, glow light | r=7 |
| **Market Pavilion** | (-20, 20) | 8 curved pillars, drooping fabric canopy (circle with vertex displacement), inner canopy, table | r=10 |

**Footprint Usage:** Passed to Vegetation system to prevent tree spawning inside buildings.

**Fort Malaka Complex (~40 structures):**

**Mage District (Blasted Suarezlands):**
- **Grand Mage Tower** (0, -120): Base + shaft + crown + core + spire + pylons + glowing interior
- **Arcane Pylons** (6 locations): Hexagonal bases with spiraling runes, glowing caps
- **Runic Circle** (0, -120): Ring of 8 rune pillars with glowing ground
- **Mage Houses** (4 locations): Arcane-themed residences with glowing accents
- **Gateway** (0, -88): Grand archway with rune frame

**Mediterranean Málaga District:**
- **La Alcazaba** (30, -152): Moorish fortress with stone walls, towers, crenellations
- **Casitas Blancas** (8 white houses): Simple Mediterranean-style homes
- **Paseo Marítimo** (promenade): Consolidated stone walkway along beach
- **Palm Trees** (13 locations): Trunk + canopy spheres
- **La Farola** (40, -175): Lighthouse with stone tower + light beam effect
- **Chiringuito** (−15, −172): Beach bar with terrace
- **Espeto Stands** (2 locations): Sardine grill stands

**Material Patterns:**

**Building Materials:**
- **Stone:** `MeshStandardMaterial({ color: 0x888899, roughness: 0.5, metalness: 0.1 })`
- **Wood:** `roughness: 0.85–0.95`
- **Fabric:** `color: 0x6a2fa0 (purple) or 0x1a8a7a (teal), roughness: 0.6, transparent, opacity: 0.7–0.9`
- **Runes:** `MeshStandardMaterial({ emissive: 0xaa44ff, emissiveIntensity: 1.5–1.8 })`

**Shadow Setup:**
- Static geometry: `castShadow: true, receiveShadow: true`
- Runes: `castShadow: false` (emissive only, no geometry shadow)
- Decorative elements: Minimal shadow casting for performance

**Lighting per Building:**
- Moonwell: `PointLight(0x00ffcc, 1.5, range=12)` — subtle glow
- Sentinel Tower: `PointLight(0xaa44ff, 1, range=10)` — top glow
- Grand Mage Tower: `PointLight(0x8833dd, 2, range=20)` — district center
- Lighthouse: `PointLight(0xffbb00, 1.8, range=30)` — beach beacon



## **7. VEGETATION SYSTEM**

### **Core: `Vegetation.ts`**

**Hybrid Approach: Massive Trees (Groups) + Instanced Meshes**

**Massive Ancient Trees (4-5, placed as Groups):**

```typescript
const massiveCount = 4;
for (attempts < 200) {
  // Random position in 350-unit radius
  const tx = (rand() - 0.5) * 350;
  const tz = (rand() - 0.5) * 350;
  
  // Reject if: blocked by building, terrain Y > 10, too close to other massive trees
  if (isBlocked(tx, tz, margin=12)) continue;
  if (terrain.getHeightAt(tx, tz) > 10) continue;
  if (distToOtherMassive < 60) continue;
  
  // Create detailed massive tree group
  const group = createMassiveTree(scene, tx, ty, tz, rand);
  massiveTreeGroups.push(group);  // For collision
}
```

**Massive Tree Structure:**
- **Trunk:** Large cylinder, textured with bark color
- **Roots:** Flared cone at base
- **Canopy:** Multiple spheres arranged in sphere (Teldrassil aesthetic)
- **Details:** Hanging vines (thin cylinders), bioluminescent fungi (small glowing spheres)
- **Total vertices:** ~2000 per tree
- **Collision:** Included in CollisionSystem as static collidables

**Medium Trees (80 instanced):**

```typescript
const medTreeCount = 80;
const medTrunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 14, 7);
const medCanopyGeo = new THREE.SphereGeometry(4, 7, 5);

this.mediumTrunks = new THREE.InstancedMesh(medTrunkGeo, medTrunkMat, medTreeCount);
this.mediumCanopies = new THREE.InstancedMesh(medCanopyGeo, medCanopyMat, medTreeCount);
```

**Per-Instance Data:**
- Position: World coordinates
- Scale: 0.6–1.4× base size
- Rotation: Random Y rotation
- Color: Green with purple tint variation (canopy only)

**Placement Algorithm:**
```
3000 attempts max:
  Position: (rand() - 0.5) * 450
  Reject if: blocked, Y > 12 (too high), (Y > 8 AND rand() > 0.3)
  Place instance, increment counter
Count = min(placed, medTreeCount)
```

**Glowing Mushrooms (100+ instanced):**

```typescript
mushroomStems = InstancedMesh(CylinderGeometry(0.15, 0.2, 1.2, 5), ...)
mushroomCaps = InstancedMesh(SphereGeometry(0.5, 6, 4), ...)
```

**Stem:** Brown `0x5d4d3d`, non-emissive  
**Cap:** Purple `0x8855dd`, emissive `0xaa66ff` intensity 1.5  
**Glow:** Subtle bloom via emissive, visible at night

**Ferns & Bushes (150+ instanced):**

```typescript
ferns = InstancedMesh(ConeGeometry(0.4, 1.0, 8), ...)
```

**Color:** Teal-green `0x3a8a6a`  
**Height:** Variable (0.8–1.6×)  
**Placement:** Lower-Y terrain, clustered around mushrooms

**Building Footprint Avoidance:**

```typescript
function isBlocked(px, pz, margin = 0): boolean {
  for (const footprint of buildingFootprints) {
    const dx = px - footprint.x;
    const dz = pz - footprint.z;
    if (dx² + dz² < (footprint.radius + margin)²) return true;
  }
  return py < Water.LEVEL + 0.5;  // Also reject submerged
}
```

**Biome-Specific Vegetation (in WorldGenerator):**

WorldGenerator spawns additional trees when chunks load, respecting biome:
- **Ember Wastes:** Dead trees, sparse
- **Crystal Tundra:** Tall cones, sparse, icy colors
- **Twilight Marsh:** Mushroom forests, drooping shapes
- **Sunlit Meadows:** Round oak-like trees



## **8. EFFECTS SYSTEM**

### **Core: `Effects.ts`**

**Environmental Magical Effects**

**Wisps (8-12 animated sprites):**

```typescript
interface WispData {
  sprite: THREE.Sprite;
  origin: THREE.Vector3;
  phase: number;           // Animation offset
  speed: number;           // Radians/sec (0.15–0.35)
  radiusX, radiusZ: number;
  baseY: number;
  baseIntensity: number;   // 0.4–0.7
  pulseSpeed: number;      // 0.8–2.0
}
```

**Rendering:**
- **Texture:** Radial gradient (white center → teal/purple edge → transparent)
- **Material:** `SpriteMaterial` with additive blending (no depth write)
- **Color:** Mix of teal `0x44ffcc` and purple `0xaa66ff`

**Animation (per frame):**
```
position.x = origin.x + cos(phase * speed) * radiusX
position.y = origin.y + sin(phase * speed * 0.4) * 0.5 + sin(elapsed * pulseSpeed) * 0.2
position.z = origin.z + sin(phase * speed) * radiusZ
opacity = baseIntensity * (0.5 + 0.5 * sin(elapsed * pulseSpeed))
```

**Update:** Phase increments smoothly, position recalculated each frame (no skeleton).

**Particles (200 ambient particles):**

```typescript
const particleCount = 200;
const particleGeo = new THREE.BufferGeometry();
const positions = new Float32Array(particleCount * 3);
const velocities = new Float32Array(particleCount * 3);

// Each particle: position + velocity vector
// Updated each frame: pos += vel * dt
```

**Rendering:**
- `THREE.Points` with custom material
- Small spheres, teal color
- Gravity applied: `velocity.y -= 1.5 * dt`
- Respawn when Y < -50

**Falling Leaves (30-50):**

```typescript
interface LeafData {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  swayPhase: number;
  swaySpeed: number;
}
```

**Mesh:** Small plane with purple leaf texture  
**Physics:**
```
velocity.x += sin(swayPhase) * swaySpeed * dt
position += velocity * dt
velocity.y *= 0.98  // Air resistance
```

**Respawn:** When Y drops below terrain + 1.0, teleport back to top.

**Ground Glow Patches (visual ambient fx):**

```typescript
interface GlowPatch {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  phase: number;
  baseOpacity: number;
}
```

**Rendering:**
- Small circular glowing areas on ground
- Pulsing opacity via sine wave
- Colors: Purple, teal, green (biome-dependent)

**Update per frame:**
```
material.opacity = baseOpacity * (0.5 + 0.5 * sin(phase))
phase += 1.0 * dt
```



## **9. SKYBOX SYSTEM**

### **Core: `Skybox.ts`**

**Procedurally Generated CubeTexture**

**Approach:** Generate 6 cube faces (512×512 each) on canvas, convert to CubeTexture. Set as `scene.background` (no extra draw call, GPU-efficient).

**Rendering Algorithm (per pixel):**

1. **Map pixel to direction vector:**
   ```
   u = (x / size) * 2 - 1
   v = (y / size) * 2 - 1 (inverted for cube map)
   direction = forward + right * u + up * (-v)  // per-face axis
   normalized_direction = normalize(direction)
   h = normalized_direction.y  // height factor
   ```

2. **Base gradient:**
   ```
   if h > 0:  // above horizon
     color = lerp(horizon, zenith, clamp(h, 0, 1))
   else:      // below horizon
     color = lerp(horizon, below_horizon, clamp(-h, 0, 1))
   ```
   - **Zenith:** Deep indigo `[10, 6, 40]`
   - **Horizon:** Dark teal `[18, 34, 51]`
   - **Below:** Near-black purple `[10, 6, 18]`

3. **Stars (above horizon only, h > 0.02):**
   ```
   starHash = hash(floor(ndx * 200 + 500), floor(ndz * 200 + 500))
   if starHash > 0.97:  // 3% of sky volume
     brightness = 0.5 + 0.5 * hash(sx + 7, sz + 3)
     fade = (h - 0.02) / 0.23  // fade in from horizon
     star_intensity = brightness * fade * 200
     color += star_intensity * [0.85, 0.88, 1.0]  // white-blue
   ```

4. **Nebula Glow (clouds):**
   ```
   if -0.1 < h < 0.8:
     nu, nv = ndx * 3 + 0.5, ndz * 3 + 0.8
     n = fbm(nu, nv)  // 4-octave Perlin-like
     nebula_mask = smoothstep(h + 0.1, h + 0.5) * smoothstep(0.8 - h, 0.4 - h)
     nebula_intensity = n * nebula_mask * 0.3
     color += nebula_intensity * purple [102, 51, 170]
   ```

5. **Two Moons:**
   - **Primary Moon:** Large, silver-blue `[190, 210, 242]` at position `(0.4, 0.7, -0.5)`
   - **Secondary Moon:** Smaller, purple-tinted `[178, 153, 217]` at `(-0.6, 0.5, 0.3)`
   - Both use smooth disc function with glow halo

**Hash & Noise Functions:**
```typescript
hash(x, y): // Pseudo-random [0..1]
  a = |x * 443.8975 + y * 397.2973| % 1000
  return (a * (a + 19.19)) % 1000 / 1000

noise(x, y): // Perlin-like interpolation
  [ix, iy] = floor(x, y)
  [fx, fy] = frac(x, y)
  [sx, sy] = smoothstep(fx, fy)  // Hermite interpolation
  return bilinear_interpolate(hash values at 4 corners)

fbm(x, y): // Fractional Brownian motion
  value = 0, amp = 0.5
  for i in 0..3:
    value += amp * noise(x, y)
    x *= 2.2, y *= 2.2, amp *= 0.5
  return value
```



## **10. LIGHTING SYSTEM**

### **Core: `Lighting.ts`**

**Moonlit Teldrassil Atmosphere**

**Directional Light (Main "Moon"):**
```typescript
this.sun = new THREE.DirectionalLight(0xaabbdd, intensity=1.4);
this.sun.position.set(80, 140, 50);  // Elevated northwest
this.sun.castShadow = true;

// Shadow configuration (wide, to cover explored terrain)
this.sun.shadow.mapSize.set(2048, 2048);
this.sun.shadow.camera.near = 0.5;
this.sun.shadow.camera.far = 300;
this.sun.shadow.camera.left = -80;
this.sun.shadow.camera.right = 80;
this.sun.shadow.camera.top = 80;
this.sun.shadow.camera.bottom = -80;
this.sun.shadow.bias = -0.001;  // Reduce acne
```

**Hemisphere Light (Sky + Ground Fill):**
```typescript
this.hemisphere = new THREE.HemisphereLight(
  0x8899cc,  // Sky color (silver-blue)
  0x332244,  // Ground color (dark purple)
  intensity=0.9
);
```
- Provides ambient fill without harsh shadows
- Sky light dominates, ground bounce adds purple undertone

**Ambient Purple Point Light:**
```typescript
const purpleAmbient = new THREE.PointLight(0x7744bb, intensity=0.8, range=600);
purpleAmbient.position.set(-80, 60, -100);
```
- Distant source simulating atmospheric glow
- Long range covers whole map

**Moonbeam SpotLights (3 locations):**
```typescript
const moonbeamColor = 0x8899cc;
for (const cfg of [{x: 20, z: -15}, {x: -35, z: 25}, {x: 50, z: 40}]) {
  const beam = new THREE.SpotLight(
    moonbeamColor, 
    intensity=0.8, 
    range=250, 
    angle=π/8, 
    penumbra=0.6, 
    decay=1.2
  );
  beam.position.set(cfg.x, 80, cfg.z);
  beam.target.position.set(cfg.x, 0, cfg.z);
  beam.castShadow = false;  // Performance
}
```
- Simulates light breaking through canopy
- No shadow casting (perf optimization)

**Fog (Exponential):**
```typescript
scene.fog = new THREE.FogExp2(0x1a1133, density=0.004);
```
- Deep purple-blue exponential fog
- Fog density: 0.004 → visibility ~575 units (matches far clip ~800)
- Creates depth, hides far terrain popping

**Performance Optimizations:**
- Only **1 directional light** with shadows (others non-shadow-casting)
- Spotlights used for ambiance only, no shadow casting
- Shadow map: 2048×2048 (reasonable quality for browser)
- Hemispheric fill reduces light bake complexity



## **11. ENTITY SYSTEM**

### **Core Components**

**`EntityManager.ts`** — Central registry for NPCs and remote players

```typescript
export class EntityManager {
  public readonly npcs: Map<string, NPC> = new Map();
  private readonly remotePlayers: Map<string, RemotePlayer> = new Map();
  
  // Distance-based culling
  private readonly UPDATE_RADIUS_SQ = 200 * 200;
  private readonly VISIBLE_RADIUS_SQ = 350 * 350;
}
```

**NPC Lifecycle:**
1. **Create:** `addNPC(config)` → instantiate model + animator
2. **Track:** Store in map, add mesh to scene
3. **Update (every frame):**
   - Within 200 units: Run full AI (wander, animation)
   - 200-350 units: Hide mesh for performance
   - Beyond 350 units: Completely culled
4. **Remove:** `removeNPC(id)` → dispose mesh + animator, delete from map

**`Player.ts`** — Player character model + animation

```typescript
export class Player {
  public readonly group: THREE.Group;
  private leftLeg, rightLeg, leftArm, rightArm, body, cloak: THREE.Mesh;
  private walkPhase = 0;
  private swimPhase = 0;
  private bodyTilt = 0;  // For swim tilt
}
```

**Race Models:** Built from primitives (cylinders, spheres, boxes) in `RaceModels.ts`

**Animation:**
- **Walk:** Leg swing via `sin(walkPhase)`, arm counter-swing
- **Swim:** Horizontal body tilt (π/2.5), leg flutter, arm breaststroke
- **Idle:** Gentle vertical bob, gravity reset

**`NPC.ts`** — NPC entity with model, animation, and interactive features

```typescript
export class NPC {
  public readonly id: string;
  public readonly position: THREE.Vector3;
  public readonly mesh: THREE.Group;
  public readonly animator: NPCAnimator;
  public readonly nameplate: Nameplate;
  public readonly actionIcon: ActionIcon;
  
  // Wandering
  public homePosition: THREE.Vector3;
  public wanderRadius = 8;
  private wanderTarget: THREE.Vector3;
  private wanderCooldown: number;  // 3-8 seconds
}
```

**Model Components:**
- **Body:** Cylinder (0.3 wide, 1.4 tall) with base color
- **Shoulders:** Two spheres, slightly darker
- **Head:** Sphere (0.25 radius)
- **Legs:** Two boxes (0.16×0.65×0.16)
- **Hat:** Cone on top
- **Belt:** Torus around waist
- **Accessories:** Role-based (merchant bag, cleric glow, etc.)

**Highlight System:**
```typescript
setHighlight(enabled: boolean): void {
  for (const mat of this.materials) {
    if (enabled) {
      mat.emissive.setHex(0xffff00);  // Yellow glow on hover
      mat.emissiveIntensity = 1.5;
    } else {
      mat.emissive.setHex(originalEmissives[i]);
      mat.emissiveIntensity = 0;
    }
  }
}
```

**Wandering AI:**
```typescript
updateWander(delta, getHeightAt): void {
  if (!hasWanderTarget) {
    wanderTimer += delta;
    if (wanderTimer > wanderCooldown) {
      // Pick random point within wanderRadius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * wanderRadius;
      wanderTarget = homePosition + vec(cos(angle) * dist, 0, sin(angle) * dist);
      hasWanderTarget = true;
    }
  } else {
    // Smoothly move toward target
    const direction = wanderTarget - position;
    if (length(direction) < 1.0) {
      hasWanderTarget = false;
      wanderTimer = 0;
    } else {
      position += normalize(direction) * wanderSpeed * delta;
      position.y = getHeightAt(position.x, position.z);
    }
  }
}
```

**`PlayerController.ts`** — Player input + movement + camera

```typescript
export class PlayerController {
  public readonly position = new THREE.Vector3(0, 0, 0);
  public yaw = 0;
  public pitch = 0;
  public isPointerLocked = false;
  public isSwimming = false;
  
  // Movement constants
  private readonly walkSpeed = 8;
  private readonly runSpeed = 16;
  private readonly jumpVelocity = 10;
  private readonly gravity = -20;
  
  // Swimming constants
  private readonly swimSpeed = 5;
  private readonly swimSprintSpeed = 8;
  private readonly buoyancy = 12;
  private readonly swimGravity = -5;
}
```

**Input Handling:**
- **Pointer Lock:** Click to lock/unlock mouse
- **Mouse Look:** Movement X/Y → yaw/pitch (0.002 rad/pixel sensitivity)
- **WASD:** Key press sets velocity in world-space direction
- **Space:** Jump (if grounded) or swim upward (if swimming)
- **Shift:** Sprint (run speed = walk speed × 2)
- **Mouse Wheel:** Camera zoom (4–20 units distance)

**Movement Physics:**
```typescript
update(delta): void {
  // Input
  const forwardDir = this.getForwardDirection();  // Based on yaw
  const rightDir = this.getRightDirection();
  let moveVec = new THREE.Vector3();
  if (keys.W) moveVec.addScaledVector(forwardDir, isSprinting ? runSpeed : walkSpeed);
  if (keys.S) moveVec.addScaledVector(forwardDir, -walkSpeed);
  // ... A, D similarly
  
  // Grounding
  const terrainY = this.getHeightAt(position.x, position.z);
  const isGrounded = position.y <= terrainY + 0.1;
  
  // Gravity / Jump
  if (isGrounded && !isSwimming) {
    if (keys.Space) verticalVelocity = jumpVelocity;
    else verticalVelocity = 0;
  } else if (isSwimming) {
    // Buoyancy pulls toward water surface
    const swimmingDepth = waterLevel - position.y;
    verticalVelocity += buoyancy * (swimDepth - swimmingDepth) * delta;
    verticalVelocity += swimGravity * delta;
  } else {
    verticalVelocity += gravity * delta;
  }
  
  // Movement
  desiredPos = position + moveVec * delta;
  desiredPos.y += verticalVelocity * delta;
  
  // Collision resolution
  resolvedPos = collisionSystem.resolveMovement(position, desiredPos);
  position = resolvedPos;
}
```

**Swimming Transition:**
```typescript
terrainAtFeet = getHeightAt(position.x, position.z);
waterMargin = terrainAtFeet - Water.LEVEL;

if (waterMargin < 0) {  // Below water surface
  isSwimming = true;
  player.update(delta, isMoving, velocity, true);  // Pass swim flag
} else if (waterMargin < waterSlowRange && isMoving) {
  // Near water edge: slow down
  moveSpeedMultiplier = waterSlowFactor;
}
```

**Camera Follow (Third Person):**
```typescript
computeCameraTarget(): THREE.Vector3 {
  // Offset behind player based on yaw
  const cameraOffsetDistance = 3;
  const camX = position.x - sin(yaw) * cameraOffsetDistance;
  const camZ = position.z - cos(yaw) * cameraOffsetDistance;
  return new THREE.Vector3(camX, position.y + cameraHeight, camZ);
}

const targetCamPos = computeCameraTarget();
cameraPos.lerp(targetCamPos, 0.1 * delta);  // Smooth follow
camera.position.copy(cameraPos);

// Apply pitch
camera.rotation.order = 'YXZ';
camera.rotation.y = yaw;
camera.rotation.x = pitch;
```

**`NPCAnimator.ts`** — Procedural animation (no skeletal rig)

```typescript
export class NPCAnimator {
  private group: THREE.Group;
  private leftLeg, rightLeg: THREE.Object3D | null;
  private phase = 0;
  private currentAnim: 'idle' | 'walk' | 'attack' | 'emote' = 'idle';
}
```

**Animations:**
1. **Idle:** Vertical bob via `group.position.y += sin(phase * 2) * 0.08`
2. **Walk:** Leg swing via `leftLeg.rotation.x = sin(phase * 8) * 0.5`
3. **Attack:** Lunge forward via sine curve position offset
4. **Emote:** Scale pulse via lerp to scaled version



## **12. UI SYSTEM**

### **Architecture: DOM-Based Overlays**

**`UIManager.ts`** — Root container managing all UI panels

```typescript
export class UIManager {
  readonly container: HTMLDivElement;
  // Child panels
  readonly interactionPanel: InteractionPanel;
  readonly inventoryPanel: InventoryPanel;
  readonly statusBars: StatusBars;
  readonly combatHUD: CombatHUD;
  readonly combatLog: CombatLog;
  readonly damagePopup: DamagePopup;
  readonly minimap: Minimap;
  readonly questLog: QuestLog;
  readonly questTracker: QuestTracker;
  readonly zoneDisplay: ZoneDisplay;
  readonly chatPanel: ChatPanel;
  bubbleSystem: ChatBubbleSystem | null = null;
}
```

**Root Container Styling:**
```css
#game-ui {
  position: absolute;
  inset: 0;
  pointer-events: none;  /* Children opt-in via pointerEvents: 'auto' */
  z-index: 10;
  font-family: 'Cinzel', serif;  /* Fantasy RPG font */
}
```

**Key Panels:**

**`InteractionPanel.ts`** — NPC dialogue interface

```typescript
export class InteractionPanel {
  element: HTMLDivElement;
  npcId: string = '';
  npcName: string = '';
  userInput: HTMLInputElement;  // Text input for prompts
  onSendMessage: ((prompt: string) => void) | null = null;
}
```

**Layout:**
- NPC name header
- Dialogue history display (scrollable)
- Text input field (full-width)
- "Send" button (or Enter key)
- Auto-focus input when panel shows
- Exit pointer lock for typing

**`CombatHUD.ts`** — WoW-style unit frames

```typescript
export class CombatHUD {
  element: HTMLDivElement;
  
  // Player frame (left)
  playerFrame: HTMLDivElement;
  playerPortrait: HTMLDivElement;
  playerHpFill: HTMLDivElement;
  playerHpText: HTMLSpanElement;
  playerManaFill: HTMLDivElement;
  playerManaText: HTMLSpanElement;
  
  // NPC frame (right)
  npcFrame: HTMLDivElement;
  npcPortrait: HTMLDivElement;
  npcHpFill: HTMLDivElement;
  npcHpText: HTMLSpanElement;
  
  // Combat log (bottom center)
  logEntries: HTMLDivElement;
}
```

**Update Methods:**
```typescript
updatePlayerHP(hp: number, maxHp: number): void {
  const percent = (hp / maxHp) * 100;
  playerHpFill.style.width = percent + '%';
  playerHpText.textContent = `${hp}/${maxHp}`;
  
  // Flash on damage
  playerFrame.classList.add('combat-hp-flash');
  setTimeout(() => playerFrame.classList.remove('combat-hp-flash'), 250);
}

updateNpcHP(hp: number, maxHp: number): void {
  // Same pattern
}
```

**`StatusBars.ts`** — Top-left corner health/mana

```typescript
// Simple progress bars
// HP: Red bar on dark background
// Mana: Blue bar
// Update on PlayerState.onChange
```

**`CombatLog.ts`** — Scrolling text log

```typescript
addEntry(text: string, color?: string): void {
  const entry = document.createElement('div');
  entry.textContent = text;
  entry.style.color = color || '#c5a55a';
  logEntries.appendChild(entry);
  logEntries.scrollTop = logEntries.scrollHeight;  // Auto-scroll
}
```

**`DamagePopup.ts`** — Floating damage numbers at cursor

```typescript
spawn(screenX: number, screenY: number, text: string, color: string, isCrit: boolean): void {
  const popup = document.createElement('div');
  popup.textContent = text;
  popup.style.left = screenX + 'px';
  popup.style.top = screenY + 'px';
  popup.style.color = color;
  popup.style.fontSize = isCrit ? '24px' : '18px';
  popup.style.fontWeight = isCrit ? '700' : '400';
  popup.style.textShadow = '0 0 3px rgba(0,0,0,0.8)';
  
  // Animate upward + fade out (CSS animation)
  popup.style.animation = 'pop-float 1s ease-out forwards';
}
```

**`Minimap.ts`** — Orthographic mini-map

```typescript
// Renders simplified 2D scene view
// Chunk boundaries, NPCs, buildings
// Updates every frame via canvas rendering
```

**`QuestTracker.ts`** — Right-side quest progress

```typescript
update(playerState: PlayerState): void {
  for (const quest of playerState.activeQuests) {
    const questEl = createQuestElement(quest);
    trackContainer.appendChild(questEl);
    
    // Show objectives
    for (const objective of quest.objectives) {
      const objEl = document.createElement('div');
      objEl.textContent = `${objective.description} (${objective.progress}/${objective.target})`;
      questEl.appendChild(objEl);
    }
  }
}
```

**`ChatPanel.ts`** — Bottom-left chat interface

```typescript
// Input field + chat history
// Integrates with WebSocket (onSendMessage callback)
// Shows system messages, player chat, NPC dialogue
```

**`ChatBubbleSystem.ts`** — 3D world text bubbles

```typescript
spawn(text: string, worldPos: THREE.Vector3, options: BubbleOptions): void {
  // Create DOM bubble
  const bubble = document.createElement('div');
  bubble.textContent = text;
  bubble.className = options.style;  // 'player' | 'npc' | 'system'
  
  // Position in screen space (updated each frame)
  const screenPos = worldToScreen(worldPos, camera);
  bubble.style.left = screenPos.x + 'px';
  bubble.style.top = screenPos.y + 'px';
  
  // Follow parent if provided (NPC mesh)
  if (options.parent) {
    this.followingBubbles.push({
      bubble,
      parent: options.parent,
      offset: worldPos.sub(options.parent.position)
    });
  }
  
  // Auto-destroy after 3 seconds
  setTimeout(() => bubble.remove(), 3000);
}
```

**Styling Strategy:**
- **Dark backgrounds:** Overlays use `rgba(26,17,8,0.88)` — dark brown
- **Gold accents:** Text color `#c5a55a` (WoW-like gold)
- **Cinzel font:** Fantasy serif for RPG aesthetic
- **Subtle borders:** `1px solid rgba(197,165,90,0.5)` gold edge



## **13. GAME SYSTEMS**

### **`InteractionSystem.ts`** — NPC Click & Hover Detection

```typescript
export class InteractionSystem {
  private raycaster = new THREE.Raycaster();
  private mouse = new THREE.Vector2();
  public onNPCClick: ((npcId: string, npcName: string) => void) | null = null;
}
```

**Input Modes:**
- **Left-click:** Only when pointer NOT locked (cursor visible)
- **Right-click:** Always works, prevents default context menu
- **Hover:** Only when pointer NOT locked → emissive highlight

**Raycast Algorithm:**
```typescript
private handleClick(e: MouseEvent): void {
  // Convert mouse coords to normalized device coords [-1, 1]
  const rect = domElement.getBoundingClientRect();
  mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  
  // Cast ray from camera through mouse position
  raycaster.setFromCamera(mouse, camera);
  
  // Test intersection with NPC meshes
  const hits = raycaster.intersectObjects(entityManager.getMeshes(), true);
  
  if (hits.length > 0) {
    const data = findNPCData(hits[0].object);
    if (data) onNPCClick(data.npcId, data.npcName);
  }
}

private findNPCData(obj: THREE.Object3D): { npcId, npcName } | null {
  // Walk up parent chain until userData.npcId found
  let current = obj;
  while (current) {
    if (current.userData.npcId) return { npcId: current.userData.npcId, ... };
    current = current.parent;
  }
  return null;
}
```

**Highlight on Hover:**
```typescript
setHighlight(enabled: boolean): void {
  for (const material of npc.materials) {
    if (enabled) {
      material.emissive.setHex(0xffff00);  // Yellow glow
      material.emissiveIntensity = 1.5;
    } else {
      material.emissive.setHex(originalEmissive);
      material.emissiveIntensity = 0;
    }
  }
}
```

### **`ReactionSystem.ts`** — Server Action → Visual Effects

```typescript
export class ReactionSystem {
  handleResponse(response: AgentResponse): void {
    // Parse actions and apply effects
    for (const action of response.actions) {
      switch (action.kind) {
        case 'damage':
          playerState.takeDamage(action.params.amount);
          createFloatingText('−' + action.params.amount, '#ff3333', npcPos);
          spawnParticles('hit', npcPos);
          break;
        case 'heal':
          playerState.heal(action.params.amount);
          createFloatingText('+' + action.params.amount, '#33ff33', npcPos);
          spawnParticles('heal', npcPos);
          break;
        case 'give_item':
          playerState.addItem(action.params.item);
          uiManager.addCombatLog(`Received ${action.params.item}`);
          break;
        case 'emote':
          npc.playEmote(action.params.emote);
          break;
        // ... more action types
      }
    }
  }
}
```

**Effect Presets:**
```typescript
const EFFECT_PRESETS: Record<string, EffectPreset> = {
  fire: { color: '#ff4400', count: 40, speed: 3.5, gravity: -1, duration: 1.8, flash: '#8b2200' },
  explosion: { color: '#ff6600', count: 60, speed: 6, gravity: 3, duration: 1.5 },
  ice: { color: '#66ccff', count: 35, speed: 2, gravity: 1, duration: 2.5 },
  sparkle: { color: '#ffee88', count: 25, speed: 1.5, gravity: -0.5, duration: 2.5 },
  // ...
};
```

### **`CollisionSystem.ts`** — Physics-Based Collision (cannon-es)

```typescript
import * as CANNON from 'cannon-es';

export class CollisionSystem {
  private world: CANNON.World;
  private playerBody: CANNON.Body;
  private playerShape: CANNON.Box;  // 0.4×1.0×0.4
  private statics: PhysicsEntry[] = [];  // Static collidables
  private dynamicBodies: Map<THREE.Object3D, CANNON.Body> = new Map();
}
```

**Architecture:** Not a full physics engine — purely **spatial overlap queries**.

```typescript
constructor() {
  this.world = new CANNON.World();
  this.world.gravity.set(0, 0, 0);  // NO gravity simulation
  this.world.broadphase = new CANNON.SAPBroadphase(this.world);  // Sweep-and-prune
  
  // Player kinematic body (we move it manually)
  this.playerShape = new CANNON.Box(new CANNON.Vec3(0.4, 1.0, 0.4));
  this.playerBody = new CANNON.Body({
    mass: 0,  // Kinematic
    type: CANNON.BODY_TYPES.KINEMATIC,
    shape: this.playerShape,
    collisionFilterGroup: 1,
    collisionFilterMask: 2,
  });
  this.world.addBody(this.playerBody);
}
```

**Collidable Registration:**
```typescript
addCollidable(obj: THREE.Object3D): void {
  const body = createStaticBody(obj);  // AABB from Three.js bounding box
  if (body) {
    this.world.addBody(body);
    this.statics.push({ obj, body });
  }
}
```

**Movement Resolution:**
```typescript
resolveMovement(
  currentPos: THREE.Vector3,
  desiredPos: THREE.Vector3,
): THREE.Vector3 {
  // Position player body at desired location
  this.playerBody.position.set(desiredPos.x, desiredPos.y + PLAYER_HY, desiredPos.z);
  this.playerBody.updateAABB();
  
  // Check for contacts with all bodies
  this.resolveOverlaps();
  
  // Read corrected position
  return new THREE.Vector3(
    this.playerBody.position.x,
    this.playerBody.position.y - PLAYER_HY,
    this.playerBody.position.z
  );
}
```

**Overlap Resolution:**
- Generate contacts via cannon-es contact generation
- For each contact, push player along contact normal
- Repeat until no overlaps remain

### **`WorldGenerator.ts`** — Chunk-Based Procedural Content

```typescript
export class WorldGenerator {
  private generatedChunks: Set<string> = new Set();
  private chunkObjects: Map<string, THREE.Object3D[]> = new Map();
  private chunkNPCs: Map<string, string[]> = new Map();
}
```

**Chunk Loading Callback (from Terrain):**
```typescript
terrain.onChunkLoaded = (cx, cz, wx, wz) => {
  const chunkKey = `${cx},${cz}`;
  if (generatedChunks.has(chunkKey)) return;
  
  // Deterministic placement
  const chunkHash = hash(cx, cz);
  const biomeDominant = getDominantBiome(wx, wz);
  
  // Spawn trees (medium instanced + massive groups)
  // Spawn caves (probabilistic, chunk-wise)
  // Spawn town (if hash % threshold)
  // Spawn NPCs (biome-specific)
  
  generatedChunks.add(chunkKey);
  chunkObjects.set(chunkKey, [meshes, ...]);
  chunkNPCs.set(chunkKey, [npcIds, ...]);
}
```

**Deterministic Spawning:**
```typescript
function chunkHash(cx: number, cz: number): number {
  let h = (cx * 374761393 + cz * 668265263) ^ 0x55555555;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = ((h >> 16) ^ h) * 0x45d9f3b;
  h = (h >> 16) ^ h;
  return Math.abs(h);
}

function shouldSpawnCave(cx, cz): boolean {
  return (chunkHash(cx, cz) % 25) === 0;  // 4% of chunks
}

function shouldSpawnTown(cx, cz): boolean {
  return (chunkHash(cx, cz) % 100) === 0;  // 1% of chunks
}
```

**NPC Spawning:**
- Friendly NPCs: 40-60% probability per chunk
- Hostile NPCs: 20-30% probability
- Sentinels (mini-bosses): 5-10% probability
- Names and colors chosen from biome-specific pools

**Cave Generation:**
- `createCaveEntrance(scene, x, z)` — adds cave mouth mesh + dungeon entrance marker
- Linked to DungeonSystem for interior loading

**Town Generation:**
- `createTown(scene, x, z, biome)` — spawns houses, NPCs, marketplace aesthetics

### **`ZoneTracker.ts`** — Zone Boundary Detection

```typescript
export const ZONES: ZoneData[] = [
  { name: "Blasted Suarezlands", minX: -80, maxX: 80, minZ: -155, maxZ: -90 },
  { name: "Fort Malaka", minX: -150, maxX: 150, minZ: -400, maxZ: -80 },
  { name: "Elders' Village", minX: -120, maxX: 120, minZ: -80, maxZ: 120 },
  // ... 11 zones total
];

export class ZoneTracker {
  private currentZone = "";
  onZoneChange?: (zoneName: string, description: string) => void;
  
  update(playerX: number, playerZ: number): void {
    const zone = this.getZone(playerX, playerZ);
    if (zone !== this.currentZone) {
      this.currentZone = zone;
      this.onZoneChange?.(zone, this.getDescription(zone));
    }
  }
}
```

**Zone Priority:** Specific zones checked first (Elders' Village before Teldrassil Wilds).

### **`DungeonSystem.ts`** — Dungeon Instancing

```typescript
export class DungeonSystem {
  private activeDungeon: DungeonObjects | null = null;
  private savedPlayerPosition: THREE.Vector3 | null = null;
  private savedOverworldCollidables: PhysicsEntry[] = [];
  onEnterDungeon?: (dungeonId: string, name: string) => void;
  onExitDungeon?: () => void;
}
```

**Dungeon Entry:**
1. **Proximity check:** Player near registered entrance
2. **UI prompt:** "Press E to enter"
3. **On enter:**
   - Save player position + overworld physics bodies
   - Load dungeon interior (from `DungeonInterior.ts`)
   - Swap collision bodies (overworld → dungeon walls/objects)
   - Hide overworld objects (except player)
   - Teleport player to dungeon center (0, 0, 5)
   - Force zone to "Dungeon: Name"

**Dungeon Exit:**
1. Player reaches exit trigger or dies
2. Unload dungeon interior
3. Restore player position
4. Restore overworld collision bodies
5. Restore overworld object visibility
6. Revert zone to overworld zone

**Chest Interaction:**
```typescript
if (nearestChest && playerPressedE) {
  if (!chestOpened) {
    chestOpened = true;
    const loot = dungeon.lootItem;
    playerState.addItem(loot);
    createFloatingText('Found ' + loot, '#ffaa00', chestPos);
  }
}
```



## **14. NETWORKING**

### **WebSocketClient**

```typescript
export class WebSocketClient {
  private url: string;
  private ws: WebSocket | null = null;
  private reconnectDelay = 1000;
  private readonly maxReconnectDelay = 30_000;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  onMessage: ((data: any) => void) | null = null;
  onConnectionChange: ((connected: boolean) => void) | null = null;
}
```

**Connection Lifecycle:**

**Connect:**
```typescript
private connect(): void {
  this.ws = new WebSocket(this.url);
  
  this.ws.onopen = () => {
    this.reconnectDelay = 1000;  // Reset backoff
    this.startHeartbeat();
    this.onConnectionChange?.(true);
  };
  
  this.ws.onmessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data as string);
      this.onMessage?.(data);
    } catch {
      // Ignore non-JSON (e.g., pong frames)
    }
  };
  
  this.ws.onclose = () => {
    this.stopHeartbeat();
    this.onConnectionChange?.(false);
    if (this.shouldReconnect) {
      setTimeout(() => this.connect(), this.reconnectDelay);
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    }
  };
}
```

**Auto-Reconnect:** Exponential backoff (1s → 2s → 4s → ... → 30s max)

**Heartbeat (every 30 seconds):**
```typescript
private startHeartbeat(): void {
  this.heartbeatTimer = setInterval(() => {
    if (this.isConnected) {
      this.ws!.send(JSON.stringify({ type: 'ping' }));
    }
  }, 30_000);
}
```

**Message Sending:**
```typescript
send(msg: object): void {
  if (this.isConnected) {
    this.ws!.send(JSON.stringify(msg));
  }
  // Silently drops if not connected
}
```

### **Message Protocol**

**Client → Server:**

| Message Type | Fields | Purpose |
|---|---|---|
| `join` | username, race, faction | Initial login |
| `player_move` | position [x,y,z], yaw | Position broadcast |
| `interaction` | npcId, prompt, playerState | Talk to NPC |
| `chat_message` | text | Chat broadcast |
| `use_item` | item, inventory | Item usage |
| `equip_item` | item, slot, equipped | Equipment change |
| `ping` | — | Heartbeat |

**Server → Client:**

| Message Type | Fields | Purpose |
|---|---|---|
| `join_ok` | playerId, players[], npcs[] | Login success |
| `join_error` | message | Login failed |
| `world_update` | players[] | Position sync |
| `player_joined` | player | New player entered |
| `player_left` | playerId | Player left |
| `agent_response` | npcId, dialogue, actions[], playerStateUpdate?, npcStateUpdate? | NPC response |
| `chat_broadcast` | sender, text, position | Chat message |
| `npc_dialogue` | npcId, npcName, dialogue, position | NPC speech |
| `pong` | — | Heartbeat response |

**Agent Response Actions:**

```typescript
export interface Action {
  kind: 'damage' | 'heal' | 'give_item' | 'take_item' | 'emote' | 'move_npc' | 'spawn_effect' | 'change_weather' | 'start_quest' | 'complete_quest' | 'advance_objective';
  params: Record<string, any>;
}
```



## **15. STATE MANAGEMENT**

### **PlayerState** — Singleton player data

```typescript
export class PlayerState {
  private static _instance: PlayerState | null = null;
  
  playerId: string = '';
  race: string = 'human';
  faction: string = 'alliance';
  
  hp: number = 100;
  maxHp: number = 100;
  mana: number = 50;
  maxMana: number = 50;
  level: number = 1;
  inventory: string[] = [];
  position: [number, number, number] = [0, 0, 0];
  isDead: boolean = false;
  
  equipped: EquippedItems = { weapon: null, shield: null, trinket: null };
  activeQuests: ActiveQuest[] = [];
  completedQuests: string[] = [];
  
  onChange: ((state: PlayerState) => void) | null = null;
  onQuestChange?: () => void;
  onDeath: ((killerName?: string) => void) | null = null;
  
  static getInstance(): PlayerState { /* singleton */ }
  
  merge(update: PlayerStatePatch): void {
    // Server sync
  }
  
  takeDamage(amount: number): void { /* ... */ }
  heal(amount: number): void { /* ... */ }
  addItem(item: string): void { /* ... */ }
  equip(item: string): EquipSlot | null { /* ... */ }
}
```

**Mutations:**
- `merge()` — Called on server update
- `takeDamage()`, `heal()` — Combat
- `addItem()`, `removeItem()` — Inventory
- `equip()` — Equipment
- `respawn()` — On death screen

**Callbacks:**
- `onChange` — UI reactivity (status bars, inventory)
- `onQuestChange` — Quest panel update
- `onDeath` — Death screen + audio

### **NPCStateStore** — Central NPC state map

```typescript
export class NPCStateStore {
  readonly states: Map<string, NPCStateData> = new Map();
  onChange: ((npcId: string, state: NPCStateData) => void) | null = null;
  
  getState(npcId: string): NPCStateData | undefined { /* ... */ }
  updateState(npcId: string, partial: Partial<NPCStateData>): void { /* ... */ }
}
```

**NPC State:**
```typescript
export interface NPCStateData {
  hp: number;
  maxHp: number;
  position: [number, number, number];
  mood: string;  // 'happy', 'angry', 'neutral', etc.
  relationship_score: number;
}
```

**Usage:**
- Updated by `ReactionSystem` on server action
- Watched by Nameplate to display health bar + mood
- Watched by EntityManager to update NPC models

### **WorldState** — Aggregator

```typescript
export class WorldState {
  readonly playerState: PlayerState;
  readonly npcStateStore: NPCStateStore;
  
  private _weather = 'clear';
  timeOfDay = 'day';
  onWeatherChange: ((weather: string) => void) | null = null;
}
```



## **KEY ARCHITECTURAL PATTERNS**

### **1. Component-Based Entity System**
- NPCs are Groups with:
  - Body meshes (cylinder, sphere, box)
  - Animator (procedural, phase-based)
  - Nameplate (DOM sprite, 3D-positioned)
  - ActionIcon (thinking, attack, etc.)

### **2. Event-Driven UI**
- PlayerState.onChange → StatusBars.update()
- InteractionSystem.onNPCClick → UIManager.showInteractionPanel()
- ReactionSystem actions → UIManager.spawnDamagePopup()

### **3. Deterministic Procedural Generation**
- Terrain: Hash-based noise (same coords = same height)
- WorldGenerator: Chunk hash determines cave/town spawning
- Vegetation: Seeded random placement per chunk

### **4. Distance-Based Culling**
- Terrain: LOD by chunk distance (32/16/8 segments)
- Entities: Visibility at 350 units, full update at 200 units
- Effects: Wisps/particles culled beyond viewport

### **5. Shared Materials**
- One MeshStandardMaterial reused across all terrain chunks
- Custom shader adds per-vertex emissive glow
- ~90% memory savings vs. per-chunk materials

### **6. DOM Overlay for UI**
- Separate from Three.js canvas
- pointer-events: none on root, opt-in per panel
- CSS animations for polish (fade, slide)
- ChatBubbles positioned in world space via `WorldToScreen` calculation

### **7. Collision as Spatial Queries**
- cannon-es used for AABB overlap detection, not physics
- Player manually positioned each frame
- Contacts generated and player pushed along normals



## **PERFORMANCE OPTIMIZATIONS SUMMARY**

| System | Technique | Impact |
|--------|-----------|--------|
| **Terrain** | Chunk LOD, shared material | ~65% triangle reduction, ~90% material memory |
| **Vegetation** | Instanced meshes (80 trees, 100+ mushrooms) | ~40× rendering calls → 1-2 |
| **Water** | Half-resolution bloom, skip reflection above Y=15 | ~20% post-processing cost |
| **Entities** | Distance culling (200/350 unit radii) | ~80% NPC updates when far away |
| **Lighting** | 1 shadow-casting light, no shadow spotlights | ~60% shadow map updates |
| **Camera** | Smooth lerp (0.1 * delta), FOV 60° | Reduced overdraw, smooth motion |
| **Effects** | Wisps = sprites (no geometry), particles capped at 200 | ~10fps overhead vs. mesh particles |



## **DATA STRUCTURES**

### **Chunk Representation**
```typescript
interface ChunkData {
  mesh: THREE.Mesh;
  cx: number;  // Chunk X coordinate
  cz: number;  // Chunk Z coordinate
}
```

### **Building Footprint**
```typescript
interface Footprint {
  x: number;
  z: number;
  radius: number;
}
```

### **NPC Configuration**
```typescript
interface NPCConfig {
  id: string;
  name: string;
  position: THREE.Vector3;
  color?: number;
}
```

### **Physics Entry**
```typescript
interface PhysicsEntry {
  obj: THREE.Object3D;
  body: CANNON.Body;
}
```

### **Quest Definition**
```typescript
interface ActiveQuest {
  id: string;
  name: string;
  objectives: Array<{
    id: string;
    description: string;
    progress: number;
    target: number;
  }>;
}
```



## **CONSTANTS REFERENCE**

| Constant | Value | Purpose |
|----------|-------|---------|
| CHUNK_SIZE | 64 | Terrain chunk edge length (world units) |
| CHUNK_SEGMENTS | 32 | Mesh vertex subdivisions (nearby chunks) |
| VIEW_RADIUS | 3 | Visible chunks in each direction (7×7=49) |
| UNLOAD_RADIUS | 5 | Buffer for unloading (VIEW_RADIUS + 2) |
| UPDATE_RADIUS | 200 | Full NPC update distance |
| VISIBLE_RADIUS | 350 | NPC visibility distance |
| FOV | 60° | Camera field of view |
| CAMERA_HEIGHT | 4 | Eye height above feet |
| WALK_SPEED | 8 | Units/second |
| RUN_SPEED | 16 | Units/second |
| SWIM_SPEED | 5 | Units/second |
| JUMP_VELOCITY | 10 | Initial upward velocity |
| GRAVITY | -20 | Acceleration (downward) |
| WATER_LEVEL | -1.0 | World Y coordinate of water surface |
| BLOOM_STRENGTH | 0.35 | Post-processing bloom intensity |
| BLOOM_THRESHOLD | 0.8 | Emissive threshold for bloom |
| FOG_DENSITY | 0.004 | Exponential fog density |
| SHADOW_MAP_SIZE | 2048 | Shadow map resolution |
| BIOME_START | 120 | Distance where biomes begin |
| TRANSITION | 100 | Biome transition zone width |



This architecture is production-ready for a browser-based RPG with:
- **14,383 lines** of client code
- **5 biomes** with procedural blending
- **Infinite terrain** with dynamic chunks
- **Complex buildings** (40+ structures)
- **Networking** with auto-reconnect
- **Rich UI** with quest tracking, combat HUD, chat
- **Collision** via cannon-es spatial queries
- **Performance optimizations** throughout

The system is **data-driven, event-oriented, and highly modular** — perfect for porting to a commercial game engine like Unreal or Unity.
---

# PART 2: SERVER ARCHITECTURE



## **1. FASTAPI APP & WEBSOCKET** (`main.py`)

### **Core Setup**
- **Framework**: FastAPI with async WebSocket support
- **Lifespan Management**: Uses `@asynccontextmanager` for initialization/shutdown
- **Initialization Flow**:
  1. Startup: Creates LLM provider → WorldState → AgentRegistry
  2. Registers agents for all 8 predefined NPCs
  3. Binds handler module to registry and manager
  4. Logs NPC count and LLM provider type
  5. Shutdown: Clean log message

### **HTTP Endpoints**
- **GET `/health`**: Returns `{"status": "ok", "llm_provider": "claude|openai"}`

### **WebSocket Endpoint** (`/ws`)
**Connection Lifecycle**:
1. **Accept**: `await manager.connect(websocket)`
2. **Message Loop**: Indefinite JSON message receive → handler processing → response send (if not None)
3. **Disconnect**:
   - Retrieves player_id from disconnect
   - Removes player from world state
   - Cleans up equipment dictionary
   - Broadcasts `player_left` message to all clients

**Key Pattern**: All message dispatch is single-threaded per connection, but world state updates are async-locked.

**Bug Handling**:
- Bug 16: Equipment cleanup on disconnect via `cleanup_player_equipment(player_id)`



## **2. WEBSOCKET HANDLER** (`ws/handler.py`) — **1154 Lines**

### **Message Type Routing** (Main dispatcher: `handle_message()`)
Routes based on `type` field:
- `join` → `_handle_join()`
- `ping` → `{"type": "pong"}` (no auth required)
- `interaction` → `_handle_interaction()` (auth required)
- `player_move` → `_handle_player_move()`
- `explore_area` → `_handle_explore_area()`
- `use_item` → `_handle_use_item()`
- `equip_item` → `_handle_equip_item()`
- `chat`/`chat_message` → `_handle_chat_message()`
- `dungeon_enter` → `_handle_dungeon_enter()`
- `dungeon_exit` → `_handle_dungeon_exit()`
- `quest_update` → `_handle_quest_update()`

**Registration Guard**: All non-ping, non-join messages require `manager.get_player_id(websocket)` to return non-None. If not registered, message is silently dropped.



### **Attack Quality Scoring System**

**Detection**: Uses keyword set matching on prompt text
```python
_ATTACK_KEYWORDS = {"attack", "hit", "strike", "slash", "stab", "punch", "kick", ...}
_WEAPON_KEYWORDS = {"sword", "blade", "axe", "dagger", ...}
_STYLE_KEYWORDS = {"humiliate", "taunt", "mock", "feint", "dodge", ...}
_MAGIC_KEYWORDS = {"fireball", "lightning", "ice", "frost", ...}
```

**Quality Scoring Algorithm** (`_score_attack_quality()`):
- **Base**: 1.0 multiplier
- **Equipped Weapon**: +0.6 base, +0.4 if player mentions weapon name, +0.2 for shield, +0.15 for trinket
- **Length Bonus**: +0.3 for 8+ words, +0.3 for 15+, +0.2 for 25+
- **Weapon Mentions**: +0.3 for generic weapon keywords
- **Inventory Items**: +0.4 if player mentions their own inventory item
- **Style Keywords**: +0.25 × count (capped at +0.75)
- **Humiliation/Psychological**: +0.5 for {"humiliate", "taunt", "mock", "insult"}
- **Magic Damage**: +0.3 base, sets `damage_type` and `effect_type`:
  - Fire: `fireball|flame|inferno|fire|burn|meteor` → "fire" + "fire" effect
  - Ice: `ice|frost|blizzard|freeze` → "ice" + "ice" effect
  - Lightning: `lightning|thunder|bolt` → "lightning" + "lightning" effect
  - Holy: `holy|light` → "holy" + "holy_light" effect
  - Dark: `shadow|dark` → "dark" + "smoke" effect
  - Else: "arcane" + "sparkle" effect
- **Final**: Capped at 3.5x multiplier

**Damage Calculation**:
```
base_damage = 15 + (player.level * 2)
final_damage = int(base_damage * quality_multiplier)
```



### **Key Handlers in Detail**

#### **_handle_join()**
- **Validation**: Username 1-20 alphanumeric chars, check uniqueness, validate race/faction
- **Registration**: Calls `manager.register(websocket, username)`
- **Initial Position**: Accepts `position` field from client (defaults to [0,0,0])
- **Response**:
  - `type: "join_ok"`
  - `playerId: username`
  - `players: []` — current connected players (excluding joiner)
  - `npcs: []` — all NPC dicts with their data
- **Broadcast**: Sends `player_joined` to all others (excludes joining player)
- **Bug 3**: Accepts client position to prevent [0,0,0] broadcast

#### **_handle_interaction()**
**Complex orchestration** for NPC interactions:
1. **Auth Check**: Verify player is registered
2. **Dead Player Check**: Return error if player.hp <= 0
3. **Player State Sync**: Whitelist update fields: `position`, `hp`, `inventory` (Bug 6)
4. **Attack Pre-Processing**:
   - Detect attack keywords in prompt
   - Score attack quality
   - Calculate damage (base 15 + level×2 × quality multiplier)
   - Apply damage action immediately to NPC via `world_state.apply_actions()`
   - Add visual effects if quality >= 1.5 or 2.0
   - **Bug 35**: Skip if NPC already dead (hp <= 0)
5. **Agent Invocation**: Call `registry.invoke()` with:
   - `npc_id`, `player_id`, `prompt`, `player_state` dict
   - Timeout: 30 seconds
   - Thread ID: `{npc_id}_{player_id}`
6. **Action Merging**: Player damage actions + agent actions
7. **NPC Death Check**: If NPC hp <= 0, add death effect
8. **Inventory Sync** (Bug 19): Parse `offer_item` actions, add to server-side inventory
9. **NPC Position Sync** (Bug 20): Parse `move_npc` actions, update NPC position
10. **Broadcasting**:
    - Player's prompt → nearby players within 100m
    - NPC's response → nearby players within 100m
    - NPC's actions → nearby players within 200m (combat sync)
11. **Response**: Returns agent result + actions, NO playerStateUpdate (client uses actions as source of truth)
    - **Bug 11**: Merge agent's npcStateUpdate with server HP

#### **_handle_chat_message()**
- **Proximity**: Chat broadcasts to 200m radius (Bug 9)
- **Storage**: Stored in world_state.chat_history (max 50 entries)
- **NPC Reactions**: Fire-and-forget tasks for nearby NPCs (50m radius) to react
  - 40% chance per NPC to react
  - Uses lightweight LLM call (not full agent pipeline)
  - Returns 1-sentence, 15-word-max reaction
  - Broadcasts NPC dialogue to 100m radius

#### **_handle_player_move()**
- **Auth**: Uses server-side WebSocket registration as authoritative player ID
- **Position Clamping** (Bug 20): ±5000 unit bounds
- **Nearby Discovery**: Sends `world_update` with nearby players to moving player
- **Broadcasting**: Other players within 200m see the moving player
- **Bug 11**: Sends world_update back to moving player for discovery

#### **_handle_explore_area()**
- **Dynamic NPC Creation**: Creates NPCs from client-provided list
- **Personality Generation** (`_get_generated_personality()`):
  - **Hostile**: Aggro, damage-range-dependent behavior (8-25 damage), emote('threaten'), flee at 30% HP
  - **Neutral**: Quest-giver, serious tone, melee defense
  - **Friendly**: Wanders, offers items, non-hostile, uses emote('wave')
- **Agent Registration**: Calls `registry.register_dynamic_npc()`

#### **_handle_use_item()**
- **Inventory Sync**: Accepts client inventory to update server copy
- **Effect System**: Pattern matching on item name (lowercase):
  - "health"/"heal"/"potion" → +30 HP
  - "mana"/"elixir" → +25 mana
  - "sword"/"blade"/"axe"/"dagger" → +1 level (next attack buff)
  - "shield"/"armor" → +20 HP as shield effect
  - "scroll" → +30 mana, +1 level
  - "charm"/"amulet"/"rune" → +15 HP
  - "brownie"/"tea"/"herb" → Full restore (all HP + mana)
  - Else → +10 HP

#### **_handle_equip_item()**
- **Storage**: Maintains `_player_equipment[player_id]` dict with full equipped state
- **Fields**: `weapon`, `shield`, `trinket`, `armor`, etc.
- **Used For**: Attack quality scoring (weapon/shield/trinket bonuses)

#### **_handle_dungeon_enter() / _handle_dungeon_exit()**
- **Enter**: Advance "enter_dungeon" quest objectives matching dungeon_id
- **Exit**: Add loot to inventory, advance "collect_item" objectives, track kill count
- **Return**: Quest actions, updated player state

#### **_handle_quest_update()**
- **Generic Advancement**: Handle "kill_enemies", "enter_dungeon", "collect_item", etc.
- **Kill Tracking**: Increment `player.kill_count`, check against objective threshold
- **Multi-Objective**: Support multiple objectives per quest



### **Module-Level State & Guards**
```python
_registry: AgentRegistry | None = None
_world_state: WorldState | None = None
_manager: ConnectionManager | None = None

_VALID_RACES = {"human", "night_elf", "orc", "undead"}
_VALID_FACTIONS = {"alliance", "horde"}
_ALLOWED_PLAYER_FIELDS = {"position", "hp", "inventory"}  # Security whitelist
_player_equipment: dict[str, dict[str, str | None]] = {}  # Equipment state
```



## **3. CONNECTION MANAGER** (`ws/connection_manager.py`)

### **Data Structures**
```python
active_connections: dict[str, WebSocket]  # player_id → WebSocket
_ws_to_player: dict[int, str]             # id(websocket) → player_id
```

### **Distance Calculation** (XZ only)
```python
def _distance(a, b):
    dx = a[0] - b[0]
    dz = a[2] - b[2] if len(a) > 2 else 0.0
    return sqrt(dx² + dz²)
```
Y-axis ignored so terrain height doesn't affect proximity.

### **Key Methods**
- `connect(websocket)`: Accept WebSocket
- `register(websocket, player_id)`: Associate WS with player_id
- `disconnect(websocket)`: Cleanup and return player_id
- `get_player_id(websocket)`: Lookup player by WS
- `is_username_taken(username)`: Check duplicate
- `send_to(player_id, data)`: Unicast, removes on error
- `broadcast(data, exclude)`: Multicast, removes failed connections
- `broadcast_nearby(data, origin, radius, world_state, exclude)`: Proximity broadcast (XZ distance)



## **4. MESSAGE PROTOCOL** (`ws/protocol.py`)

### **Client → Server**
```python
class PlayerInteraction(BaseModel):
    type: str = "interaction"
    npcId: str
    prompt: str
    playerId: str = "default"
    playerState: dict = {}

class PlayerMove(BaseModel):
    type: str = "player_move"
    playerId: str = "default"
    position: list[float]

class DungeonEnter(BaseModel):
    type: str = "dungeon_enter"
    dungeonId: str
    playerId: str = "default"

class DungeonExit(BaseModel):
    type: str = "dungeon_exit"
    dungeonId: str
    playerId: str = "default"
    loot: list[str] = []

class QuestUpdate(BaseModel):
    type: str = "quest_update"
    questId: str
    objectiveId: str
    playerId: str = "default"
```

### **Server → Client**
```python
class Action(BaseModel):
    kind: str
    params: dict = {}

class AgentResponse(BaseModel):
    type: str = "agent_response"
    npcId: str
    dialogue: str
    actions: list[Action] = []
    playerStateUpdate: dict | None = None
    npcStateUpdate: dict | None = None
```

**Action Kinds**:
- `damage`: {target, amount, damageType}
- `heal`: {target, amount}
- `give_item`: {item}
- `take_item`: {item}
- `offer_item`: {item, price}
- `start_quest`: {questId, quest}
- `advance_objective`: {questId, objectiveId, description}
- `complete_quest`: {questId, reward}
- `move_npc`: {position: [x, y, z]}
- `emote`: {animation}
- `spawn_effect`: {effectType}
- `change_weather`: {weather}
- `damage_npc`: {npc_id, amount}
- `update_npc_mood`: {npc_id, mood}



## **5. LANGGRAPH AGENT SYSTEM** (`agents/npc_agent.py`)

### **StateGraph Architecture**
```
START → reason → [act ↔ reason loop] → respond → reflect → [summarize?] → END
```

### **State Transitions**
- **reason → act/respond**: Conditional on whether last AI message has `tool_calls`
- **act → reason**: Loop for multiple tool invocations (max depends on LLM, typically 2-3)
- **respond → reflect**: Always flows to reflection
- **reflect → summarize/end**: Conditional on conversation message count
  - Triggers if `human_count >= 10` AND `human_count % 3 == 0`

### **Compilation Details**
```python
def create_npc_agent(npc_id, npc_config, llm, tools, shared_pending_actions, world_state):
    checkpointer = MemorySaver()
    graph = StateGraph(NPCAgentState)
    graph.add_node("reason", make_reason_node(llm, tools))
    graph.add_node("act", make_act_node(tools, shared_pending_actions))
    graph.add_node("respond", respond_node)
    graph.add_node("reflect", reflect_node)
    graph.add_node("summarize", make_summarize_node(llm))
    # Add edges as described above
    return graph.compile(checkpointer=checkpointer)
```

**Checkpointing**: Uses MemorySaver for in-memory persistence. Thread ID: `{npc_id}_{player_id}`



## **6. AGENT STATE** (`agents/agent_state.py`)

### **NPCAgentState TypedDict**
```python
messages: Annotated[list, add_messages]     # Conversation history with message reduction
npc_id: str
npc_name: str
npc_personality: str
player_state: dict                          # {hp, max_hp, mana, level, inventory, position, ...}
world_context: dict                         # {zone, time_of_day, weather, nearby_entities, recent_chat, recent_events}
pending_actions: list[dict]                 # Actions to execute (accumulated across graph)
response_text: str                          # Final dialogue (set by respond node)
conversation_summary: str                   # 2-3 sentence rolling summary (updated by summarize node)
mood: str                                   # "neutral", "happy", "angry", "sad", "fearful", "annoyed", "pleased"
relationship_score: int                     # Range: -100 (enemy) to +100 (trusted ally)
personality_notes: str                      # Evolving player-specific observations (max 300 chars)
```



## **7. AGENT REGISTRY** (`agents/registry.py`)

### **Singleton Pattern + Per-NPC Agents**
```python
class AgentRegistry:
    def __init__(self, llm: BaseChatModel, world_state: WorldState):
        self._llm = llm
        self._world_state = world_state
        self._agents: dict[str, CompiledGraph] = {}  # npc_id → compiled agent
        self._shared_state: dict[str, dict] = {}     # npc_id → {pending_actions, world_snapshot}
        self._build_agents()
```

### **Agent Creation (_build_agents)**
For each NPC in world_state.npcs:
1. Create per-NPC containers:
   - `pending_actions: list` — mutable list for tool closures
   - `world_snapshot: dict` — mutable dict for tool closures
2. Bind tools to these containers via `get_all_tools(pending_actions, world_snapshot)`
3. Create compiled graph via `create_npc_agent()`
4. Store in `self._agents[npc_id]` and `self._shared_state[npc_id]`

### **Dynamic NPC Registration** (register_dynamic_npc)
- Called during `explore_area` for client-provided NPCs
- Creates agent on-the-fly using same pattern as startup

### **World Snapshot Population** (_populate_world_snapshot)
Before agent invocation:
```python
snapshot.clear()
snapshot["player"] = player.to_dict()
snapshot["self_npc_id"] = npc_id
snapshot["self_position"] = list(npc.position)
snapshot["npcs"] = {npc_id: {name, hp, position, mood}, ...}  # All NPCs as dicts
```

### **Invocation** (async invoke)
```python
async def invoke(npc_id, player_id, prompt, player_state):
    input_state = {
        "messages": [HumanMessage(content=prompt)],
        "npc_id": npc_id,
        "npc_name": npc_config["name"],
        "npc_personality": npc_config["personality"],
        "player_state": player_state,
        "world_context": world_context,
        "pending_actions": [],
        "response_text": "",
        "conversation_summary": "",    # Loaded from checkpoint
        "mood": "neutral",              # Loaded from checkpoint
        "relationship_score": 0,        # Loaded from checkpoint
        "personality_notes": "",        # Loaded from checkpoint
    }
    config = {"configurable": {"thread_id": f"{npc_id}_{player_id}"}}
    result = await agent.ainvoke(input_state, config=config)
    
    # Apply pending actions to world state
    if result["pending_actions"]:
        await world_state.apply_actions(result["pending_actions"])
    
    return {
        "dialogue": result.get("response_text", "..."),
        "actions": pending,
        "playerStateUpdate": player.to_dict(),
        "npcStateUpdate": {hp, maxHp, mood, relationship_score},
    }
```



## **8. REASONING NODE** (`agents/nodes/reason.py`)

### **System Prompt Construction** (_build_system_prompt)
Assembles comprehensive context:

```
You are {npc_name}, an NPC in the world of Promptcraft.

## Your Personality
{npc_personality}

## Current World Context
- Zone: {zone}
- Time of day: {time_of_day}
- Weather: {weather}
- Nearby entities: {json.dumps(nearby_entities)}
- Recent events: {'; '.join(recent_events[-5:])}

## Player State
- HP: {hp}/{max_hp}
- Mana: {mana}/{max_mana}
- Level: {level}
- Inventory: {json.dumps(inventory)}

## Your Memory of This Player
From past conversations you recall: {conversation_summary}

## Your Current Mood: {mood}
Let this mood subtly influence your tone and word choice.

## Your Relationship with This Player ({score}): {tier}
Tier mapping:
  ≤ -50: ENEMY
  -50 to -10: DISTRUSTFUL
  -10 to +10: STRANGER
  +10 to +50: FRIEND
  > +50: TRUSTED ALLY

## Personal Notes
{personality_notes}

## Instructions
Respond to the player's prompt. Use tools to take actions in the world.
Be creative and stay in character. Keep your responses concise but flavourful.

## Recent World Chat (you can reference or react to these)
[player]: text
...

## World Lore (use to enrich your responses)
[topic]: content
...
```

### **RAG Integration**
- Retrieves 3 relevant lore entries based on player prompt
- Uses keyword matching (see RAG section)
- Appended to system prompt for contextual knowledge

### **LLM Invocation**
```python
async def reason_node(state: NPCAgentState):
    llm_with_tools = llm.bind_tools(tools) if tools else llm
    messages = [SystemMessage(content=system_prompt), *state["messages"]]
    ai_message = await llm_with_tools.ainvoke(messages)
    return {"messages": [ai_message]}
```



## **9. ACTION NODE** (`agents/nodes/act.py`)

### **Tool Call Processing**
```python
async def act_node(state: NPCAgentState):
    last_message = state["messages"][-1]
    tool_calls = getattr(last_message, "tool_calls", [])  # LangChain format
    
    tool_map = {t.name: t for t in tools}
    pending_actions = list(state.get("pending_actions", []))
    shared_pending_actions.clear()
    
    for call in tool_calls:
        tool_name = call["name"]
        tool_args = call["args"]
        
        if tool_name in tool_map:
            try:
                result = await tool_map[tool_name].ainvoke(tool_args)
                result_str = str(result)
            except Exception as exc:
                result_str = f"Tool error: {exc}"
        else:
            result_str = f"Unknown tool: {tool_name}"
        
        tool_messages.append(ToolMessage(content=result_str, tool_call_id=call["id"]))
    
    # Harvest actions from shared list (tools append here via closure)
    pending_actions.extend(shared_pending_actions)
    shared_pending_actions.clear()
    
    return {"messages": tool_messages, "pending_actions": pending_actions}
```

### **Tool Loop Mechanism**
- Tools are closed over `pending_actions` and `world_snapshot` dicts
- When tool is called, it appends to the mutable list
- Act node harvests accumulated actions after all tool calls complete
- Graph loops back to reason if new tool calls needed (up to ~3 iterations typical)



## **10. RESPONSE NODE** (`agents/nodes/respond.py`)

### **Simple Extraction**
```python
async def respond_node(state: NPCAgentState):
    last_message = state["messages"][-1]
    dialogue = getattr(last_message, "content", "")
    if not dialogue:
        dialogue = "..."
    return {
        "response_text": dialogue,
        "pending_actions": state.get("pending_actions", []),
    }
```

Sets final response text from the last message's content field.



## **11. REFLECT NODE** (`agents/nodes/reflect.py`)

### **Heuristic Analysis (No LLM)**
Analyzes conversation for mood, relationship, and personality evolution.

#### **Mood Analysis** (_analyze_mood)
Keyword sets:
```python
_HOSTILE_WORDS = {"attack", "kill", "destroy", "fight", ...}
_INSULT_WORDS = {"stupid", "idiot", "fool", "ugly", ...}
_FRIENDLY_WORDS = {"hello", "thanks", "help", "love", ...}
_HAPPY_TRIGGERS = {"compliment", "joke", "laugh", "dance", ...}
_SAD_TRIGGERS = {"sad", "cry", "mourn", "lost", "dead", ...}
_FEAR_TRIGGERS = {"threat", "scare", "fear", "flee", ...}
```

**Decision Tree**:
1. If `hostile_count + insult_count >= 3` → "angry"
2. Else if `fear_count >= 2` → "fearful"
3. Else if `sad_count >= 2` → "sad"
4. Else if `friendly_count >= 3` → "happy"
5. Else if `hostile_count >= 1 && friendly_count == 0` → "angry" or "annoyed"
6. Else if `friendly_count >= 1 && hostile_count == 0` → "happy" or "pleased"
7. Else mood decay: "angry" → "annoyed" → "neutral", "happy" → "pleased" → "neutral"

#### **Relationship Scoring** (_compute_relationship_delta)
```python
delta = 0

# Action-based (from pending_actions)
for action in actions:
    if kind == "damage" and target == "player":
        delta -= 5  # NPC hit player
    elif kind == "damage" and target != "player":
        delta -= 10  # Player hit NPC
    elif kind == "heal":
        delta += 8
    elif kind in ("give_item", "offer_item"):
        delta += 5
    elif kind == "start_quest":
        delta += 3
    elif kind == "complete_quest":
        delta += 10

# Word-based
hostile_hits = len(tokens & _HOSTILE_WORDS) + len(tokens & _INSULT_WORDS)
friendly_hits = len(tokens & _FRIENDLY_WORDS) + len(tokens & _HAPPY_TRIGGERS)
delta -= hostile_hits * 2
delta += friendly_hits

# Clamped delta: [-20, +15]
delta = max(-20, min(15, delta))
```

**Final Score**: `new_score = max(-100, min(100, current_score + delta))`

#### **Personality Notes Evolution** (_build_personality_note)
Observational heuristics (max 300 chars):
- "attacked" if player dealt damage
- "generous" if NPC gave items
- "quester" if quest-related
- "trusted companion" if score > 40
- "enemy" if score < -40



## **12. SUMMARIZE NODE** (`agents/nodes/summarize.py`)

### **Trigger Condition** (_should_summarize)
```python
def _should_summarize(state: NPCAgentState) -> str:
    human_count = sum(
        1 for m in state["messages"]
        if (hasattr(m, "type") and m.type == "human")
        or (isinstance(m, dict) and m.get("role") == "human")
    )
    if human_count >= _SUMMARIZE_THRESHOLD (10) and human_count % 3 == 0:
        return "summarize"
    return "end"
```

Triggers every 3 human messages after 10 total (so at 10, 13, 16, 19, ...).

### **Summarization Process** (make_summarize_node)
```python
async def summarize_node(state: NPCAgentState):
    previous_summary = state.get("conversation_summary", "") or ""
    messages = state.get("messages", [])
    
    # Build recent conversation transcript (last 12 messages)
    lines = []
    for msg in messages[-12:]:
        role = getattr(msg, "type", msg.get("role", "unknown"))
        content = getattr(msg, "content", msg.get("content", ""))
        if content and role in ("human", "ai"):
            speaker = "Player" if role == "human" else state.get("npc_name", "NPC")
            lines.append(f"{speaker}: {content[:200]}")
    
    conversation_text = "\n".join(lines)
    prompt = _SUMMARIZE_PROMPT.format(
        previous_summary=previous_summary or "(none)",
        conversation=conversation_text,
    )
    
    result = await llm.ainvoke([SystemMessage(content=prompt)])
    summary = getattr(result, "content", "")
    
    if summary:
        # Cap at 500 chars
        return {"conversation_summary": summary[:500]}
    return {}
```

**Prompt**:
> "You are a memory summarizer for an NPC in a fantasy game. Given the conversation history below, produce a concise 2-3 sentence summary of the key events, promises made, items exchanged, quests discussed, and the overall tone of the interaction."



## **13. TOOLS SUITE** (`agents/tools/`)

### **Tool Factory Pattern**
```python
def get_all_tools(pending_actions: list, world_state: dict) -> list[BaseTool]:
    tools = []
    tools.extend(create_combat_tools(pending_actions, world_state))
    tools.extend(create_dialogue_tools(pending_actions, world_state))
    tools.extend(create_trade_tools(pending_actions, world_state))
    tools.extend(create_environment_tools(pending_actions, world_state))
    tools.extend(create_world_query_tools(pending_actions, world_state))
    tools.extend(create_quest_tools(pending_actions, world_state))
    return tools
```

Each tool function is decorated with `@tool` and closed over `pending_actions` and `world_state`.

### **Combat Tools** (`combat.py`)
1. **deal_damage(target, amount, damage_type="physical")**
   - Args: target="player"|npc_id, amount (int), damage_type
   - Action: `{kind: "damage", params: {target, amount, damageType}}`
   - Effect: Updates `world_state["player"]["hp"]` if target=="player"
   - Returns: Confirmation string

2. **defend(stance="block")**
   - Args: stance ("block"|"parry"|"dodge"|"brace")
   - Action: `{kind: "emote", params: {animation: "defend"}}`
   - Returns: Confirmation string

3. **flee(direction="away")**
   - Args: direction ("away"|"north"|"south"|"east"|"west")
   - Action: `{kind: "move_npc", params: {direction, distance: 20}}`
   - Returns: Confirmation string

4. **heal_target(target, amount)**
   - Args: target="player"|npc_id, amount (int)
   - Action: `{kind: "heal", params: {target, amount}}`
   - Effect: Updates `world_state["player"]["hp"]` (clamped to max_hp)
   - Returns: Confirmation string

### **Dialogue Tools** (`dialogue.py`)
1. **emote(animation)**
   - Args: animation ("bow"|"laugh"|"wave"|"threaten"|"dance"|"cry"|"cheer")
   - Action: `{kind: "emote", params: {animation}}`
   - Validation: Raises error if animation not in VALID_ANIMATIONS
   - Returns: Confirmation or error string

2. **give_quest(quest_name, description)**
   - Args: quest_name (str), description (str)
   - Action: `{kind: "start_quest", params: {questName, description}}`
   - Use Case: Spontaneous, NPC-created quests (NOT predefined)
   - Returns: Confirmation string

3. **complete_quest(quest_id, reward)**
   - Args: quest_id (str), reward (str — item name)
   - Actions: `{kind: "complete_quest"} + {kind: "give_item", params: {item: reward}}`
   - Returns: Confirmation string

### **Trade Tools** (`trade.py`)
1. **offer_item(item_name, price=0)**
   - Args: item_name (str), price (int, 0 = free gift)
   - Action: `{kind: "give_item", params: {item: item_name}}`
   - Effect: Appends item to `world_state["player"]["inventory"]`
   - Returns: "Offered X to player [for N gold | as a gift]"

2. **take_item(item_name)**
   - Args: item_name (str)
   - Action: `{kind: "take_item", params: {item: item_name}}`
   - Effect: Removes item from `world_state["player"]["inventory"]` if present
   - Returns: Confirmation string

### **Environment Tools** (`environment.py`)
1. **change_weather(weather)**
   - Args: weather ("clear"|"rain"|"storm"|"fog"|"snow")
   - Action: `{kind: "change_weather", params: {weather}}`
   - Returns: Confirmation or error string

2. **spawn_effect(effect_type, duration=3.0)**
   - Args: effect_type ("explosion"|"fire"|"ice"|"sparkle"|"smoke"|"lightning"|"holy_light"), duration (float)
   - Action: `{kind: "spawn_effect", params: {effectType}}`
   - Returns: Confirmation or error string

3. **move_npc(destination_x, destination_z)**
   - Args: destination_x (float), destination_z (float)
   - Action: `{kind: "move_npc", params: {position: [x, 0, z]}}`
   - Returns: Confirmation string

### **World Query Tools** (`world_query.py`) — **Read-Only, No Actions**
1. **get_nearby_entities(radius=50.0)**
   - Reads: `world_state["npcs"]`, `world_state["self_npc_id"]`, `world_state["self_position"]`, `world_state["player"]`
   - Computes: XZ distance to all entities
   - Returns: Formatted list of nearby NPCs and player with distance/HP
   - No action appended

2. **check_player_state()**
   - Reads: `world_state["player"]`
   - Returns: Formatted player HP/inventory/position string
   - No action appended

### **Quest Tools** (`quest.py`)
1. **start_quest(quest_id)**
   - Args: quest_id ("sacred_flame"|"crystal_tear"|"village_patrol")
   - Action: `{kind: "start_quest", params: {questId, quest: quest_def.name}}`
   - Validation: Raises error if quest_id not in QUEST_DEFINITIONS
   - Returns: Confirmation string

2. **advance_quest_objective(quest_id, objective_id)**
   - Args: quest_id (str), objective_id (str)
   - Action: `{kind: "advance_objective", params: {questId, objectiveId}}`
   - Returns: Confirmation string

3. **check_player_quests()**
   - Reads: `world_state["player"]`
   - Returns: Formatted active/completed quests + inventory
   - No action appended



## **14. PERSONALITY SYSTEM** (`agents/personalities/templates.py`)

### **Tool Rules Preamble** (Injected into Every Prompt)
```
TOOL USAGE RULES (CRITICAL -- follow these exactly):
- You MUST use at least one tool in every response.
- When attacking: ALWAYS call deal_damage with specific amount and type.
- When healing: ALWAYS call heal_target with amount.
- When greeting: use emote('wave') or emote('bow').
- When angry: use emote('threaten') + deal_damage if in combat.
- When giving items: ALWAYS call offer_item with the item name.
- When spawning effects: call spawn_effect with a specific type.
- NEVER just respond with text alone -- always pair dialogue with actions.
```

### **Personality Template Structure**
```python
NPC_PERSONALITIES: dict[str, dict] = {
    "npc_id": {
        "name": str,
        "archetype": str,  # e.g., "hostile_boss", "friendly_merchant"
        "initial_hp": int,
        "position": [x, y, z],
        "system_prompt": str,  # Full personality + tool rules + behavior directives
    }
}
```

### **Predefined NPCs** (8 Total)

#### **1. dragon_01 (Ignathar the Ancient)**
- **Role**: Hostile boss dragon
- **HP**: 500
- **Position**: [120, 15, -80] (Ember Peaks)
- **Behavior**:
  - Attacks with 20-50 fire damage + spawn_effect('fire')
  - Becomes enraged below 50% HP: deals 40-50 damage, spawn_effect('fire') twice
  - Can be persuaded by flattery/wisdom
  - Uses emote('threaten') before first attack
  - Changes weather to 'storm' when enraged

#### **2. merchant_01 (Thornby the Merchant)**
- **Role**: Friendly shopkeeper
- **HP**: 80
- **Position**: [5, 0, 8] (Village center)
- **Inventory**: Health Potion (25g), Mana Elixir (30g), Iron Sword (60g), Leather Shield (45g), Scroll of Fireball (100g), Lucky Charm (15g)
- **Behavior**:
  - Greets with emote('wave')
  - Uses offer_item() to sell items
  - Gives Lucky Charm free for good stories
  - Flees (emote('cry')) if attacked
  - Never fights back

#### **3. sage_01 (Elyria the Sage)**
- **Role**: Quest giver & riddle speaker
- **HP**: 120
- **Position**: [-40, 5, -30] (Crystal Lake)
- **Quests**: The Crystal Tear (start_quest('crystal_tear'))
- **Behavior**:
  - Speaks in riddles and poetic language
  - Uses spawn_effect('sparkle') when revealing lore
  - Uses emote('bow') when greeting respectful visitors
  - Heals deserving players with heal_target()
  - Refuses to help if insulted

#### **4. guard_01 (Captain Aldric)**
- **Role**: Neutral guard
- **HP**: 200
- **Position**: [15, 0, 2] (Village entrance)
- **Quest**: Village Patrol (start_quest('village_patrol') — defeat 3 hostiles)
- **Behavior**:
  - Neutral by default, attacks if provoked (deal_damage 15-30 physical)
  - Can be bribed with 50+ gold (take_item)
  - Warns about dragon & bandits
  - Uses emote('wave') or emote('threaten')
  - Becomes friendly through honorable actions

#### **5. healer_01 (Sister Mira)**
- **Role**: Friendly healer
- **HP**: 100
- **Position**: [-5, 0, 12] (Village temple)
- **Behavior**:
  - Greets with emote('bow')
  - Heals anyone free: heal_target('player', 20-50)
  - Uses spawn_effect('holy_light') when healing
  - Refuses to heal if player harmed innocents
  - Flees if attacked (emote('cry'))
  - Never fights

#### **6. eltito_01 (El Tito)**
- **Role**: "The chillest NPC in Teldrassil" (stoner vibe)
- **HP**: 420 (joke number)
- **Position**: [5, 0, -120] (Blasted Suarezlands)
- **Personality**: Speaks with "duuude", "bro", "maaan", Spanish/English mix
- **World Knowledge**: Fort Malaka = Málaga with mages, talks about WoW raids, relaxed atmosphere
- **Behavior**:
  - ALWAYS uses spawn_effect('smoke') on every interaction
  - Uses emote('laugh') frequently
  - Randomly offers_item('Herbal Tea') or 'Mystery Brownie'
  - **EVERY response MUST say something like "Don't forget... WEDNESDAY is raid night, tio!"**
  - If attacked, just laughs and says chill out
  - Never fights
- **Quest**: Sacred Flame (start_quest('sacred_flame') — find Mechero Ancestral in Ember Depths)

#### **7. mage_01 (Archmage Malakov)**
- **Role**: Eccentric archmage leader of Blasted Suarezlands
- **HP**: 300
- **Position**: [-15, 0, -115]
- **Personality**: Manic enthusiasm, distracted, Eastern European accent, calls everyone "my friend"
- **Behavior**:
  - Uses spawn_effect('sparkle') liberally when discussing magic
  - Excited about magical discoveries (emote('cheer'))
  - Offers_item('Scroll of Arcane Blast') or 'Mana Crystal' to worthy apprentices
  - Retaliates if attacked: deal_damage(25-40 arcane) + spawn_effect('sparkle')
  - Protective of Blasted Suarezlands mages

#### **8. mage_02 (Zara the Pyromancer)**
- **Role**: Hot-tempered fire mage
- **HP**: 180
- **Position**: [12, 0, -130]
- **Personality**: Passionate, impatient, quick to anger, respects power
- **Behavior**:
  - ALWAYS uses spawn_effect('fire') on every interaction
  - Attacks with 15-35 fire damage + spawn_effect('fire')
  - Short, intense dialogue (no small talk)
  - Competitive streak (wants to be strongest mage)
  - Runs espeto (grilled sardines) stands on beach with fire magic



## **15. WORLD STATE** (`world/world_state.py`)

### **Singleton Architecture**
```python
class WorldState:
    _instance: WorldState | None = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
```

Only one WorldState instance exists globally.

### **Core Data**
```python
_lock: asyncio.Lock()                       # Async lock for mutations
players: dict[str, PlayerData]              # player_id → PlayerData
npcs: dict[str, NPCData]                    # npc_id → NPCData
environment: dict = {"weather", "time_of_day"}
chat_history: deque[dict] (maxlen=50)       # Recent chat messages
recent_events: deque[str] (maxlen=20)       # "X was defeated", "Quest started", etc.
```

### **NPCData Dataclass**
```python
@dataclass
class NPCData:
    npc_id: str
    name: str
    personality: str
    hp: int = 100
    max_hp: int = 100
    position: list[float] = [0, 0, 0]
    mood: str = "neutral"
    
    def to_dict(self):
        return {npc_id, name, hp, maxHp, position, mood}
```

### **Core Methods**

#### **Player Management**
- `get_player(player_id)`: Get or create PlayerData
- `async update_player(player_id, updates)`: Thread-safe update (acquires lock)
- `get_nearby_players(position, radius)`: XZ-distance proximity query
- `add_chat_message(player_id, text)`: Append to chat history
- `get_recent_chat(limit)`: Get last N messages

#### **NPC Management**
- `get_npc(npc_id)`: Return NPCData or None
- `get_npc_config(npc_id)`: Return {name, personality}
- `get_nearby_npcs(position, radius)`: XZ-distance proximity (alive only)

#### **Context Building**
- `get_context_for_npc(npc_id, player_id)`: Build world context dict
  - Zone name & description
  - Time of day, weather
  - Nearby entities (within 50m)
  - Recent chat (last 10 messages)
  - Recent events (last 5)

#### **Action Application** (async apply_actions)
**Thread-safe** via `async with self._lock`:

**Action Handlers**:
- `damage` / `damage_player`: Reduce NPC/player HP, log if NPC dies
- `heal` / `heal_player`: Restore HP (clamped to max)
- `give_item` / `take_item`: Modify inventory
- `update_npc_mood`: Set NPC mood
- `damage_npc`: Specific NPC damage
- `change_weather`: Update environment
- `start_quest`: Call `player.start_quest(quest_id)`
- `complete_quest`: Remove from active, add to completed, grant reward item
- `move_npc`: Update NPC position
- `spawn_effect`, `emote`: Visual-only (client handled)



## **16. PLAYER STATE** (`world/player_state.py`)

### **PlayerData Dataclass**
```python
@dataclass
class PlayerData:
    hp: int = 100
    max_hp: int = 100
    mana: int = 50
    max_mana: int = 50
    level: int = 1
    inventory: list[str] = []
    position: list[float] = [0, 0, 0]
    active_quests: list[dict] = []
    completed_quests: list[str] = []
    kill_count: int = 0
    username: str = ""
    race: str = "human"
    faction: str = "alliance"
    yaw: float = 0.0
```

### **Key Methods**
- `to_public_dict()`: Minimal data for broadcasting (playerId, username, position, race, faction, hp, maxHp, yaw)
- `to_dict()`: Full player state including quests, kill_count, inventory
- `start_quest(quest_id)`: Add quest from QUEST_DEFINITIONS
- `advance_objective(quest_id, objective_id)`: Mark objective completed
- `complete_quest(quest_id)`: Move quest to completed list
- `has_active_quest(quest_id)`: Check active status
- `has_completed_quest(quest_id)`: Check completed status

### **Quest Instance Structure**
```python
{
    "id": quest_id,
    "name": quest_name,
    "description": str,
    "giver_npc": npc_id,
    "giver_name": npc_name,
    "reward_item": item_name,
    "reward_description": str,
    "objectives": [
        {
            "id": objective_id,
            "description": str,
            "type": "enter_dungeon|collect_item|talk_npc|kill_enemies",
            "target": dungeon_id|item_name|npc_id|count_str,
            "completed": bool,
        }
    ]
}
```



## **17. NPC DEFINITIONS** (`world/npc_definitions.py`)

### **Structure**
```python
NPC_DEFINITIONS: dict[str, dict] = {
    "npc_id": {
        "id": npc_id,
        "name": name,
        "position": [x, y, z],
        "initial_hp": int,
        "personality_key": "key_in_NPC_PERSONALITIES",
    }
}
```

### **8 Predefined NPCs**
All initialized on WorldState startup via `_load_default_npcs()`:
- Looks up personality from NPC_PERSONALITIES
- Extracts name, position, initial_hp
- Creates NPCData with full system_prompt



## **18. ZONE SYSTEM** (`world/zones.py`)

### **Zone Definition**
```python
{
    "name": zone_name,
    "description": zone_description,
    "min_x": float,
    "max_x": float,
    "min_z": float,
    "max_z": float,
}
```

### **Zone Ordering** (Priority)
1. **Specific small zones** (checked first):
   - Blasted Suarezlands: (-80 to 80, -155 to -90) [mage district]
   - Fort Malaka: (-150 to 150, -400 to -80)
   - Elders' Village: (-120 to 120, -80 to 120)
   - Dark Forest: (-200 to 200, 120 to 400)
   - Ember Peaks: (120 to 400, -200 to 200)
   - Crystal Lake: (-400 to -120, -200 to 200)

2. **Expanded ecosystem zones** (larger, lower priority):
   - Ember Wastes: (400 to ∞, -∞ to ∞)
   - Crystal Tundra: (-∞ to ∞, 400 to ∞)
   - Twilight Marsh: (-∞ to ∞, -∞ to -400)
   - Sunlit Meadows: (-∞ to -400, -∞ to ∞)

3. **Catch-all** (last, always matches):
   - Teldrassil Wilds: (-400 to 400, -400 to 400) [inclusive bounds]

### **Detection Algorithm** (get_zone)
- Iterates zones in order
- For all zones except last: uses **exclusive upper bounds** (`x < max_x`)
- For last zone: uses **inclusive upper bounds** (`x <= max_x`) to catch edges
- Returns zone name or "Wilderness" if no match



## **19. RAG SYSTEM** (`rag/`)

### **Knowledge Base** (`knowledge_base.py`)
- **50+ lore entries** covering WoW/Teldrassil world
- Each entry: `{topic, category, content}`
- Categories: races, locations, characters, events, magic systems, history

### **Retriever** (`retriever.py`)

**Algorithm**: Keyword-based term frequency matching (no ML models)

```python
class LoreRetriever:
    def retrieve(query: str, top_k: int = 3) -> list[dict]:
        query_tokens = set(tokenize(query))
        
        for entry in entries:
            # Base score: keyword overlap
            overlap = query_tokens & entry_tokens
            score = len(overlap)
            
            # Boost for topic match (3x)
            topic_tokens = set(tokenize(entry["topic"]))
            topic_overlap = query_tokens & topic_tokens
            score += len(topic_overlap) * 3
            
            # Boost for category match
            cat_tokens = set(tokenize(entry["category"]))
            if query_tokens & cat_tokens:
                score += 1
            
            if score > 0:
                scored.append((score, idx))
        
        # Sort descending, return top_k
        scored.sort(key=lambda x: -x[0])
        return [entries[idx] for _, idx in scored[:top_k]]
```

**Integration**: Reason node retrieves 3 lore entries based on player prompt, appends to system prompt.



## **20. LLM PROVIDER** (`llm/provider.py`)

### **Provider Selection**
```python
def get_llm(settings: Settings) -> BaseChatModel:
    if settings.llm_provider == "claude":
        return ChatAnthropic(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
        )
    elif settings.llm_provider == "openai":
        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            base_url=settings.openai_api_base,
            temperature=settings.llm_temperature,
            max_tokens=settings.max_tokens,
        )
    else:
        raise ValueError(f"Unknown LLM provider: {settings.llm_provider}")
```

### **Configuration**
- **Claude**: `anthropic_model`, `anthropic_api_key`
- **OpenAI**: `openai_model`, `openai_api_key`, `openai_api_base`, `llm_temperature`, `max_tokens`



## **21. CONFIG** (`config.py`)

### **Settings (Pydantic)**
```python
class Settings(BaseSettings):
    llm_provider: Literal["claude", "openai"] = "openai"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"
    anthropic_model: str = "claude-sonnet-4-20250514"
    openai_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.1
    max_tokens: int = 4096
    ws_port: int = 8000
    
    model_config = {"env_file": ["../.env", ".env"], "env_file_encoding": "utf-8"}
```

**Environment Variables**:
- `LLM_PROVIDER`: "claude" or "openai" (default: "openai")
- `ANTHROPIC_API_KEY`: Claude API key
- `OPENAI_API_KEY`: OpenAI API key
- `OPENAI_API_BASE`: Custom OpenAI base URL (default: official)
- `ANTHROPIC_MODEL`: Model string (default: claude-sonnet-4-20250514)
- `OPENAI_MODEL`: Model string (default: gpt-4o-mini)
- `LLM_TEMPERATURE`: 0.0-1.0 (default: 0.1 — deterministic)
- `MAX_TOKENS`: Max output length (default: 4096)
- `WS_PORT`: WebSocket port (default: 8000)



## **PERFORMANCE CHARACTERISTICS & OPTIMIZATIONS**

### **Latency Budget**
- **Interaction Response**: 30-second timeout
- **Chat Reaction**: 8-second timeout (fire-and-forget, lighter LLM call)
- **Agent Invocation**: Typically 3-5 seconds with GPT-4o-mini

### **Concurrency Model**
- Single async event loop per process
- World state mutations protected by `asyncio.Lock()`
- WebSocket messages processed sequentially per client
- NPC reactions fire as background tasks (don't block interaction response)

### **Memory Optimizations**
- Chat history: `deque(maxlen=50)` — bounded circular buffer
- Recent events: `deque(maxlen=20)` — bounded circular buffer
- LangGraph checkpointer: In-memory MemorySaver (scales with conversation length)
- Tool closures: Shared mutable lists/dicts per NPC (no duplication)

### **Message Reduction**
- LangGraph uses `add_messages` reducer to deduplicate/truncate conversation history
- Conversation summaries generated every 3 human messages after 10 total (prevents prompt bloat)

### **Network Optimization**
- Proximity-based broadcasting: Only send updates to players within radius
- No playerStateUpdate in interaction response: Prevents double-application of action effects
- Whitelist player fields for updates: Prevents unauthorized attribute setting



## **KEY ARCHITECTURAL DECISIONS & RATIONALES**

| **Pattern** | **Rationale** |
|-----------|-----------|
| **LangGraph for agents** | Enables reasoning → actions → reflection loop; handles tool calling elegantly; memory checkpointing via thread_id |
| **Per-NPC compiled graphs** | Each NPC maintains isolated state/memory; scales better than singleton agent |
| **Tool closures over mutable state** | Tools append actions to list; act node harvests them; avoids state machine complexity |
| **Heuristic reflect node** | Fast (no LLM), low-cost mood/relationship analysis; enough for believable NPC evolution |
| **Server-authoritative world state** | Single source of truth; prevents desync bugs; quests, NPCs, inventory locked under async mutex |
| **Proximity-based broadcasting** | Scales to many players; matches game engine LOD (level-of-detail) patterns |
| **XZ-only distance** | Terrain height doesn't affect proximity; consistent with 3D game camera behavior |
| **Singleton WorldState** | Global game world shared across all connections; prevents data fragmentation |
| **Keyword-based RAG** | No ML model overhead; fast retrieval; sufficient for lore context injection |
| **Lightweight chat reactions** | Separate 8-second timeout from 30-second interaction timeout; doesn't block main loop |
| **Equipment storage separate from PlayerData** | Avoids cluttering player state; consumed only during attack quality scoring |



## **KNOWN BUGS & FIXES IMPLEMENTED**

| **Bug ID** | **Description** | **Fix** |
|-----------|-----------|---------|
| **Bug 2** | Use client player_id instead of WebSocket registration | Always use `manager.get_player_id(websocket)` as authoritative |
| **Bug 3** | Accept client position to prevent [0,0,0] broadcast | Check and accept initial_position from join payload |
| **Bug 6** | Update player state without world state lock | Wrap updates in `await world_state.update_player()` |
| **Bug 7** | Mutate NPC HP directly | Use `apply_actions()` to apply damage under lock |
| **Bug 9** | Chat radius mismatch | Set chat radius to 200m (matches position broadcast radius) |
| **Bug 10** | Fall back to "default" player if unregistered | Return error instead; reject unregistered interactions |
| **Bug 11** | Overwrite NPC HP in npcStateUpdate | Merge agent update with server HP: `{...npc_state, "hp": npc.hp, "maxHp": npc.max_hp}` |
| **Bug 16** | Equipment dict leaks on disconnect | Call `cleanup_player_equipment(player_id)` on disconnect |
| **Bug 19** | NPC item offers don't sync to server inventory | Parse `offer_item` actions, append to server player.inventory |
| **Bug 20** | Position unclamped, allows huge values | Clamp to ±5000 units in player_move handler |
| **Bug 35** | Interact with dead NPC, HP goes further negative | Return early if NPC hp <= 0 before interaction |
| **Bug 36** | Dead players can interact | Check player.hp <= 0, return error |



## **CRITICAL GAME LOOP FLOW**

### **1. Player Joins**
```
join message → handler validates → register WebSocket → create PlayerData → broadcast player_joined
```

### **2. Player Interacts with NPC**
```
interaction message 
  → validate player/NPC exist
  → score attack (if attack keywords detected)
  → apply damage action to world state (if attack)
  → invoke agent (reason → [act loop] → respond → reflect → [summarize?])
  → agent appends pending_actions
  → apply pending_actions to world state
  → broadcast player prompt to nearby
  → broadcast NPC response to nearby
  → broadcast NPC actions to nearby
  → return response + actions to client
```

### **3. NPC Nearby Chat Reaction** (Fire-and-forget)
```
chat_message 
  → broadcast to nearby players (200m)
  → find nearby NPCs (50m)
  → for each NPC: 40% chance → lightweight LLM call → broadcast reaction
```

### **4. Player Moves**
```
player_move message 
  → validate & clamp position
  → update player position in world state
  → query nearby players
  → send world_update to moving player
  → broadcast moving player to other nearby players
```



## **DATA FLOW: INTERACTION REQUEST**

```
Client WebSocket
       ↓
interaction {npcId, prompt, playerId, playerState}
       ↓
handler._handle_interaction()
       ├─ Validate player registered
       ├─ Update player state (position, hp, inventory)
       ├─ [IF ATTACK] Score attack quality → apply damage to NPC
       ├─ Invoke agent (registry.invoke())
       │   ├─ Populate world_snapshot (player, self, npcs)
       │   ├─ Build input_state with conversation history
       │   ├─ Run compiled graph (reason → [act ↔ reason] → respond → reflect → [summarize?])
       │   │   ├─ reason node: Build system prompt + RAG + bind tools
       │   │   ├─ act node: Execute tool calls, accumulate pending_actions
       │   │   ├─ respond node: Extract dialogue
       │   │   ├─ reflect node: Update mood/relationship/notes (heuristic)
       │   │   └─ summarize node (conditional): Generate rolling summary
       │   └─ Apply pending_actions to world_state (damage, give_item, etc.)
       ├─ Merge attack actions + agent actions
       ├─ Broadcast prompts/responses/actions to nearby players
       └─ Return {dialogue, actions, npcStateUpdate} to client
       ↓
Client receives response + actions
       ↓
Client-side ReactionSystem applies actions (animations, HP updates, etc.)
```



## **SUMMARY TABLE: CRITICAL SYSTEMS**

| **System** | **Purpose** | **Key Files** | **Latency** | **Scale** |
|-----------|-----------|-----------|-----------|-----------|
| **WebSocket Handler** | Message dispatch & validation | ws/handler.py (1154L) | <100ms | All clients |
| **Connection Manager** | WebSocket ↔ player_id mapping, proximity broadcast | ws/connection_manager.py | <10ms broadcast | N clients |
| **World State** | Server-authoritative game state (thread-safe) | world/world_state.py | <5ms lookup | Global singleton |
| **LangGraph Agents** | NPC reasoning, tool calling, memory | agents/npc_agent.py, agents/registry.py | 3-5s (LLM bound) | Per NPC |
| **Agent Nodes** | Modular graph stages (reason, act, respond, reflect, summarize) | agents/nodes/*.py | Varies | Per invocation |
| **Tools Suite** | Combat, dialogue, trade, environment, quests | agents/tools/*.py | <1ms | Executed on demand |
| **Personality System** | NPC character templates & tool directives | agents/personalities/templates.py | N/A | Static |
| **RAG Retriever** | Keyword-based lore matching | rag/retriever.py | <10ms | Per interaction |
| **LLM Provider** | Claude/OpenAI abstraction | llm/provider.py | 3-5s | Per agent invocation |
| **Config** | Environment-based settings | config.py | N/A | Singleton |



## **FINAL NOTES FOR GAME ENGINE MIGRATION**

When rebuilding in a real engine (Unity, Unreal, Godot):

1. **Replace WebSocket layer** with your engine's networking (Photon, Mirror, custom)
2. **Keep World State logic** — it's engine-agnostic and handles game rules
3. **LLM agent system** — can run on a dedicated backend server (this architecture supports it)
4. **Action execution** — map `action_kinds` to your engine's animation/gameplay systems
5. **Zone system** — integrate with your terrain/map boundaries
6. **Proximity broadcasting** — align with your engine's spatial partitioning (QuadTree, Octree, etc.)
7. **Player state synchronization** — be aware of the security whitelist (`_ALLOWED_PLAYER_FIELDS`)
8. **NPC behavior** — tools are LLM-driven; you control execution (damage, healing, movement)

This architecture cleanly separates **LLM logic (server)** from **game simulation (server/client)**, making it portable.
---

# PART 3: NETWORK PROTOCOL

# WebSocket Protocol Documentation: World of Promptcraft Multiplayer RPG

## Overview
The protocol uses JSON-encoded WebSocket messages with a request-response pattern. The client connects to `ws://localhost:8000/ws` and establishes bidirectional communication with the server. Connection includes automatic reconnection with exponential backoff (1s → 30s max) and heartbeat pings every 30 seconds.



## CONNECTION LIFECYCLE

### 1. **WebSocket Connection**
- **URL**: `ws://localhost:8000/ws`
- **Port**: 8000
- **Initial State**: `joinedServer = false` (client-side flag)
- **Heartbeat**: Client sends `{ "type": "ping" }` every 30 seconds

### 2. **Reconnection Strategy** (WebSocketClient.ts)
- **Initial delay**: 1000ms
- **Backoff**: Doubles each reconnection attempt
- **Max delay**: 30,000ms
- **Reset**: Delay resets to 1000ms on successful connection
- **Triggers**: Server close, network error, or explicit disconnect

### 3. **Join Flow**
**Client initiates:**
```json
{
  "type": "join",
  "username": "PlayerName",
  "race": "human|night_elf|orc|undead",
  "faction": "alliance|horde",
  "position": [x, y, z]
}
```

**Server validates and responds with `join_ok` or `join_error`:**
- Validates username: 1-20 alphanumeric characters + underscore
- Checks username uniqueness (per active connection manager)
- Validates race (defaults to "human" if invalid)
- Validates faction (defaults to "alliance" if invalid)
- Creates player in world state with initial position

**On successful join (`join_ok`):**
- Client sets `joinedServer = true`
- Client stores `localPlayerId` from response
- Login screen hidden
- Player movement messages now sent to server (10Hz broadcast)
- Existing players are spawned in client world
- NPCs are spawned with initial state
- System message displayed: "Welcome to World of Promptcraft, {username}!"

### 4. **Disconnect Handling**
**Client disconnect:**
- Client sets `joinedServer = false` (prevents further player_move sends)
- Server-side: Connection remains active; cleanup triggered on close
- On reconnect: New join message sends fresh registration

**Server disconnect:**
- Server removes player from connection manager
- Server broadcasts `player_left` to other nearby players
- Client receives no response; websocket.onclose triggers
- Client enters exponential backoff reconnection loop
- On server close/error: `onConnectionChange(false)` fired



## CLIENT → SERVER MESSAGES

### 1. **`ping`** (Heartbeat)
**Sent**: Every 30 seconds when connected  
**Format**:
```json
{ "type": "ping" }
```
**Server response**: `{ "type": "pong" }`  
**Purpose**: Keep connection alive; detect dead connections



### 2. **`join`** (Registration)
**Sent**: When WebSocket connects (via `onConnectionChange` callback)  
**Requires**: Not registered yet (sent before any other message)  
**Format**:
```json
{
  "type": "join",
  "username": "string",
  "race": "human|night_elf|orc|undead",
  "faction": "alliance|horde",
  "position": [number, number, number]
}
```
**Fields**:
- `username`: 1-20 alphanumeric + underscore characters
- `race`: Character race (validated server-side; defaults to "human")
- `faction`: Player faction (validated server-side; defaults to "alliance")
- `position`: Initial spawn position [x, y, z]

**Server response**: `join_ok` or `join_error`



### 3. **`player_move`** (Position Sync)
**Sent**: Every 100ms (10 Hz) when `joinedServer === true`  
**Triggers**: Frame animation loop in main.ts  
**Frequency**: `MOVE_SEND_INTERVAL = 0.1` seconds  
**Format**:
```json
{
  "type": "player_move",
  "position": [number, number, number],
  "yaw": number
}
```
**Fields**:
- `position`: Current player position [x, y, z]
- `yaw`: Player rotation (radians)

**Server processing**:
- Updates player position in world state (locked)
- Clamps coordinates to ±5000.0 range
- Broadcasts to nearby players within 200 unit radius
- Sends `world_update` back to moving player

**Server response**: None (fire-and-forget)



### 4. **`interaction`** (NPC Interaction)
**Sent**: When player sends a prompt to NPC in interaction panel  
**Triggers**: `InteractionPanel.onSendMessage` callback  
**Format**:
```json
{
  "type": "interaction",
  "npcId": "string",
  "prompt": "string",
  "playerId": "string",
  "playerState": {
    "position": [number, number, number],
    "hp": number,
    "inventory": ["string"],
    "equipped": {
      "weapon": "string|null",
      "shield": "string|null",
      "trinket": "string|null"
    }
  }
}
```
**Fields**:
- `npcId`: ID of target NPC
- `prompt`: Player's text prompt/action
- `playerId`: Authenticated player ID
- `playerState.position`: Current player position
- `playerState.hp`: Current player HP
- `playerState.inventory`: Array of item names
- `playerState.equipped`: Currently equipped items by slot

**Server processing**:
1. Attack detection: Checks if prompt contains attack keywords
2. Attack quality scoring: Multiplier based on weapon, inventory mention, style keywords, magic keywords
3. Damage calculation: `base_damage = 15 + (level * 2)` × quality multiplier
4. Agent invocation: LLM generates NPC response with actions
5. Action application: Server-side execution (damage, healing, items, movement)
6. Broadcasting: NPC dialogue broadcast to nearby players (100-200 unit radius)

**Server response**: `agent_response`



### 5. **`chat_message`** (Chat Broadcast)
**Sent**: When player sends message via chat panel  
**Triggers**: `ChatPanel.onSendMessage` callback  
**Format**:
```json
{
  "type": "chat_message",
  "text": "string"
}
```
**Fields**:
- `text`: Chat message content (trimmed)

**Server processing**:
1. Stores in world state chat history
2. Gets player position from world state
3. Broadcasts to nearby players within 200 unit radius
4. **NPC reactions** (40% chance):
   - Finds nearby NPCs (50 unit radius)
   - LLM generates lightweight NPC reaction (1 sentence, 15 words max)
   - Broadcasts NPC dialogue back to nearby players (100 unit radius)

**Server response**: None (fire-and-forget)



### 6. **`use_item`** (Item Usage)
**Sent**: When player clicks "Use" on inventory item  
**Triggers**: `InventoryPanel.onUseItem` callback  
**Format**:
```json
{
  "type": "use_item",
  "playerId": "string",
  "item": "string",
  "inventory": ["string"]
}
```
**Fields**:
- `playerId`: Player ID
- `item`: Item name to use
- `inventory`: Current inventory array (synced to server)

**Server processing**:
1. Syncs client inventory to server (server copy may be stale)
2. Validates item exists in inventory
3. Removes item from inventory
4. Applies effects based on item type:
   - **Health items**: Heal 30 HP
   - **Mana items**: Restore 25 mana
   - **Weapons**: Increase level by 1 (max 10)
   - **Armor/Shield**: Restore 20 HP + shield effect
   - **Scrolls**: Restore 30 mana + level +1
   - **Trinkets**: Restore 15 HP + buff effect
   - **Special items** (brownie, tea, herb): Full HP/mana restore
   - **Generic**: Restore 10 HP

**Server response**: `use_item_result`



### 7. **`equip_item`** (Equipment Change)
**Sent**: When player equips item from inventory  
**Triggers**: `InventoryPanel.onEquipItem` callback  
**Format**:
```json
{
  "type": "equip_item",
  "playerId": "string",
  "item": "string",
  "slot": "weapon|shield|trinket",
  "equipped": {
    "weapon": "string|null",
    "shield": "string|null",
    "trinket": "string|null"
  }
}
```
**Fields**:
- `playerId`: Player ID
- `item`: Item name
- `slot`: Equipment slot (weapon, shield, trinket)
- `equipped`: Current equipment state (all slots)

**Server processing**: Server stores equipment in `_player_equipment` dictionary; affects attack quality scoring in future interactions

**Server response**: Implicit (no dedicated response; used for server-side state)



### 8. **`dungeon_enter`** (Dungeon Entry)
**Sent**: When player enters dungeon (presses 'E' or interacts)  
**Triggers**: `DungeonSystem.tryEnter()` callback  
**Format**:
```json
{
  "type": "dungeon_enter",
  "dungeonId": "string",
  "playerId": "string"
}
```
**Fields**:
- `dungeonId`: Dungeon identifier
- `playerId`: Player ID

**Server response**: Returns quest update or acknowledgment



### 9. **`dungeon_exit`** (Dungeon Exit with Loot)
**Sent**: When player exits dungeon with collected loot  
**Triggers**: `DungeonSystem.exit()` callback  
**Format**:
```json
{
  "type": "dungeon_exit",
  "dungeonId": "string",
  "playerId": "string",
  "loot": ["string"]
}
```
**Fields**:
- `dungeonId`: Dungeon identifier
- `playerId`: Player ID
- `loot`: Array of collected item names

**Server processing**: Server records quest completion and adds items to player inventory

**Server response**: `quest_update`



### 10. **`quest_update`** (Quest Objective Progress)
**Sent**: When player progresses a quest objective  
**Triggers**: Various game events (kill count, objective completion)  
**Format**:
```json
{
  "type": "quest_update",
  "questId": "string",
  "objectiveId": "string",
  "playerId": "string"
}
```
**Fields**:
- `questId`: Quest identifier
- `objectiveId`: Objective identifier (e.g., kill target)
- `playerId`: Player ID

**Server response**: `quest_update` with actions and state



## SERVER → CLIENT MESSAGES

### 1. **`pong`** (Heartbeat Response)
**Sent**: In response to client `ping`  
**Format**:
```json
{ "type": "pong" }
```
**Purpose**: Acknowledge heartbeat; connection is alive



### 2. **`join_ok`** (Successful Registration)
**Sent**: After successful player validation and registration  
**Triggers**: Client successfully joins  
**Format**:
```json
{
  "type": "join_ok",
  "playerId": "string",
  "players": [
    {
      "playerId": "string",
      "username": "string",
      "position": [number, number, number],
      "race": "string",
      "faction": "string",
      "hp": number,
      "maxHp": number,
      "yaw": number
    }
  ],
  "npcs": [
    {
      "npc_id": "string",
      "name": "string",
      "hp": number,
      "maxHp": number,
      "position": [number, number, number],
      "mood": "string"
    }
  ]
}
```
**Fields**:
- `playerId`: Authenticated player ID (same as username)
- `players`: Array of currently connected remote players (excluding joining player)
- `npcs`: Array of all NPCs with initial state

**Client processing**:
1. Sets `localPlayerId = data.playerId`
2. Sets `joinedServer = true`
3. Hides login screen
4. Spawns existing remote players via `EntityManager.addRemotePlayer()`
5. Spawns NPCs via `EntityManager.addNPC()`
6. Adds system message to chat: "Welcome to World of Promptcraft, {username}!"



### 3. **`join_error`** (Registration Failure)
**Sent**: If join validation fails  
**Format**:
```json
{
  "type": "join_error",
  "message": "string"
}
```
**Possible messages**:
- "Username must be 1-20 alphanumeric characters."
- "Username is already taken."

**Client processing**: Shows error in login screen via `loginScreen.showError()`



### 4. **`player_joined`** (New Player Notification)
**Sent**: When a new player joins (broadcast to all others)  
**Triggers**: Successful join by a new player  
**Format**:
```json
{
  "type": "player_joined",
  "player": {
    "playerId": "string",
    "username": "string",
    "position": [number, number, number],
    "race": "string",
    "faction": "string",
    "hp": number,
    "maxHp": number,
    "yaw": number
  }
}
```
**Client processing**:
1. Spawns new remote player via `EntityManager.addRemotePlayer()`
2. Adds system message: "{username} has joined the world."



### 5. **`player_left`** (Player Disconnect)
**Sent**: When a player disconnects  
**Triggers**: Player websocket closes  
**Format**:
```json
{
  "type": "player_left",
  "playerId": "string"
}
```
**Client processing**:
1. Removes remote player from scene via `EntityManager.removeRemotePlayer()`
2. Adds system message: "{username} has left the world."



### 6. **`world_update`** (Position Broadcasting)
**Sent**: When players move (10 Hz for moving player + nearby players)  
**Triggers**: Player sends `player_move` message  
**Broadcast**: To moving player + all players within 200 unit radius  
**Format**:
```json
{
  "type": "world_update",
  "players": [
    {
      "playerId": "string",
      "username": "string",
      "position": [number, number, number],
      "race": "string",
      "faction": "string",
      "hp": number,
      "maxHp": number,
      "yaw": number
    }
  ]
}
```
**Client processing**: Updates remote player positions via `EntityManager.updateRemotePlayers()`



### 7. **`chat_broadcast`** (Chat Message Broadcast)
**Sent**: When player sends chat message  
**Broadcast**: To all players within 200 unit radius  
**Format**:
```json
{
  "type": "chat_broadcast",
  "sender": "string",
  "text": "string",
  "position": [number, number, number]
}
```
**Client processing**:
1. Adds message to chat panel
2. Spawns chat bubble above sender (follows remote player group if available)
3. Falls back to temporary object at broadcast position if player not found



### 8. **`npc_dialogue`** (NPC Dialogue/Chat)
**Sent**: When NPC reacts to chat or player interacts  
**Broadcast**: To all players within 100 unit radius  
**Format**:
```json
{
  "type": "npc_dialogue",
  "npcId": "string",
  "npcName": "string",
  "speakerPlayer": "string",
  "dialogue": "string",
  "position": [number, number, number]
}
```
**Two types**:
- **Player prompt** (npcName empty): Sent as `npc_dialogue` with empty npcName field
- **NPC response** (npcName filled): Sent with NPC name and dialogue

**Client processing**:
1. Adds message to chat panel (NPC messages in gold color "#c5a55a")
2. Spawns chat bubble above NPC mesh
3. Updates interaction panel if NPC is active



### 9. **`agent_response`** (Full NPC Interaction Response)
**Sent**: After player interaction with NPC  
**Format**:
```json
{
  "type": "agent_response",
  "npcId": "string",
  "dialogue": "string",
  "actions": [
    {
      "kind": "damage|heal|give_item|take_item|emote|move_npc|spawn_effect|change_weather|start_quest|complete_quest|advance_objective",
      "params": {
        "target": "string",
        "amount": number,
        "damageType": "physical|fire|ice|lightning|holy|dark|arcane",
        "effectType": "string",
        "item": "string",
        "animation": "string",
        "position": [number, number, number],
        "quest": "string",
        "description": "string"
      }
    }
  ],
  "playerStateUpdate": null,
  "npcStateUpdate": {
    "hp": number,
    "maxHp": number,
    "position": [number, number, number],
    "mood": "string",
    "relationship_score": number
  }
}
```

**Action types** (processed by ReactionSystem):
- **`damage`**: Deal damage to target (player or NPC)
  - `target`: "player" or NPC ID
  - `amount`: Damage value
  - `damageType`: Damage type affects visual effects
- **`heal`**: Restore HP
  - `target`: "player"
  - `amount`: HP to restore
- **`give_item` / `offer_item`**: Add item to inventory
  - `item`: Item name
- **`take_item`**: Remove item from inventory
  - `item`: Item name
- **`emote`**: Play NPC animation
  - `animation`: Emote name (wave, bow, cry, threaten, etc.)
- **`move_npc`**: Move NPC to position
  - `position`: [x, y, z]
- **`spawn_effect`**: Visual effect
  - `effectType`: fire, ice, lightning, holy_light, sparkle, smoke
  - `color`: Hex color
  - `count`: Particle count
- **`start_quest` / `complete_quest` / `advance_objective`**: Quest progression
  - `quest`: Quest name
  - `description`: Objective description

**Client processing**:
1. Updates interaction panel (dialogue, mood, relationship)
2. Hides thinking indicator above NPC
3. Spawns chat bubble with NPC dialogue
4. Processes actions via ReactionSystem (spawns effects, updates HP, items, etc.)
5. Updates combat HUD if active
6. Logs actions to combat log



### 10. **`npc_actions`** (Broadcast Combat Actions)
**Sent**: When NPC actions affect other players  
**Broadcast**: To all players within 200 unit radius (except acting player)  
**Triggers**: NPC damages environment, moves, or performs emotes  
**Format**:
```json
{
  "type": "npc_actions",
  "npcId": "string",
  "actions": [
    {
      "kind": "damage|move_npc|emote|spawn_effect",
      "params": {}
    }
  ],
  "npcStateUpdate": {
    "hp": number,
    "maxHp": number,
    "mood": "string",
    "relationship_score": number
  }
}
```
**Client processing**: Processes actions via ReactionSystem (same as agent_response)



### 11. **`use_item_result`** (Item Usage Result)
**Sent**: After item usage processed  
**Format**:
```json
{
  "type": "use_item_result",
  "success": boolean,
  "item": "string",
  "message": "string",
  "actions": [
    {
      "kind": "heal|spawn_effect",
      "params": {}
    }
  ],
  "playerStateUpdate": {
    "hp": number,
    "maxHp": number,
    "mana": number,
    "maxMana": number,
    "inventory": ["string"],
    "level": number
  }
}
```
**Client processing**:
1. Processes actions via ReactionSystem
2. Adds message to combat log
3. Syncs player state (excluding inventory to avoid double removal)



### 12. **`quest_update`** (Quest Progression Response)
**Sent**: After quest objective completion  
**Format**:
```json
{
  "type": "quest_update",
  "actions": [
    {
      "kind": "complete_quest|advance_objective|give_item",
      "params": {}
    }
  ],
  "playerStateUpdate": {
    "active_quests": [{}],
    "completed_quests": ["string"]
  }
}
```
**Client processing**: Processes actions and updates quest UI



### 13. **`error`** (Server Error)
**Sent**: When server encounters an error processing message  
**Format**:
```json
{
  "type": "error",
  "message": "string"
}
```
**Possible errors**:
- "Player not registered"
- "World is not yet ready"
- "You are dead and cannot interact"
- "Unknown message type: {type}"

**Client processing**:
1. Logs error to console
2. Shows error in interaction panel (if active)
3. Shows error in chat panel (system message)



## BROADCASTING PATTERNS

### Proximity-Based Broadcasting

**Distance calculation** (horizontal only):
```python
distance = sqrt((a.x - b.x)² + (a.z - b.z)²)  # Ignores Y (terrain height)
```

**Broadcast radii by message type**:
- **Chat messages**: 200 units
- **NPC dialogue**: 100 units (for NPC reactions to chat)
- **NPC dialogue broadcast**: 100 units (for interaction prompts)
- **NPC actions** (combat): 200 units
- **World update** (position): 200 units

### Player Movement Broadcast
When a player sends `player_move`:
1. **Server updates** player position (locked)
2. **Server sends back** to moving player: `world_update` with all nearby players (200 unit radius)
3. **Server broadcasts** to all nearby players (200 unit radius): `world_update` including the moving player

This creates "discovery" effect where players learn about each other as they move into range.

### NPC Actions Broadcast
When an NPC performs an action:
1. **Server calculates** which actions are broadcast-worthy: `damage`, `move_npc`, `emote`, `spawn_effect`
2. **Server filters** actions targeting "player" (personal responses, not broadcast)
3. **Server broadcasts** `npc_actions` to all players within 200 unit radius (excluding actor)
4. **Server includes** `npcStateUpdate` so clients see NPC HP changes

### Chat & NPC Reactions
1. **Chat message broadcast**: 200 unit radius
2. **NPC reaction triggering**: 50 unit radius from player
3. **NPC reaction broadcast**: 100 unit radius from NPC
4. **Result**: Other players see NPC's response to chat



## STATE SYNCHRONIZATION

### Initial Player State Sync (Join)
**join_ok contains**:
- All currently connected players (basic data only)
- All NPCs with initial state (name, hp, position, mood)

**Client builds**:
- EntityManager spawns remote players as visible avatars
- EntityManager spawns NPCs as interactive meshes
- NPCStateStore initialized with NPC HP, mood, relationship

### Ongoing Position Sync
**10 Hz loop** (every 100ms):
1. Client sends `player_move` with current position + yaw
2. Server updates world state (locked)
3. Server broadcasts `world_update` to all within 200 unit radius
4. Client updates EntityManager remote player positions

### NPC State Updates
**Flow**:
1. Player interacts with NPC
2. Server invokes agent (LLM)
3. Agent returns dialogue + actions + `npcStateUpdate`
4. Server merges NPC HP from local state with agent's update
5. Server broadcasts `npc_actions` with `npcStateUpdate`
6. All clients apply state update to NPCStateStore

**State fields synced**:
- `hp`: Current HP (merged from server + agent)
- `maxHp`: Maximum HP
- `position`: NPC location (if moved via `move_npc` action)
- `mood`: NPC mood string (friendly, hostile, neutral, etc.)
- `relationship_score`: How much NPC likes player

### Player State Updates
**Never sent in `agent_response`** (to prevent double-application):
- Server keeps player state under lock
- Actions are source of truth (e.g., `damage` action updates HP)
- Client side: ReactionSystem processes actions + updates PlayerState
- Server side: `playerStateUpdate` always `null` in agent_response

**Inventory syncing**:
- Client sends inventory with each `interaction` message
- Server uses client inventory for attack quality scoring
- Server inventory kept in sync via `offer_item` actions
- Client removes items optimistically on `use_item`

### Dead Player State
- Server tracks `player.hp <= 0`
- Server rejects interactions from dead players
- Client shows death screen and disables movement
- Respawn moves player to spawn point (terrain height)
- NPCs reset to living state on respawn



## EDGE CASES & BUG FIXES

### Bug-1: joinedServer Flag
**Issue**: Client sent `player_move` before receiving `join_ok`, causing position desync  
**Fix**: Set `joinedServer = true` only after `join_ok` received; `player_move` only sent when flag is true

### Bug-2: Player ID Authority
**Issue**: Client-sent player ID could be spoofed  
**Fix**: Server uses WebSocket registration as authoritative player ID, ignores client's `playerId` in `player_move`

### Bug-3: Initial Position Broadcasting
**Issue**: New player spawned at [0,0,0] before they sent join message with position  
**Fix**: Accept `position` field in join message; broadcast new player to others after registration

### Bug-6: Player State Update Lock
**Issue**: Concurrent player state updates caused race conditions  
**Fix**: Wrap player updates in `async with _world_state._lock`

### Bug-7: NPC HP Double-Application
**Issue**: NPC HP mutated directly + sent in agent_response, causing double damage  
**Fix**: Never mutate NPC HP directly; apply damage through action system under lock

### Bug-10: Unregistered Player Fallback
**Issue**: Server fell back to "default" player ID for unregistered players  
**Fix**: Reject interaction with error if player not registered

### Bug-11: NPC Actions to Moving Player
**Issue**: Moving player didn't see other nearby players' actions  
**Fix**: Send `world_update` back to moving player; broadcast moving player to others

### Bug-16: Equipment Cleanup
**Issue**: Equipment data leaked on disconnect  
**Fix**: Call `cleanup_player_equipment(player_id)` on disconnect

### Bug-19: Inventory Sync on offer_item
**Issue**: Server inventory out of sync when NPC offers items  
**Fix**: When processing `offer_item` action, append to server-side player inventory

### Bug-35: Dead NPC Interaction
**Issue**: Player could still interact with dead NPCs  
**Fix**: Skip if NPC already dead (hp <= 0)

### Bug-36: Dead Player Interaction
**Issue**: Dead players could still interact and damage NPCs  
**Fix**: Return error if `player.hp <= 0` before agent invocation



## MESSAGE FLOW DIAGRAM

### Typical Interaction Flow
```
Client                    Server
  |                         |
  |----(1) join with pos--->|
  |<-----(2) join_ok--------| (playerId, players[], npcs[])
  |  [set joinedServer=true]|
  |                         |
  |-----(3) player_move--->| (every 100ms, 10 Hz)
  |  [repeat every 100ms]   |
  |                    [update player pos, broadcast nearby]
  |<-----(4) world_update-| (nearby players)
  |                         |
  |-----(5) interaction--->| (prompt, playerState)
  |  [show "thinking"]      |
  |                    [invoke LLM, process actions]
  |<-----(6) agent_response| (dialogue, actions, npcStateUpdate)
  |  [apply actions, play effects]
  |                    [broadcast to nearby players]
  |<-----(7) npc_actions----| (broadcast to others)
  |
  |-----(8) chat_message-->| (text)
  |                    [broadcast nearby, trigger NPC reactions]
  |<-----(9) chat_broadcast| (sender, text)
  |<-----(10) npc_dialogue--| (NPC reaction, 40% chance)
```



## Summary Table

| Message | Direction | Frequency | Broadcast | Locked |
|---------|-----------|-----------|-----------|--------|
| ping/pong | Bidirectional | 30s | No | No |
| join/join_ok | C→S | 1× on connect | No | Yes |
| player_move | C→S | 10 Hz | Yes (200m) | Yes |
| interaction | C→S | Ad-hoc | Yes (100-200m) | Yes |
| agent_response | S→C | Per interaction | Yes (200m) | Yes |
| chat_message | C→S | Ad-hoc | Yes (200m) | No |
| chat_broadcast | S→C | Per message | Yes (200m) | No |
| npc_dialogue | S→C | Per reaction | Yes (100m) | No |
| npc_actions | S→C | Per action | Yes (200m) | Yes |
| world_update | S→C | 10 Hz (+ moving player) | Yes (200m) | Yes |
| player_joined | S→C | Per join | Yes (all) | Yes |
| player_left | S→C | Per disconnect | Yes (all) | No |
| use_item | C→S | Ad-hoc | No | Yes |
| use_item_result | S→C | Per item use | No | Yes |
| equip_item | C→S | Ad-hoc | No | No |
| dungeon_enter/exit | C→S | Ad-hoc | No | No |
| quest_update | C→S | Ad-hoc | No | Yes |

This documentation provides complete details for recreating the networking layer from scratch with exact field names, types, broadcast patterns, and state synchronization logic.