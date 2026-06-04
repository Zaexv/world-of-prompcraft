import { describe, expect, it, vi, beforeEach } from 'vitest';
import { resolveAppearance } from '../entities/npc/NPCAppearanceResolver';
import { hashString } from '../entities/NPCModels';

// Mock the MeshRegistry so tests don't need THREE.js
vi.mock('../meshes/core/MeshRegistry', () => ({
  hasMesh: vi.fn((type: string): boolean => {
    const REGISTERED = new Set([
      'npc_individual_nireg_jenkins',
      'npc_individual_aurelia_trader',
      'npc_style_civilian',
      'npc_style_merchant',
      'npc_style_guard',
      'npc_style_healer',
      'npc_style_mage',
      'npc_style_oracle',
      'npc_style_dragon',
      'npc_style_monster',
      'npc_style_orc',
      'npc_style_undead',
      'npc_style_spider',
      'npc_style_wasp',
      'npc_style_wolf',
      'npc_style_boar',
      'npc_style_golem',
      'npc_style_pyromancer',
      'npc_style_cryomancer',
      'npc_style_sage',
    ]);
    return REGISTERED.has(type);
  }),
}));

describe('resolveAppearance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('priority 1 — explicit appearance.mesh beats everything', () => {
    const spec = resolveAppearance({
      id: 'nireg_jenkins',
      name: 'Nireg Jenkins',
      appearance: { mesh: 'npc_individual_nireg_jenkins' },
    });
    expect(spec.meshType).toBe('npc_individual_nireg_jenkins');
  });

  it('priority 1 — falls through if mesh not registered', () => {
    const spec = resolveAppearance({
      id: 'some_npc',
      name: 'Some NPC',
      appearance: { mesh: 'npc_individual_unknown_xyz' },
    });
    // falls to priority 2 or lower — should NOT use the unregistered mesh
    expect(spec.meshType).not.toBe('npc_individual_unknown_xyz');
  });

  it('priority 2 — per-id individual mesh wins over style and inference', () => {
    const spec = resolveAppearance({
      id: 'nireg_jenkins',
      name: 'Nireg Jenkins',
      style: 'merchant',
    });
    expect(spec.meshType).toBe('npc_individual_nireg_jenkins');
  });

  it('priority 3 — explicit style used when individual not registered', () => {
    const spec = resolveAppearance({
      id: 'some_guard_01',
      name: 'City Guard',
      style: 'guard',
    });
    expect(spec.meshType).toBe('npc_style_guard');
  });

  it('priority 4 — keyword inference from name', () => {
    const spec = resolveAppearance({
      id: 'npc_a',
      name: 'Village Merchant',
    });
    expect(spec.meshType).toBe('npc_style_merchant');
  });

  it('priority 4 — hostile behavior falls back to monster', () => {
    const spec = resolveAppearance({
      id: 'mystery_01',
      name: 'Odd Wanderer',
      behavior: 'hostile',
    });
    expect(spec.meshType).toBe('npc_style_monster');
  });

  it('priority 4 — unknown name and no behavior → civilian', () => {
    const spec = resolveAppearance({
      id: 'unknown_01',
      name: 'Odd Wanderer',
    });
    expect(spec.meshType).toBe('npc_style_civilian');
  });

  it('seed is stable — same id always yields same seed', () => {
    const a = resolveAppearance({ id: 'nireg_jenkins', name: 'Nireg Jenkins' });
    const b = resolveAppearance({ id: 'nireg_jenkins', name: 'Nireg Jenkins' });
    expect(a.seed).toBe(b.seed);
  });

  it('seed differs between distinct ids', () => {
    const a = resolveAppearance({ id: 'npc_a', name: 'Alpha' });
    const b = resolveAppearance({ id: 'npc_b', name: 'Beta' });
    expect(a.seed).not.toBe(b.seed);
  });

  it('seed matches hashString(id) directly', () => {
    const id = 'guard_01';
    const spec = resolveAppearance({ id, name: 'Guard' });
    expect(spec.seed).toBe(hashString(id));
  });

  it('same identity produces the same spec regardless of call order', () => {
    const identity = { id: 'merchant_01', name: 'Trader', style: 'merchant' };
    const first = resolveAppearance(identity);
    const second = resolveAppearance(identity);
    expect(first.meshType).toBe(second.meshType);
    expect(first.seed).toBe(second.seed);
  });

  it('passes palette override through from appearance', () => {
    const palette = { body: 0xff0000 };
    const spec = resolveAppearance({
      id: 'guard_01',
      name: 'Guard',
      appearance: { mesh: 'npc_style_guard', palette },
    });
    expect(spec.palette).toEqual(palette);
  });

  it('passes scale override through from appearance', () => {
    const spec = resolveAppearance({
      id: 'dragon_01',
      name: 'Dragon',
      appearance: { mesh: 'npc_style_dragon', scale: 2.5 },
    });
    expect(spec.scale).toBe(2.5);
  });
});
