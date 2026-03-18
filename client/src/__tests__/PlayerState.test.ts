import { describe, it, expect, beforeEach } from 'vitest';
import { PlayerState } from '../state/PlayerState';

describe('PlayerState', () => {
  let state: PlayerState;

  beforeEach(() => {
    // Reset singleton for each test
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (PlayerState as any)._instance = null;
    state = PlayerState.getInstance();
  });

  it('returns singleton instance', () => {
    const s1 = PlayerState.getInstance();
    const s2 = PlayerState.getInstance();
    expect(s1).toBe(s2);
  });

  it('has default HP values', () => {
    expect(state.hp).toBe(100);
    expect(state.maxHp).toBe(100);
  });

  it('takeDamage reduces HP', () => {
    state.takeDamage(30);
    expect(state.hp).toBe(70);
  });

  it('takeDamage floors at 0', () => {
    state.takeDamage(999);
    expect(state.hp).toBe(0);
  });

  it('isDead is true when HP reaches 0', () => {
    state.takeDamage(100);
    expect(state.isDead).toBe(true);
  });

  it('merge updates state from server', () => {
    state.merge({ hp: 80, mana: 30, inventory: ['Sword'] });
    expect(state.hp).toBe(80);
  });
});
