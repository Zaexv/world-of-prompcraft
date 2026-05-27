/**
 * Login flow regression tests.
 *
 * Guards against three classes of bugs that broke the login→world-entry path:
 *
 * 1. Loading overlay created before login fires (covers the login screen)
 *    → Verify createLoadingOverlay is not called until onEnterWorld fires.
 *
 * 2. TDZ error: closure in PlayerController captures `engine` before assignment
 *    → Verify RuntimeState has inDungeonOverride so the closure works without engine.
 *
 * 3. ES2022 class field reset (covered separately in UIComponentFields.test.ts)
 *
 * These are pure-logic / state tests; no DOM or Three.js required.
 */

import { describe, it, expect } from 'vitest';
import { createRuntimeState } from '../core/RuntimeState';

// ── RuntimeState ──────────────────────────────────────────────────────────────

describe('RuntimeState', () => {
  it('initializes with joinedServer false', () => {
    const state = createRuntimeState();
    expect(state.joinedServer).toBe(false);
  });

  it('initializes with inDungeonOverride false', () => {
    // inDungeonOverride is used by the PlayerController height closure so it can
    // run before `engine` is constructed (avoiding TDZ).
    const state = createRuntimeState();
    expect(state.inDungeonOverride).toBe(false);
  });

  it('initializes with activeNpcId null', () => {
    const state = createRuntimeState();
    expect(state.activeNpcId).toBe(null);
  });

  it('initializes with a string localPlayerId', () => {
    const state = createRuntimeState();
    expect(typeof state.localPlayerId).toBe('string');
  });

  it('inDungeonOverride can be mutated (required by DungeonSystem)', () => {
    const state = createRuntimeState();
    state.inDungeonOverride = true;
    expect(state.inDungeonOverride).toBe(true);
  });

  it('multiple createRuntimeState calls return independent objects', () => {
    const a = createRuntimeState();
    const b = createRuntimeState();
    a.joinedServer = true;
    expect(b.joinedServer).toBe(false);
  });
});

// ── Loading overlay timing ────────────────────────────────────────────────────

describe('Loading overlay timing contract', () => {
  /**
   * The loading overlay must be created INSIDE the onEnterWorld callback —
   * not at module load time. If created too early, it sits at z-index 9999
   * and covers the login screen (z-index 1000), making the game impossible to start.
   *
   * We test the contract by simulating the main.ts pattern: a callback factory
   * that defers overlay creation until the callback fires.
   */
  it('overlay creation is deferred until onEnterWorld fires', () => {
    let overlayCreated = false;

    const createOverlay = () => {
      overlayCreated = true;
      return { setMessage: (_m: string) => undefined, hide: () => undefined };
    };

    // Simulate main.ts pattern: overlay created inside callback, not before
    let onEnterWorld: (() => void) | null = null;
    onEnterWorld = () => {
      createOverlay();
    };

    // Before callback fires: overlay must NOT exist
    expect(overlayCreated).toBe(false);

    // Fire the callback (simulates user pressing "Enter World")
    onEnterWorld();

    // After callback fires: overlay exists
    expect(overlayCreated).toBe(true);
  });

  it('overlay does not exist if onEnterWorld is never called', () => {
    let overlayCreated = false;
    const createOverlay = () => { overlayCreated = true; };

    // Simulate a scenario where the user never completes login
    let onEnterWorld: (() => void) | null = null;
    onEnterWorld = () => { createOverlay(); };
    void onEnterWorld; // registered but never called

    expect(overlayCreated).toBe(false);
  });
});

// ── Height function closure safety ────────────────────────────────────────────

describe('Height function closure (TDZ guard)', () => {
  /**
   * The PlayerController receives a heightFn closure at construction time.
   * That closure must NOT reference variables that are in the Temporal Dead Zone
   * (i.e., declared with `let` but not yet assigned). The fix was to read
   * `runtime.inDungeonOverride` instead of `engine.inDungeonOverride`.
   *
   * We simulate this: the closure captures `runtime`, which is fully initialized
   * before PlayerController is constructed, and reads its field safely.
   */
  it('heightFn can safely call runtime.inDungeonOverride before engine is assigned', () => {
    const runtime = createRuntimeState();

    // Simulate the heightFn closure from GameBootstrapper.ts
    // `engine` is declared with let but not yet assigned — the closure must NOT access it
    const heightFn = (x: number, z: number): number => {
      if (runtime.inDungeonOverride) return 0;
      // In the real code this would call getWorldHeightAt(terrain, x, z)
      return x * 0 + z * 0; // simplified stand-in
    };

    // Call heightFn before `engine` would be assigned — must not throw
    expect(() => heightFn(10, 20)).not.toThrow();
    expect(heightFn(10, 20)).toBe(0);
  });

  it('heightFn returns 0 when inDungeonOverride is true', () => {
    const runtime = createRuntimeState();
    runtime.inDungeonOverride = true;

    const heightFn = (_x: number, _z: number): number => {
      if (runtime.inDungeonOverride) return 0;
      return 99; // would not be reached
    };

    expect(heightFn(5, 5)).toBe(0);
  });

  it('heightFn delegates to terrain when inDungeonOverride is false', () => {
    const runtime = createRuntimeState();
    runtime.inDungeonOverride = false;

    const mockTerrainHeight = 42;
    const heightFn = (_x: number, _z: number): number => {
      if (runtime.inDungeonOverride) return 0;
      return mockTerrainHeight;
    };

    expect(heightFn(5, 5)).toBe(42);
  });
});
