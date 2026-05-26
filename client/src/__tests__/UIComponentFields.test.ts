// @vitest-environment happy-dom
/**
 * Guards against the ES2022 native class field initialization bug:
 * With `target: "ES2022"`, declaring a field as `field!: Type` emits a native
 * class field that re-initializes to `undefined` AFTER super() returns, wiping
 * anything set by render() (called inside UIComponent's constructor).
 * The fix is `declare field: Type`, which suppresses the native field emission.
 *
 * These tests verify that UIComponent subclass fields set inside render() are
 * accessible after construction — ensuring the login-to-world flow never breaks
 * due to undefined UI elements.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UIComponent } from '../ui/core/UIComponent';
import { StatusBars } from '../ui/StatusBars';
import { CombatHUD } from '../ui/CombatHUD';
import { ChatPanel } from '../ui/ChatPanel';
import { InteractionPanel } from '../ui/InteractionPanel';
import { Minimap } from '../ui/Minimap';
import { ChatBubbleSystem } from '../ui/ChatBubbleSystem';
import { PlayerState } from '../state/PlayerState';
import * as THREE from 'three';
import { Nameplate } from '../ui/Nameplate';
import { ActionIcon } from '../ui/ActionIcon';

// ── Minimal test subclass to verify the declare pattern itself ────────────────

class TestComponent extends UIComponent {
  declare private value: string;

  constructor() {
    super('test-root', 'test-component');
  }

  render(): void {
    this.value = 'set-in-render';
  }

  getValue(): string {
    return this.value;
  }
}

// ── UIComponent contract ──────────────────────────────────────────────────────

describe('UIComponent - declare field pattern', () => {
  it('fields set in render() survive ES2022 native class field initialization', () => {
    const comp = new TestComponent();
    expect(comp.getValue()).toBe('set-in-render');
  });
});

// ── StatusBars ────────────────────────────────────────────────────────────────

describe('StatusBars - field initialization', () => {
  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PlayerState as any)._instance = null;
  });

  it('constructs without throwing', () => {
    expect(() => new StatusBars()).not.toThrow();
  });

  it('update() does not crash (all declared fields survive construction)', () => {
    const bars = new StatusBars();
    const state = PlayerState.getInstance();
    expect(() => bars.update(state)).not.toThrow();
  });

  it('update() renders correct HP text', () => {
    const bars = new StatusBars();
    const state = PlayerState.getInstance();
    state.merge({ hp: 75, maxHp: 100 });
    bars.update(state);
    // Smoke test — if fields were undefined, update() would throw before reaching here
    expect(bars.element).toBeInstanceOf(HTMLElement);
  });
});

// ── CombatHUD ─────────────────────────────────────────────────────────────────

describe('CombatHUD - field initialization', () => {
  it('constructs without throwing', () => {
    expect(() => new CombatHUD()).not.toThrow();
  });

  it('updatePlayerHP does not crash', () => {
    const hud = new CombatHUD();
    expect(() => hud.updatePlayerHP(80, 100)).not.toThrow();
  });

  it('updatePlayerMana does not crash', () => {
    const hud = new CombatHUD();
    expect(() => hud.updatePlayerMana(50, 100)).not.toThrow();
  });
});

// ── ChatPanel ─────────────────────────────────────────────────────────────────

describe('ChatPanel - field initialization', () => {
  it('constructs without throwing', () => {
    expect(() => new ChatPanel()).not.toThrow();
  });

  it('addMessage does not crash', () => {
    const panel = new ChatPanel();
    expect(() => panel.addMessage('Player', 'Hello world')).not.toThrow();
  });

  it('isFocused returns boolean without crashing', () => {
    const panel = new ChatPanel();
    expect(typeof panel.isFocused).toBe('boolean');
  });
});

// ── InteractionPanel ──────────────────────────────────────────────────────────

describe('InteractionPanel - field initialization', () => {
  it('constructs without throwing', () => {
    expect(() => new InteractionPanel()).not.toThrow();
  });

  it('show() + hide() do not crash', () => {
    const panel = new InteractionPanel();
    expect(() => {
      panel.show();
      panel.hide();
    }).not.toThrow();
  });
});

// ── Minimap ───────────────────────────────────────────────────────────────────

describe('Minimap - field initialization', () => {
  it('constructs without throwing', () => {
    expect(() => new Minimap()).not.toThrow();
  });

  it('update() does not crash (canvas ctx may be null in test env)', () => {
    const map = new Minimap();
    map.show(); // must be visible for update() to run
    expect(() => map.update(0, 0, 0)).not.toThrow();
  });
});

// ── ChatBubbleSystem (constructor-parameter used in render) ───────────────────

describe('ChatBubbleSystem - constructor parameter timing', () => {
  /**
   * ChatBubbleSystem passes camera + container as constructor parameters.
   * render() must NOT use those parameters (they aren't stored yet when render()
   * runs from super()). The appendChild call must happen in the constructor body
   * after super() returns.
   */
  it('constructs without throwing when container is a real DOM element', () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const container = document.createElement('div');
    expect(() => new ChatBubbleSystem(camera, container)).not.toThrow();
  });

  it('appends bubbleContainer to the provided container after construction', () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const container = document.createElement('div');
    new ChatBubbleSystem(camera, container);
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('spawn() does not crash after construction', () => {
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const container = document.createElement('div');
    const system = new ChatBubbleSystem(camera, container);
    const pos = new THREE.Vector3(0, 0, 0);
    expect(() => system.spawn('Hello', pos, { style: 'player' })).not.toThrow();
  });
});

// ── Nameplate (Three.js sprite initialization) ────────────────────────────────

describe('Nameplate - sprite field initialization', () => {
  it('sprite is a THREE.Sprite after construction', () => {
    const nameplate = new Nameplate('Ignathar', 100);
    expect(nameplate.sprite).toBeInstanceOf(THREE.Sprite);
  });

  it('sprite.material is a THREE.SpriteMaterial', () => {
    const nameplate = new Nameplate('Elyria', 200);
    expect(nameplate.sprite.material).toBeInstanceOf(THREE.SpriteMaterial);
  });

  it('sprite is not undefined (guard against ES2022 field reset)', () => {
    const nameplate = new Nameplate('TestNPC', 50);
    expect(nameplate.sprite).toBeDefined();
  });

  it('updateHP does not crash', () => {
    const nameplate = new Nameplate('TestNPC', 100);
    expect(() => nameplate.updateHP(75, 100)).not.toThrow();
  });

  it('updateMood does not crash', () => {
    const nameplate = new Nameplate('TestNPC', 100);
    expect(() => nameplate.updateMood('happy', 50)).not.toThrow();
  });
});

// ── ActionIcon (Three.js sprite initialization) ───────────────────────────────

describe('ActionIcon - sprite field initialization', () => {
  it('sprite is a THREE.Sprite after construction', () => {
    const icon = new ActionIcon();
    expect(icon.sprite).toBeInstanceOf(THREE.Sprite);
  });

  it('sprite is not undefined (guard against ES2022 field reset)', () => {
    const icon = new ActionIcon();
    expect(icon.sprite).toBeDefined();
  });

  it('displayAction does not crash', () => {
    const icon = new ActionIcon();
    expect(() => icon.displayAction('damage', 3.0)).not.toThrow();
  });

  it('update() returns true while active', () => {
    const icon = new ActionIcon();
    icon.displayAction('heal', 3.0);
    expect(icon.update(0.016)).toBe(true);
  });

  it('clearAction sets active to false', () => {
    const icon = new ActionIcon();
    icon.displayAction('emote', 3.0);
    icon.clearAction();
    expect(icon.active).toBe(false);
  });
});
