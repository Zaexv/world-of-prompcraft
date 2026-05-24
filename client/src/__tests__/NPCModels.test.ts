import { describe, expect, it } from 'vitest';
import { getNPCModelPath } from '../entities/NPCModels';

describe('getNPCModelPath', () => {
  it('prefers explicit ID overrides', () => {
    expect(getNPCModelPath('merchant_01', 'Village Merchant')).toBe('/models/npcs/merchant.glb');
  });

  it('maps type names to matching skins', () => {
    expect(getNPCModelPath('citizen_12', 'Village Elder')).toBe('/models/npcs/casual.glb');
    expect(getNPCModelPath('citizen_14', 'Sentinel Scout')).toBe('/models/npcs/warrior.glb');
    expect(getNPCModelPath('citizen_15', 'Priestess of Elune')).toBe('/models/npcs/healer.glb');
    expect(getNPCModelPath('citizen_16', 'Frostweaver Nyx')).toBe('/models/npcs/cryomancer.glb');
  });

  it('returns a deterministic fallback for unknown types', () => {
    const first = getNPCModelPath('unknown_01', 'Odd Wanderer');
    const second = getNPCModelPath('unknown_01', 'Odd Wanderer');
    expect(first).toBe(second);
    expect(first).toMatch(/^\/models\/npcs\/(casual|merchant|warrior|mage)\.glb$/);
  });
});
