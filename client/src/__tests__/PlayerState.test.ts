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
    state.merge({
      hp: 80,
      mana: 30,
      inventory: [
        { name: 'Iron Sword', description: 'A blade.', rarity: 'uncommon', icon: '🗡️', quantity: 1 },
      ],
    });
    expect(state.hp).toBe(80);
    expect(state.inventory).toHaveLength(1);
    expect(state.inventory[0].name).toBe('Iron Sword');
    expect(state.inventory[0].rarity).toBe('uncommon');
  });

  it('addItem stacks duplicates by name', () => {
    state.addItem({ name: 'Health Potion', rarity: 'common', quantity: 1 });
    state.addItem({ name: 'Health Potion', rarity: 'common', quantity: 1 });
    expect(state.inventory).toHaveLength(1);
    expect(state.inventory[0].quantity).toBe(2);
  });

  it('addItem normalizes a bare string name', () => {
    state.addItem('Mysterious Trinket');
    expect(state.inventory[0].name).toBe('Mysterious Trinket');
    expect(state.inventory[0].rarity).toBe('common');
    expect(state.inventory[0].quantity).toBe(1);
  });

  it('inventoryNames expands quantities into a flat list', () => {
    state.addItem({ name: 'Bread', quantity: 1 });
    state.addItem({ name: 'Bread', quantity: 1 });
    expect(state.inventoryNames()).toEqual(['Bread', 'Bread']);
  });
});
