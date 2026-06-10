---
date: 2026-06-10T17:56:52+00:00
git_commit: 47f3c0dfdf4193fc22536e58fe26b3fe564ba442
branch: docs/presentation-upgrade
topic: "How can we add a Mobile GUI so the game is playable from a phone?"
tags: [research, codebase, client, ui, input, rendering, mobile, touch]
status: complete
---

# Research: Mobile GUI / Touch Support for World of Promptcraft

## Research Question

How can we add a Mobile GUI so the game is playable from a phone? Map the current
client UI, input handling, controls, and rendering to identify what must change for
touch/mobile support.

> Note: per the research-phase contract, this document describes **what exists today**.
> The "what must change" framing is answered indirectly — by documenting every desktop-only
> assumption a mobile build would have to touch. Concrete changes belong in the plan phase.

## Summary

The client is a **desktop-first Three.js game**. Three subsystems block phone play today:

1. **Input** — movement is hardwired to `KeyW/A/S/D` + `Shift`/`Space`; camera is mouse-drag
   + pointer-lock + wheel-zoom. No touch listeners exist on the main controls. Only the
   minimap uses unified `pointer` events. There is no virtual joystick, no on-screen
   buttons for movement/camera, and the keyboard UI shortcuts (M/I/L/E/B) have no touch
   equivalent (UIManager's shortcut bar partially covers I/M/L/B).
2. **UI layout** — every HUD panel is **fixed-pixel, absolutely positioned**, sized for
   1920×1080. No media queries, no breakpoints, no responsive layout (one `clamp()` on the
   login title and `80vh` on QuestLog are the only fluid sizing). Panels overflow and
   overlap on a phone screen.
3. **Rendering** — already the most mobile-ready layer. Adaptive pixel ratio (0.9–1.5×),
   distance-culled shadows, and LOD exist. But shadows (2048 map) and post-processing
   (SMAA + Bloom) are always on with no quality tier or disable flag for low-end GPUs.

Two things are **already mobile-friendly and need no work**: the viewport meta tag is
present (`index.html:5`), and networking is host-relative (`ws(s)://window.location.host/ws`)
so a phone on the LAN connects with zero config. Vite dev server binds `0.0.0.0:5173`
(`vite.config.ts:55`), so LAN testing from a phone works today.

## Detailed Findings

### 1. Input / Controls — the primary blocker

All player input lives in `client/src/entities/PlayerController.ts`. It is keyboard+mouse only.

**Movement (keyboard-only)** — `PlayerController.ts:255-259`
- `forward = KeyW − KeyS`, `strafe = KeyA − KeyD`, `running = ShiftLeft||ShiftRight`.
- `Space` = swim-up (`:315`) / jump when grounded.
- Keys captured by global `keydown`/`keyup` into a `keys` map (`:207-214`). No touch path.

**Camera (mouse + pointer-lock)** — `PlayerController.ts:119-183`
- LMB/RMB drag past a 2px threshold (`:165`) activates orbit and calls
  `requestPointerLock()` (`:171`). `mousemove.movementX/Y` drives yaw/pitch (`:176-177`).
- **Pointer Lock is desktop-only** — iOS Safari does not support it; this whole path is
  inert on a phone.
- RMB sets `facingYawOverride` (`:179-181`) — no touch analogue.

**Zoom (mouse wheel)** — `PlayerController.ts:220-225`
- `wheel` → `zoomDistance += deltaY*0.01`, clamped `zoomMin=2`..`zoomMax=20`. No
  pinch-to-zoom.

**NPC selection (mouse click + hover)** — `client/src/systems/InteractionSystem.ts:22-126`
- Canvas `click` raycast selects NPCs (`:32-35`, `:93-102`); `mousemove` does hover
  highlight (`:38-45`). Tap *may* synthesize a `click` on mobile, but hover has no touch
  equivalent and the `wasCameraDrag()` filter (`:50-54`) assumes mouse semantics.

**Text prompt (the core mechanic) — already touch-OK** — `client/src/ui/InteractionPanel.ts:401-468`
- Standard `<input>`; `Enter` sends (`:441`), `Escape` closes. Mobile soft keyboard works,
  but the panel is fixed `600×420px` (`InteractionPanel.ts`) and sits `bottom:62px` — the
  iOS keyboard will cover it. Same story for `ChatPanel.ts:80-122` (`310×200px`,
  `bottom:62px,left:12px`).

**Keyboard UI shortcuts (no full touch equivalent)** — `client/src/core/GameBootstrapper.ts:331-349`
- `M`=minimap, `I`=inventory, `L`=quest log, `E`=enter dungeon, `B`=builder, `Enter`=chat
  focus. UIManager's shortcut bar (`UIManager.ts:112-188`) gives touch buttons for
  Bag/Map/Quests/Build — but **`E` (enter dungeon) has no on-screen control**.

**Already touch-aware** — `client/src/ui/Minimap.ts:89-92` uses `pointerdown/move/up/leave`
(works for mouse+touch). Intro cinematic uses `pointerdown` (`GameEngine.ts:147`).

### 2. UI Layout — fully fixed-pixel, not responsive

- **No CSS files.** All styling is inline `Object.assign(el.style, {...})`. No media
  queries, no breakpoints anywhere in `client/src/ui/`.
- **Root container** `UIManager.ts:43-58`: `position:absolute; inset:0; pointerEvents:none;
  zIndex:10`. Children opt back into `pointerEvents:auto`.
- **Fixed-size panels** (sample): InteractionPanel `600×420`, ChatPanel `310×200`,
  Minimap `290×290`, Inventory 6×40px grid (~286px), CombatLog `350` wide, QuestTracker
  `220`, StatusBars `180`-wide bars, QuestLog `480` wide (`80vh` is the only fluid dim).
- **Absolute offsets** assume a wide screen: top-left StatusBars, top-right Minimap +
  Inventory, bottom-center InteractionPanel, bottom-left ChatPanel, bottom-right CombatLog.
  On a ~390px-wide phone these overlap heavily and exceed viewport width.
- **Base class** `client/src/ui/core/UIComponent.ts` — abstract `render()`, `show/hide/
  toggle/dispose`, hidden-by-default. Any responsive system would hook here.
- **Z-index ladder**: world 0 → HUD 10 → logs 15 → panels 20 → minimap 100 → modals 500+
  → login 1000 → death 2000.
- **One responsive touch already exists**: `LoginScreen.ts` title `clamp(2rem,5vw,4.5rem)`
  and its backdrop canvas resizes to `window.innerWidth/Height` with `devicePixelRatio`.

### 3. Rendering — mostly mobile-capable already

`client/src/scene/SceneManager.ts`:
- WebGLRenderer: `antialias:true`, `powerPreference:'high-performance'`, pixel ratio capped
  `min(devicePixelRatio,1.5)` (`:58-73`).
- **Adaptive quality** (`:147-165`): frame >20ms → drop pixel ratio by 0.1 (floor 0.9);
  <14ms → raise by 0.05. This gives real mobile headroom.
- **Resize handling** (`:131-145`): updates camera aspect, renderer size, pixel ratio,
  EffectComposer — already correct for orientation changes.
- Camera: FOV 60°, near 0.1, far 2500 (`:49-56`).
- **Distance-culled shadows** (`:167-201`, 42m radius) + **LOD** (`:203-214`).
- **Always-on cost** for low-end GPUs: shadow map 2048 (`GameConfig.ts:53`), post-processing
  SMAA+Bloom every frame (`SceneManager.ts:89-111`) with no disable flag (`enablePostProcessing`
  in `GameConfig.ts:54` is NOT wired to the composer). No mobile quality tier.

### 4. Networking & Dev Server — already mobile-ready

- `WebSocketClient.ts:23-28` and `GameBootstrapper.ts:162-163`: URL is
  `${wss|ws}://${window.location.host}/ws` — host-relative, so a phone hitting the LAN IP
  connects with no config. (`client/src/config/NetworkConfig.ts` exists but is unused.)
- `vite.config.ts:55` `host:true` → binds `0.0.0.0:5173`; `:57` allows
  `wow.rafaelpernil.com`; `:62-67` proxies `/ws` to backend. **A phone on the same Wi-Fi
  can load the dev build today** via `http://<dev-machine-LAN-IP>:5173`.
- `index.html:27-29` redirects `localhost`→`127.0.0.1`; harmless on mobile (won't match).

## Code References

- `client/src/entities/PlayerController.ts:207-214` — keyboard WASD capture (no touch)
- `client/src/entities/PlayerController.ts:119-183` — mouse orbit + **pointer lock** (desktop-only)
- `client/src/entities/PlayerController.ts:220-225` — wheel zoom (no pinch)
- `client/src/entities/PlayerController.ts:255-259` — movement input read per frame
- `client/src/systems/InteractionSystem.ts:22-126` — click/hover NPC selection (mouse semantics)
- `client/src/ui/InteractionPanel.ts:401-468` — prompt `<input>` (fixed 600×420, keyboard overlap)
- `client/src/ui/ChatPanel.ts:80-122` — chat input (fixed 310×200)
- `client/src/core/GameBootstrapper.ts:331-349` — keyboard UI shortcuts (M/I/L/E/B)
- `client/src/ui/UIManager.ts:43-58` — root UI container; `:112-188` touch shortcut bar
- `client/src/ui/core/UIComponent.ts` — base panel class / render() pattern
- `client/src/ui/Minimap.ts:89-92` — the only touch-aware (`pointer` events) control
- `client/src/scene/SceneManager.ts:58-73` — renderer; `:131-165` resize + adaptive quality;
  `:89-111` post-processing; `:167-214` shadow culling + LOD
- `client/src/config/GameConfig.ts:50-57` — quality settings (no mobile tier)
- `client/src/network/WebSocketClient.ts:23-28` — host-relative WS URL
- `client/vite.config.ts:47-78` — `host:true` LAN dev server + `/ws` proxy
- `client/index.html:5` — viewport meta present; `:27-29` localhost→127.0.0.1 redirect

## Architecture Documentation (current patterns)

- **Input pattern**: each system attaches its own DOM listeners in its constructor/init;
  global `window` listeners for keys, canvas/`window` listeners for mouse. No central input
  abstraction — adding touch means either per-system touch handlers or a new input layer.
- **UI pattern**: class-per-panel extending `UIComponent`, mounted by `UIManager`, styled
  inline with hardcoded px and absolute positions, gold-on-dark Cinzel theme. No theming
  for layout/size; responsiveness would require either a global CSS layer or per-panel
  size logic.
- **Render pattern**: single `SceneManager` owns renderer/camera/composer with a per-frame
  adaptive-quality loop — the natural seam for a device-based quality tier.
- **Device detection**: none exists anywhere. No `matchMedia`, no UA sniff, no touch-capability
  check. Everything assumes desktop.

## Open Questions (for the plan phase)

1. **Target scope**: phone-only portrait, landscape, or "responsive down to tablet"? Drives
   how much HUD must reflow vs. just shrink.
2. **Movement scheme**: virtual joystick (left thumb) + drag-to-look (right half of screen)
   is the standard for this genre — confirm before building.
3. **Pointer Lock**: the camera path depends on it and it's unavailable on iOS. Touch-look
   must be a separate code path, not a patch on the mouse path.
4. **Quality tier**: should mobile force shadows off / post-processing off / lower shadow
   map? Needs a device check feeding `SceneManager` + `GameConfig`.
5. **Soft-keyboard handling**: prompt/chat panels need to reposition above the iOS/Android
   keyboard (visualViewport API) — currently they'd be covered.
6. **Detection strategy**: build a `isTouchDevice()` / `matchMedia('(pointer:coarse)')`
   gate to switch input + layout + quality together.
