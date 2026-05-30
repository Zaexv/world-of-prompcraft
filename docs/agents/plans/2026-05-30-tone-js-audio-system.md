---
date: 2026-05-30T12:00:00Z
git_commit: HEAD
branch: main
topic: "Tone.js Sound Effects & AI Music System"
tags: [plan, audio, tonejs, sound, music]
status: draft
---

# Tone.js Sound Effects & AI Music System

## Overview

Add a complete audio system to World of Promptcraft using **Tone.js** for synthesised sound effects (no audio files needed) and procedurally-generated background music driven by zone context and game events. The system connects to the existing (but un-wired) audio asset paths and volume settings UI.

## Current State Analysis

- **No audio library** exists in `client/package.json`
- `AssetPaths.ts:59-72` defines audio paths (`ambient.mp3`, `ui/click.mp3`, `combat/hit.mp3`, etc.) but **they are never loaded or played**
- `ToastPanel.ts:21-26` renders volume sliders (Master/Music/SFX) but **settings are never consumed**
- `ReactionSystem.ts:206-375` processes every game action (damage, heal, spawn_effect, emote, etc.) with **purely visual effects** — no audio
- `ZoneAtmosphere.ts` manages per-zone fog/lighting transitions but **no zone-based audio**
- `MessageProtocol.ts:188-201` defines the `Action` type — no `play_sound` action kind exists
- No server-side audio generation or music composition tooling exists

### Key Discoveries:
- `ReactionSystem.ts:206-375` — the `processAction()` switch is the ideal hook for per-action sound triggers
- `ZoneAtmosphere.ts:11-28` — `AtmospherePreset` interface can be extended with an `ambientTrack` property
- `GameEngine.ts:311` — `reactionSystem.tick(delta)` called every frame; audio system can share this pattern
- `ToastPanel.ts:178-195` — volume changes are read from range sliders and stored in `GameSettings` but never wired
- `AssetPaths.ts:60-71` — audio paths are defined but unused; with Tone.js synthesis we don't need them
- `WebSocketHandler.ts:192-298` — `agent_response` handler is the entry point for NPC-driven actions including sound
- `GameBootstrapper.ts:105` — `new ReactionSystem(...)` is where the audio system would be initialized alongside

## Desired End State

After this plan is complete:

1. Tone.js is installed and an `AudioSystem` class manages all game audio
2. Sound effects play for every action kind: damage (hit sounds), heal, item give/take, emote, spell effects (fire/ice/lightning), quest events, UI interactions
3. Zone-based ambient music transitions smoothly as the player walks between zones
4. The Settings panel volume sliders actually control audio levels
5. A new `play_music` action kind allows NPC agents to trigger music changes via the LLM
6. Server-side NPC tool for generating music descriptions that the client can synthesise
7. All lint/typecheck/test pass

### UI Mockups

*No new UI is needed — the existing Settings panel already has volume sliders.*

### What We're NOT Doing

- Not loading actual `.mp3`/`.wav` audio files — everything is synthesised via Tone.js
- Not adding microphone/voice input
- Not adding positional 3D audio (stereo ambient is sufficient for v1)
- Not adding a full music composition engine — zone ambient is generative but simple (pads/drones/arp patterns)
- Not modifying the server's `npc_agent.py` architecture — only adding a new tool

## Implementation Approach

**Two-layer architecture:**

1. **`AudioSystem`** (client singleton) — wraps Tone.js, provides:
   - `playSfx(name)` — one-shot synthesised sound effects
   - `setZoneMusic(zone)` — crossfade zone ambient music
   - Volume controls wired to `GameSettings`
   - `init()` — resumes AudioContext on first user gesture

2. **`SoundReactionSystem`** — thin integration layer that maps game actions to sound calls. Extends `ReactionSystem` rather than replacing it.

**No audio files needed.** Tone.js synthesizers generate everything:
- `hit` → short noise burst + low sine
- `heal` → ascending sine arpeggio
- `fire` → noise + filter sweep
- `ice` → high-pitched glassy tone
- `lightning` → crackling noise
- `ui_click` → short tick
- `quest_start` → fanfare (major chord)
- `zone_ambient` → evolving pad + bass drone

## Architecture and Code Reuse

```
client/src/
  audio/
    AudioSystem.ts        # Core Tone.js wrapper (singleton)
    effects.ts            # Synthesised sound effect definitions
    music.ts              # Zone ambient music generators
    index.ts              # Re-exports
  systems/
    ReactionSystem.ts     # MODIFIED — add sound triggers to processAction()
  config/
    AssetPaths.ts         # Minor — now unused audio paths can be removed
  ui/
    screens/
      ToastPanel.ts       # MODIFIED — wire volume sliders to AudioSystem
```

### Third-party library
- `tone` (Tone.js v15+) — Web Audio framework for synthesis

## Phase 1: Install Tone.js + Create AudioSystem Core

### Overview
Install Tone.js and build the foundational `AudioSystem` singleton that manages the AudioContext, master gain, and sub-mix buses.

### Changes Required:

#### [ ] 1. Install Tone.js
```bash
cd client && npm install tone
```

#### [ ] 2. Create `client/src/audio/AudioSystem.ts`
**File**: `client/src/audio/AudioSystem.ts` (new)
**Changes**: Core singleton managing Tone.js AudioContext, master gain, SFX bus, music bus, volume controls.

```typescript
import * as Tone from 'tone';

export interface AudioConfig {
  masterVolume: number;  // 0-1
  musicVolume: number;   // 0-1
  sfxVolume: number;     // 0-1
}

export class AudioSystem {
  private static instance: AudioSystem;
  
  private masterGain: Tone.Gain;
  private sfxGain: Tone.Gain;
  private musicGain: Tone.Gain;
  private currentMusic: Tone.Player | Tone.Synth | null = null;
  
  private config: AudioConfig = {
    masterVolume: 0.8,
    musicVolume: 0.7,
    sfxVolume: 0.8,
  };
  
  static getInstance(): AudioSystem { ... }
  
  async init(): Promise<void> { ... }  // resume AudioContext
  setMasterVolume(v: number): void { ... }
  setSfxVolume(v: number): void { ... }
  setMusicVolume(v: number): void { ... }
  playSfx(name: string): void { ... }
  setZoneMusic(zone: string): void { ... }
  playMusicSequence(notes: NoteDef[]): void { ... }  // for AI-generated music
  dispose(): void { ... }
}
```

#### [ ] 3. Create `client/src/audio/effects.ts`
**File**: `client/src/audio/effects.ts` (new)
**Changes**: Map of synthesised sound effect definitions keyed by name.

```typescript
import * as Tone from 'tone';

export interface SfxDefinition {
  play: (volume?: number) => void;
}

export const SFX: Record<string, SfxDefinition> = {
  hit: { play: () => { /* noise burst + low sine */ } },
  heal: { play: () => { /* ascending arpeggio */ } },
  fire: { play: () => { /* noise + filter sweep */ } },
  ice: { play: () => { /* glassy high tone */ } },
  lightning: { play: () => { /* crackling noise */ } },
  sparkle: { play: () => { /* high chime */ } },
  explosion: { play: () => { /* low rumble + noise */ } },
  ui_click: { play: () => { /* short tick */ } },
  ui_hover: { play: () => { /* subtle rise */ } },
  ui_alert: { play: () => { /* warning tone */ } },
  quest_start: { play: () => { /* major chord fanfare */ } },
  quest_complete: { play: () => { /* triumphant chord */ } },
  item_pickup: { play: () => { /* bright ping */ } },
  emote: { play: () => { /* short flourish */ } },
  footstep: { play: () => { /* soft thud */ } },
};
```

#### [ ] 4. Create `client/src/audio/music.ts`
**File**: `client/src/audio/music.ts` (new)
**Changes**: Zone-to-music definitions and ambient music generators.

```typescript
import * as Tone from 'tone';

export interface ZoneMusicDef {
  rootNote: string;       // e.g. "C2"
  scale: string[];        // e.g. ["C", "D", "E", "G", "A"]
  bpm: number;
  padType: 'warm' | 'bright' | 'dark' | 'airy';
  arpSpeed: 'slow' | 'medium' | 'fast';
  bassOctave: number;
}

export const ZONE_MUSIC: Record<string, ZoneMusicDef> = {
  "Elders' Village": { rootNote: "C2", scale: ["C","D","E","G","A"], bpm: 60, padType: 'warm', arpSpeed: 'slow', bassOctave: 2 },
  "Dark Forest":     { rootNote: "A2", scale: ["A","C","D","E","G"], bpm: 50, padType: 'dark', arpSpeed: 'slow', bassOctave: 1 },
  "Ember Peaks":     { rootNote: "D2", scale: ["D","E","F#","A","B"], bpm: 70, padType: 'bright', arpSpeed: 'medium', bassOctave: 2 },
  // ... etc for all zones
};
```

#### [ ] 5. Create `client/src/audio/index.ts`
**File**: `client/src/audio/index.ts` (new)
**Changes**: Re-exports.

```typescript
export { AudioSystem } from './AudioSystem';
export { SFX } from './effects';
export { ZONE_MUSIC, type ZoneMusicDef } from './music';
```

### Success Criteria:
- [ ] `npm install tone` succeeds
- [ ] TypeScript compiles without errors: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

---

## Phase 2: Wire Sound Effects into ReactionSystem

### Overview
Add sound triggers to every branch of the `processAction()` switch in `ReactionSystem.ts`. Also add sound triggers for UI interactions (panel open, click, etc.).

### Changes Required:

#### [ ] 1. Wire action → sound in ReactionSystem
**File**: `client/src/systems/ReactionSystem.ts`
**Changes**: In the constructor, accept an `AudioSystem` reference. In each `case` branch of `processAction()`, call `this.audio.playSfx(...)`.

```typescript
// Constructor
constructor(
  scene: THREE.Scene,
  playerState: PlayerState,
  npcStateStore: NPCStateStore,
  worldState: WorldState,
  entityManager: EntityManagerLike,
  audioSystem?: AudioSystem,  // NEW: optional for backward compat
) {
  // ...
  this.audio = audioSystem ?? null;
}

// Each action case gets a sound:
case "damage":
  this.audio?.playSfx("hit");
  // ...existing code...

case "heal":
  this.audio?.playSfx("heal");
  // ...existing code...

case "spawn_effect": {
  const resolvedType = effectType ?? effect_type ?? "sparkle";
  this.audio?.playSfx(resolvedType);  // maps to fire/ice/lightning/etc names
  // ...existing code...

case "start_quest":
  this.audio?.playSfx("quest_start");
  // ...existing code...

case "complete_quest":
  this.audio?.playSfx("quest_complete");
  // ...existing code...

case "give_item":
  this.audio?.playSfx("item_pickup");
  // ...existing code...

case "emote":
  this.audio?.playSfx("emote");
  // ...existing code...
```

#### [ ] 2. Wire AudioSystem into GameBootstrapper
**File**: `client/src/core/GameBootstrapper.ts`
**Changes**: After creating `sceneManager`, initialize `AudioSystem`. Pass it to `ReactionSystem`. Also wire UI sounds for the interaction panel and chat.

```typescript
import { AudioSystem } from '../audio';

// After sceneManager initialization:
const audioSystem = AudioSystem.getInstance();
audioSystem.init();  // Tone.js will resume on user gesture

// Pass to reactionSystem:
const reactionSystem = new ReactionSystem(scene, playerState, npcStateStore, worldState, entityManager, audioSystem);
```

#### [ ] 3. Wire volume sliders in ToastPanel
**File**: `client/src/ui/screens/ToastPanel.ts`
**Changes**: In `handleSave()`, pass volume settings to `AudioSystem.getInstance()`.

```typescript
private handleSave(): void {
  const audio = AudioSystem.getInstance();
  audio.setMasterVolume(this.settings.masterVolume);
  audio.setMusicVolume(this.settings.musicVolume);
  audio.setSfxVolume(this.settings.sfxVolume);
  this.onSaveCallback?.(this.settings);
  this.hide();
}
```

Also add immediate slider feedback — on `input` events, update the audio system in real-time rather than waiting for Save.

#### [ ] 4. Wire zone-based music in ZoneAtmosphere
**File**: `client/src/systems/ZoneAtmosphere.ts`
**Changes**: When `enterZone()` is called, also set the zone music in `AudioSystem`.

```typescript
enterZone(zoneName: string): void {
  this.target = ZONE_ATMOSPHERES[zoneName] ?? DEFAULT_PRESET;
  AudioSystem.getInstance().setZoneMusic(zoneName);
}
```

### Success Criteria:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Tests pass: `npm run test`

---

## Phase 3: Music Action Kind + Server Tool

### Overview
Add a `play_music` action kind to the protocol that allows NPC agents to trigger music changes. Add a server-side LangGraph tool that NPCs can call to compose music descriptions, which the client translates to Tone.js sequences.

### Changes Required:

#### [ ] 1. Add play_music action to MessageProtocol
**File**: `client/src/network/MessageProtocol.ts`
**Changes**: Add `PlayMusicParams` interface and `play_music` to the `Action` union.

```typescript
export interface PlayMusicParams {
  /** Musical mode/scene — e.g. "battle", "mystery", "celebration", "sadness" */
  mood: string;
  /** Optional notes sequence for the AI to specify */
  notes?: Array<{ note: string; duration: string; time: number }>;
  /** Duration in seconds (0 = play once, >0 = crossfade and play for N seconds) */
  duration?: number;
}

export type Action =
  // ... existing actions ...
  | { kind: "play_music"; params: PlayMusicParams };
```

Also add corresponding server-side Python type in `server/src/agents/tools/`.

#### [ ] 2. Handle play_music in ReactionSystem
**File**: `client/src/systems/ReactionSystem.ts`
**Changes**: Add a `case "play_music"` branch.

```typescript
case "play_music": {
  const { mood, notes, duration } = action.params;
  if (notes && notes.length > 0) {
    this.audio?.playMusicSequence(notes);
  } else {
    // Map mood to a zone music preset or play a special sequence
    this.audio?.playMoodMusic(mood, duration);
  }
  break;
}
```

#### [ ] 3. Add playMoodMusic to AudioSystem
**File**: `client/src/audio/AudioSystem.ts`
**Changes**: Add `playMoodMusic(mood: string, duration?: number)` method.

```typescript
playMoodMusic(mood: string, duration?: number): void {
  // mood → musical parameters (tempo, scale, instruments)
  // e.g. "battle" → fast arp, aggressive bass, percussion
  // e.g. "mystery" → slow, sparse, dissonant
  // e.g. "celebration" → major scale, fast, bright
  // e.g. "sadness" → slow minor, sparse
}
```

#### [ ] 4. Create server-side compose_music tool
**File**: `server/src/agents/tools/music.py` (new)
**Changes**: Add a `compose_music_tool` that NPCs can call to generate music descriptions.

```python
"""Tool for NPC agents to compose music descriptions sent to the client."""

from __future__ import annotations

from langchain_core.tools import tool


def create_compose_music_tool(pending_actions: list[dict]) -> callable:
    @tool
    def compose_music(
        mood: str,
        description: str,
        duration: int = 30,
        tempo: int = 120,
        scale: str = "C_major",
    ) -> str:
        """Compose background music for the current scene. Call when the atmosphere should change dramatically.

        Args:
            mood: The emotional quality (battle, mystery, celebration, sadness, tension, triumph, exploration)
            description: A short description of what the music should convey
            duration: How long the music should play in seconds (default 30)
            tempo: Beats per minute (default 120)
            scale: Musical scale (C_major, A_minor, D_dorian, etc.)
        """
        pending_actions.append({
            "kind": "play_music",
            "params": {
                "mood": mood,
                "description": description,
                "duration": duration,
                "tempo": tempo,
                "scale": scale,
            },
        })
        return f"Playing {mood} music: {description}"
    
    return compose_music
```

#### [ ] 5. Register compose_music tool in NPC agent
**File**: `server/src/agents/npc_agent.py`
**Changes**: Import and bind the `compose_music_tool` in the tool list.

**File**: `server/src/agents/tools/__init__.py`
**Changes**: Add `music` module import.

### Success Criteria:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint` (client + server)
- [ ] Python typecheck passes: `mypy`
- [ ] pytest passes: `pytest`

---

## Phase 4: UI Sounds + Polish

### Overview
Add subtle UI sound effects for common interactions: opening panels, clicking buttons, hover, error states. Add footstep sounds for player walking.

### Changes Required:

#### [ ] 1. Wire UI sounds in UIManager
**File**: `client/src/ui/UIManager.ts`
**Changes**: Add sound triggers for panel open/close, button clicks, etc.

```typescript
openInteractionPanel(...): void {
  AudioSystem.getInstance().playSfx("ui_click");
  // ...existing code...
}

openInventory(...): void {
  AudioSystem.getInstance().playSfx("ui_click");
  // ...existing code...
}
```

#### [ ] 2. Add footstep sounds
**File**: `client/src/entities/PlayerController.ts`
**Changes**: In the movement update, play footstep sounds at intervals when `isMoving` and `isGrounded`.

```typescript
private footstepTimer = 0;

// In update():
if (this.isMoving && this.isGrounded) {
  this.footstepTimer += delta;
  if (this.footstepTimer > 0.5) {  // every 500ms
    this.footstepTimer = 0;
    AudioSystem.getInstance().playSfx("footstep");
  }
} else {
  this.footstepTimer = 0;
}
```

#### [ ] 3. Add death/respawn sounds
**File**: `client/src/core/GameEngine.ts`
**Changes**: In `onDeath` callback and `onRespawn` callback, play appropriate sounds.

### Success Criteria:
- [ ] TypeScript compiles: `npm run typecheck`
- [ ] Linting passes: `npm run lint`
- [ ] Tests pass: `npm run test`

---

## Phase 5: Verify & Polish

### Overview
Run all checks, verify no regressions, and ensure the audio system is production-ready.

### Changes Required:

#### [ ] 1. Run full check suite
```bash
cd client && npm run check
cd server && make check
```

#### [ ] 2. Add unit tests for AudioSystem
**File**: `client/src/__tests__/AudioSystem.test.ts` (new)
**Changes**: Test volume methods, SFX play calls, zone music setting.

#### [ ] 3. Add unit test for new play_music action
**File**: `client/src/__tests__/MessageProtocol.test.ts`
**Changes**: Verify serialization of the new Action kind.

### Success Criteria:
- [ ] `npm run check` passes for client
- [ ] `make check` or equivalent passes for server
- [ ] Tests cover AudioSystem singleton, volume control, SFX mapping
- [ ] No regressions in existing tests

---

## Testing Strategy

### Unit Tests:
- `AudioSystem` — setVolume, getVolume, SFX dispatch doesn't throw
- `effects.ts` — all SFX definitions exist and `play()` doesn't throw
- `ReactionSystem` — play_music action dispatch calls audio.playMusicSequence
- `MessageProtocol` — play_music action serializes correctly

### Integration Tests:
- NPC agent with compose_music tool generates a play_music action
- Action flows from server → WebSocket → ReactionSystem → AudioSystem

### Manual Testing Steps:
1. Open game — background music should start based on starting zone
2. Walk around — ambient music should crossfade at zone boundaries
3. Click an NPC — UI click sound + NPC interaction sounds
4. Get attacked by an NPC — hit sound effect plays
5. Use a health potion — heal sound plays
6. Open/close inventory — UI click sounds
7. Complete a quest — quest fanfare plays
8. Adjust volume sliders in Settings — audio levels change
9. NPC casts a fire/ice/lightning spell — appropriate sound effect plays

## Performance Considerations

- Tone.js uses the Web Audio API which runs on a separate audio thread — no main-thread overhead
- Synthesised sounds use negligible memory compared to audio files
- Ambient music uses 2-3 oscillators max — CPU cost is minimal
- AudioContext is created once and suspended/resumed — no repeated allocation
- All Tone.js nodes are disposed when zone music changes

## References

- Tone.js docs: https://tonejs.github.io/
- Existing settings panel: `client/src/ui/screens/ToastPanel.ts:21-26`
- Action dispatch: `client/src/systems/ReactionSystem.ts:206-375`
- Zone system: `client/src/systems/ZoneAtmosphere.ts:59-72`
- Game bootstrapper: `client/src/core/GameBootstrapper.ts:105`
- Game engine loop: `client/src/core/GameEngine.ts:311`
- Asset paths (unused audio): `client/src/config/AssetPaths.ts:59-72`
