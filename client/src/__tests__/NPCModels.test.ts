import { describe, expect, it } from 'vitest';
import { getNPCPlaceholderStyle } from '../entities/NPCModels';

describe('getNPCPlaceholderStyle', () => {
  it('prefers explicit ID overrides', () => {
    expect(getNPCPlaceholderStyle('merchant_01', 'Some Name')).toBe('merchant');
    expect(getNPCPlaceholderStyle('dragon_01', 'Some Name')).toBe('dragon');
    expect(getNPCPlaceholderStyle('mage_02', 'Some Name')).toBe('pyromancer');
    expect(getNPCPlaceholderStyle('mage_03', 'Some Name')).toBe('cryomancer');
    expect(getNPCPlaceholderStyle('nireg_jenkins', 'Some Name')).toBe('oracle');
    expect(getNPCPlaceholderStyle('eltito_01', 'Some Name')).toBe('orc');
  });

  it('maps name keywords to distinct skins', () => {
    expect(getNPCPlaceholderStyle('npc_1', 'Village Elder')).toBe('merchant');
    expect(getNPCPlaceholderStyle('npc_2', 'Sentinel Scout')).toBe('guard');
    expect(getNPCPlaceholderStyle('npc_3', 'Priestess of Elune')).toBe('healer');
    expect(getNPCPlaceholderStyle('npc_4', 'Frostweaver Nyx')).toBe('cryomancer');
    expect(getNPCPlaceholderStyle('npc_5', 'Ember the Pyromancer')).toBe('pyromancer');
    expect(getNPCPlaceholderStyle('npc_6', 'Ancient Wyrm')).toBe('dragon');
    expect(getNPCPlaceholderStyle('npc_7', 'Wandering Wraith')).toBe('undead');
  });

  it('falls back to monster for unmatched hostile enemies', () => {
    expect(getNPCPlaceholderStyle('enemy_01', 'Odd Creature', 'hostile')).toBe('monster');
  });

  it('falls back to civilian for unmatched neutral NPCs', () => {
    expect(getNPCPlaceholderStyle('npc_8', 'Odd Wanderer')).toBe('civilian');
  });

  it('is deterministic for the same input', () => {
    const first = getNPCPlaceholderStyle('npc_9', 'Mysterious Figure');
    const second = getNPCPlaceholderStyle('npc_9', 'Mysterious Figure');
    expect(first).toBe(second);
  });
});
