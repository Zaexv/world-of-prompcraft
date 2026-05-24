# Skin plan

## Goal

Add 4 race-specific character skins as GLTF assets, and let the player choose one during login.

## What this means

- Each race keeps its own base model behavior.
- Each race gets 4 selectable skin variants.
- The selected skin is loaded from a GLTF path instead of being built only from procedural Three.js geometry.
- Other players should see the same skin through the network payload, not just locally.
- If a GLTF file is missing, the game should fall back to the current procedural model so the game still starts.

## How animation should work

Because these skins are characters, the GLTF files should be rigged models, not just static meshes.

The cleanest setup is:

- every skin exports the same bone layout
- every skin includes the same basic clips, like `idle`, `walk`, `run`, `swim`, and optionally `jump`
- the client uses `THREE.AnimationMixer` to play those clips instead of manually swinging legs and arms

That gives each skin its own visual identity while keeping the movement logic simple.

If a skin file does not include animation clips, the client should fall back to the current procedural animation so the character still moves correctly.

## Animation rule of thumb

The model files should own the look and animation of the character, while the game code owns *when* to play each animation state.

In practice that means:

- the game decides whether the player is idle, walking, running, or swimming
- the GLTF skin decides how that state looks on that character
- the code only swaps clips; it does not need to know the skeleton details of each race

## Proposed asset layout

Use a predictable path structure under `client/public/models/player/`:

- `/models/player/human/skin-1.glb`
- `/models/player/human/skin-2.glb`
- `/models/player/human/skin-3.glb`
- `/models/player/human/skin-4.glb`
- `/models/player/night_elf/skin-1.glb`
- `/models/player/orc/skin-1.glb`
- `/models/player/undead/skin-1.glb`

The exact filenames can stay consistent across races so the code only needs race + skin id to build the path.

## Code changes

### 1. Login screen

Add a skin selector below the race selector.

- When the user changes race, show that race’s 4 skins.
- When the user clicks a skin, store it as the selected skin.
- Pass `skin` along with `username`, `race`, and `faction` when entering the world.

### 2. Client state and bootstrap

Update the `PlayerState` and `main.ts` startup flow so the selected skin is stored alongside race/faction.

### 3. Player model loading

Replace the current “race only” player builder with a GLTF-aware loader:

- build the model path from `race` + `skin`
- load the GLTF with `AssetLoader`
- clone the GLTF scene for the player instance
- normalize scale / ground placement so all skins line up
- if the GLTF includes clips, bind them to an `AnimationMixer`
- map gameplay states like idle / walk / swim to matching clips
- keep the existing procedural race model as a fallback if the asset is unavailable

### 4. Remote players

Extend remote-player data to include `skin`, then render remote players with the same GLTF path.

### 5. Server sync

Add `skin` to:

- join request handling
- stored player data
- public player broadcast data

That keeps the skin visible to other clients after join/reconnect.

### 6. Types and tests

Update the shared message protocol types and add a small protocol test for the new field.

## Important implementation detail

GLTF player skins are not just textures; they can be full models. That means the loader should treat the skin asset as the visual root and still preserve:

- player movement transforms
- nameplates / overlays
- fallback behavior when assets are missing
- character animation clips and rigging

## Expected result

The player can pick one of 4 GLTF skins per race on the login screen, and the chosen skin is used for both the local character and remote player rendering.
