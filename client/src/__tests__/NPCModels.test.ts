import { describe, expect, it } from 'vitest';
import { getNPCPlaceholderStyle } from '../entities/NPCModels';

describe('getNPCPlaceholderStyle', () => {
  it('prefers explicit ID overrides', () => {
    expect(getNPCPlaceholderStyle('merchant_01', 'Village Merchant')).toBe('merchant');
    expect(getNPCPlaceholderStyle('dragon_01', 'Whatever')).toBe('dragon');
    expect(getNPCPlaceholderStyle('eltito_01', 'El Tito')).toBe('orc');
    expect(getNPCPlaceholderStyle('nireg_jenkins', 'Nireg')).toBe('oracle');
  });

  it('maps type names to matching styles', () => {
    expect(getNPCPlaceholderStyle('citizen_12', 'Village Elder')).toBe('merchant');
    expect(getNPCPlaceholderStyle('citizen_14', 'Sentinel Scout')).toBe('guard');
    expect(getNPCPlaceholderStyle('citizen_15', 'Priestess of Elune')).toBe('healer');
    expect(getNPCPlaceholderStyle('citizen_16', 'Frostweaver Nyx')).toBe('cryomancer');
    expect(getNPCPlaceholderStyle('beast_09', 'Forest Spider')).toBe('spider');
  });

  it('falls back to monster for hostile NPCs without a type match', () => {
    expect(getNPCPlaceholderStyle('enemy_01', 'Odd Wanderer', 'hostile')).toBe('monster');
  });

  it('falls back to civilian for unknown, non-hostile NPCs', () => {
    expect(getNPCPlaceholderStyle('unknown_01', 'Odd Wanderer')).toBe('civilian');
  });

  it('is deterministic for the same inputs', () => {
    const first = getNPCPlaceholderStyle('unknown_02', 'Mystery Person');
    const second = getNPCPlaceholderStyle('unknown_02', 'Mystery Person');
    expect(first).toBe(second);
  });
});
