# Login Screen 3D Rebuild + Full GLTF Removal

> **Status: DONE** — shipped on branch `login-improvements`.
> Follow-ups added during implementation: dropped the "Powered by LangGraph"
> subtitle (game name "World of Promptcraft" is final) and removed the
> Alliance/Horde toggle in favour of a flat race list (faction now derived
> from the chosen race). Tests: `NPCModels.test.ts` reworked to cover
> `getNPCPlaceholderStyle`; new `CharacterCreation.test.ts`.

## Context

The login screen (`client/src/ui/LoginScreen.ts` 2D Dark Portal canvas + `client/src/ui/screens/CharacterCreation.ts` DOM cards) shows faction → race → **skin** selection with no 3D preview. The "skin" system is pure GLTF: it resolves `/models/player/{race}/{skin}.glb` and tries to load rigged models at runtime. **No `.glb` assets exist** — every load fails silently and falls back to procedural meshes (`RaceModels.ts` for players, `NPCAppearance.ts` for NPCs). So GLTF is dead infrastructure.

**Goals (locked with user):**
1. **Rebuild login UX, WoW-style**: keep the Dark Portal as background, add a **live 3D character preview** of the selected race (rotating), with the race list on the right.
2. **Remove skin selection** entirely (UI + data + network + server field).
3. **Remove everything GLTF** — if it's not procedural meshes, it goes. **Keep all procedural meshes and all procedural animations intact.**

Outcome: leaner codebase (procedural-only rendering), and a polished character-select screen that actually shows the chosen race in 3D.

---

## Part 1 — Login screen rebuild (3D race preview, WoW-style)

### 1a. New `CharacterPreview` component
New file `client/src/ui/screens/CharacterPreview.ts`: a small self-contained Three.js renderer.
- Own `WebGLRenderer` (alpha:true so the Dark Portal canvas shows through), `PerspectiveCamera`, `Scene`.
- Build model via existing `buildRaceModel(race)` (`client/src/entities/RaceModels.ts`) + `applyCharacterPBR` (`client/src/utils/PBRMaps.ts`) for material parity with in-game.
- Simple 3-point lighting (key + fill + rim) so the procedural model reads well; auto-rotate the group each frame; render loop via `requestAnimationFrame`.
- `setRace(race: string)`: dispose current model, build + add the new one.
- `start()` / `dispose()` lifecycle; transparent fixed-size canvas (e.g. ~360×460, responsive clamp).
- Reuse the `disposeVisualRoot` traversal pattern (geometry + material dispose) when swapping models to avoid leaks.

### 1b. Restructure `CharacterCreation.ts` → WoW layout
- **Remove** the skin section: `selectedSkin` field (line 31), `skinCardsContainer` (37, 80–85, 242–247), `createSkinCard` + `updateSkinCards` (242–281), and the `skin` import (line 1).
- `CharacterSelectionResult` (17–22): drop `skin`. `onSubmit` payload (line 161): drop `skin`.
- New two-column flex layout: **left** = `CharacterPreview` canvas; **right** = faction toggle (ALLIANCE/HORDE) above the race cards column. Username input + Enter button below, full width. Keep the existing gold Cinzel styling, faction-button and race-card builders (166–240) — just reflow into the right column.
- Race card click and faction switch call `preview.setRace(this.selectedRace)` so the 3D model updates live. (Faction switch already resets to first race of faction — drive the preview from that.)
- Keep `showError`, username/Enter wiring unchanged.

### 1c. `LoginScreen.ts` wiring
- Dark Portal canvas, embers, lightning, title: **unchanged** (stays as background).
- The overlay currently centers title/subtitle/charCreation in a column; adjust so `CharacterCreation`'s wider two-column element fits (loosen `marginTop`/centering as needed).
- `onEnterWorld` (line 13) + the `charCreation.onSubmit` handler (65–67): drop the `skin` arg.
- Instantiate `CharacterPreview` inside `CharacterCreation` (owns it) and ensure `LoginScreen.hide()` triggers `charCreation.dispose()` so the preview renderer is torn down on enter.

### 1d. Delete dead `LoginForm.ts`
`client/src/ui/screens/LoginForm.ts` is an unused duplicate character form (also has skin). No importer except the barrel `client/src/ui/screens/index.ts:5`. Delete the file and its export.

---

## Part 2 — Remove the skin field (client + server)

**Client:**
- `client/src/state/PlayerState.ts`: remove `skin` field (26) + update handling (82).
- `client/src/core/GameBootstrapper.ts`: `PlayerConfig.skin` (36), `playerState.skin` (76), `Player.create(... skin ...)` (91), and `skin` in the `join` send (235).
- `client/src/main.ts:24`: drop `skin` from `onEnterWorld` signature/call.
- `client/src/network/MessageProtocol.ts`: remove `skin` from `JoinRequest` (29), `RemotePlayerData` (225), and the third occurrence (256).
- `client/src/__tests__/MessageProtocol.test.ts`: drop `skin` assertions (25,28,55,60).

**Server (full removal):**
- `server/src/world/player_state.py`: remove `skin` attr (24) + both `to_dict` entries (35,52).
- `server/src/ws/handler.py`: remove `_VALID_SKINS` (264), `skin = data.get(...)` (383), validation (399–400), `player.skin = skin` (426), and any `skin` in broadcast payloads (sweep the file for remaining matches).

---

## Part 3 — Remove all GLTF code (keep procedural meshes + animations)

**Delete files:**
- `client/src/entities/CharacterAnimator.ts` — GLTF-skeletal-only animator.
- `client/src/utils/asset/AssetLoader.ts` — sole real job was `loadGLTF`; `loadTexture` is never called anywhere. Remove exports in `client/src/utils/asset/index.ts:5` and `client/src/utils/index.ts:10` (and `client/src/utils/asset/index.ts` if it becomes empty).
- `client/src/__tests__/AssetLoader.test.ts`.

**`client/src/entities/Player.ts`:** remove GLTF/skeleton imports (2–3), `CharacterAnimator` import (4), skin import (6), `AssetLoader` import (7); drop `skin` field (18) and `animator` field (20), `tryLoadSkin` (195–210), `replaceVisualRoot` (212–254), `disposeVisualRoot` (256–269). Constructor + `create` no longer take `skin`/`assetLoader`. In `update`, the `if (this.animator)` branches (115–121, 146–153) collapse to **always** run `updateProceduralAnimation` + procedural bob (procedural path preserved exactly).

**`client/src/entities/RemotePlayer.ts`:** same removals — GLTF imports (2–3), `CharacterAnimator` (4), skin import (6); `skin` field (19,33), `animator` (27), `tryLoadSkin` (96–109), `replaceVisualRoot` (111–135); drop `assetLoader` ctor param + the `tryLoadSkin` call (53–55). Keep `disposeVisualRoot` (used by `dispose`). `update` (76–80) loses the animator branch (remote players already interpolate position; no procedural animation applied here today, so just drop the dead branch).

**`client/src/entities/NPC.ts`:** remove `GLTF` import (2), `getNPCModelPath` import (8 — keep `getNPCPlaceholderStyle`/type), `AssetLoader` import (12); drop `gltfMode` (54), `replaceWithGLTF` (113–141), `collectStdMaterials` (143–154); in `create` drop the `assetLoader`/GLTF block (100–110) → `create(config)` only; in `dispose` drop the `gltfMode` branch (224–236, keep nameplate/icon disposal); `setHighlight` (248–260) uses `this.materials` directly. Procedural mesh build + `NPCAnimator` wiring (68–88) unchanged.

**`client/src/entities/NPCAnimator.ts`:** remove `GLTF_CLIP_MAP` import (2), `mixer`/`clips` fields (50–51), `setMixer` (69–77), `playGLTFClip` (155–162), the `mixer` branches in `setProfile` (81–83), `play` (110–113), `update` (127–131). All procedural emote/walk/idle/attack/talk methods stay untouched.

**`client/src/entities/NPCModels.ts`:** remove `NPC_MODEL_MAP` (6–16), `NPCModelRule`, `NPC_TYPE_MODEL_RULES` (42–58), `NPC_FALLBACK_MODELS` (60–65), `GLTF_CLIP_MAP` (68–73), `getNPCModelPath` (75–96), and the now-orphaned local `hashString` (148–155). **Keep** `NPCPlaceholderStyle` type, `getNPCPlaceholderStyle` + style rules + `getPlaceholderStyleFromId` (procedural styling). Update `client/src/__tests__/NPCModels.test.ts`: delete the `getNPCModelPath` describe block (keep any placeholder-style tests).

**`client/src/entities/PlayerSkins.ts`:** remove all skin exports — `PLAYER_SKINS`, `PlayerSkinId`, `PlayerSkinOption`, `isPlayerSkinId`, `getDefaultPlayerSkin`, `getPlayerSkinPath`, `getPlayerSkinOptions` (4–11,17–38). **Keep** `PLAYER_RACES`, `PlayerRace` (used by `client/src/meshes/players/index.ts`). `isPlayerRace` becomes unused → remove. Keep the filename to minimize churn (optional rename to `PlayerRaces.ts`).

**Thread the dropped `assetLoader` param** through callers so signatures stay consistent:
- `client/src/entities/EntityManager.ts` (17,25), `client/src/entities/NPCFactory.ts` (16), `client/src/debug/TerrainEditor.ts` (99), `client/src/terrain-editor.ts` (39): remove the `assetLoader` field/param/construction.
- `client/src/core/GameBootstrapper.ts`: remove `AssetLoader` import (20), `const assetLoader = new AssetLoader()` (81), and pass-throughs to `Player.create`/`EntityManager` (91,95).

**Dependencies:** `three` stays (everything uses it). `GLTFLoader`/`SkeletonUtils` come from `three/examples` — no `package.json` change needed.

---

## Verification

1. `make typecheck` — catches every dangling `skin`/`assetLoader`/GLTF reference (TS strict + `noUnusedLocals`). Fix until clean.
2. `make lint` — no unused imports/vars.
3. `make test` (Vitest + pytest) — update/confirm `MessageProtocol`, `NPCModels`, and player-state tests pass; `AssetLoader.test.ts` deleted.
4. Run both servers (`python -m uvicorn src.main:app --reload --port 8000`; `cd client && npm run dev`). Open http://localhost:5173:
   - Login shows Dark Portal background + a rotating 3D model of the selected race; switching faction/race updates the model live; **no skin cards**.
   - Enter world for each race → in-game character renders (procedural) and animates (walk/idle/run) correctly.
   - Spawn/approach NPCs → procedural meshes render and animate (idle/walk/attack/emote/talk); highlight on hover works.
   - Open a second browser tab, join → remote player renders + interpolates.
5. Server log clean on join (no skin KeyError / validation).
