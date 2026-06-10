// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { ZoneTracker, getZoneAt, ZONES, LOCALE_DISCS } from '../systems/ZoneTracker';

// The radial zone model is deterministic without a world manifest (it falls back
// to the default biome constants), so these run pure.

describe('getZoneAt — radial non-overlapping zones', () => {
  it('resolves the central hub disc', () => {
    expect(getZoneAt(0, 0)).toBe('Makaleta Strande');
  });

  it('resolves outer ring sectors by direction', () => {
    expect(getZoneAt(300, 0)).toBe('Blasted Suarezlands'); // east
    expect(getZoneAt(0, 300)).toBe('Crystal Tundra');      // north
    expect(getZoneAt(0, -300)).toBe('Moin Swamps');        // south
    expect(getZoneAt(-350, -350)).toBe('Malaka Area');     // sw, clear of Fort Malaka disc
    expect(getZoneAt(-212, 212)).toBe('Tanis Desert');     // north-west
  });

  it('resolves the Fort Malaka locale disc carved out of the SW sector', () => {
    expect(getZoneAt(-210, -260)).toBe('Fort Malaka');
  });

  it('is a clean partition — every sampled point maps to a known zone', () => {
    const known = new Set(ZONES.map((z) => z.name));
    known.add('Teldrassil Wilds');
    for (let x = -600; x <= 600; x += 25) {
      for (let z = -600; z <= 600; z += 25) {
        expect(known.has(getZoneAt(x, z))).toBe(true);
      }
    }
  });

  it('keeps locale discs from overlapping each other', () => {
    for (let i = 0; i < LOCALE_DISCS.length; i++) {
      for (let j = i + 1; j < LOCALE_DISCS.length; j++) {
        const a = LOCALE_DISCS[i]!;
        const b = LOCALE_DISCS[j]!;
        const dist = Math.hypot(a.x - b.x, a.z - b.z);
        expect(dist).toBeGreaterThanOrEqual(a.radius + b.radius);
      }
    }
  });

  it('every ZONES entry has a unique name and a finite label anchor', () => {
    const names = ZONES.map((z) => z.name);
    expect(new Set(names).size).toBe(names.length);
    for (const z of ZONES) {
      expect(Number.isFinite(z.labelX)).toBe(true);
      expect(Number.isFinite(z.labelZ)).toBe(true);
    }
  });
});

describe('ZoneTracker', () => {
  it('fires onZoneChange only when the zone actually changes', () => {
    const tracker = new ZoneTracker();
    const onChange = vi.fn();
    tracker.onZoneChange = onChange;

    tracker.update(0, 0); // Makaleta Strande
    tracker.update(5, 5); // still inside central disc — no new event
    tracker.update(300, 0); // Blasted Suarezlands

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange).toHaveBeenNthCalledWith(1, 'Makaleta Strande', expect.any(String));
    expect(onChange).toHaveBeenNthCalledWith(2, 'Blasted Suarezlands', expect.any(String));
    expect(tracker.getCurrentZone()).toBe('Blasted Suarezlands');
  });

  it('forceZone overrides the current zone (dungeon interiors)', () => {
    const tracker = new ZoneTracker();
    const onChange = vi.fn();
    tracker.onZoneChange = onChange;
    tracker.forceZone('The Drowned Crypt', 'A dripping vault.');
    expect(tracker.getCurrentZone()).toBe('The Drowned Crypt');
    expect(onChange).toHaveBeenCalledWith('The Drowned Crypt', 'A dripping vault.');
  });
});
