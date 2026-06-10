import { describe, it, expect } from 'vitest';
import {
  isTeleportType,
  registerTeleportType,
  teleportTypes,
  safeArrivalXZ,
} from '../systems/TeleportRegistry';

describe('TeleportRegistry', () => {
  it('accepts curated destination landmark types', () => {
    expect(isTeleportType('tower')).toBe(true);
    expect(isTeleportType('moonwell')).toBe(true);
    expect(isTeleportType('biome_volcano')).toBe(true);
  });

  it('rejects decorative props', () => {
    expect(isTeleportType('malaka_palmtree')).toBe(false);
    expect(isTeleportType('biome_prop_forest_grass')).toBe(false);
    expect(isTeleportType('lantern')).toBe(false);
    expect(isTeleportType('biome_market_stall')).toBe(false);
  });

  it('is modular — a module can register a new destination type', () => {
    expect(isTeleportType('custom_obelisk')).toBe(false);
    registerTeleportType('custom_obelisk');
    expect(isTeleportType('custom_obelisk')).toBe(true);
    expect(teleportTypes()).toContain('custom_obelisk');
  });
});

describe('safeArrivalXZ — arrive clear of the mesh footprint', () => {
  it('pulls the arrival point toward origin by footprint radius + margin', () => {
    // Landmark due east at x=200, footprint radius 6 → clearance 9.
    const a = safeArrivalXZ(200, 0, 6);
    expect(a.x).toBeCloseTo(191, 5);
    expect(a.z).toBeCloseTo(0, 5);
    // Always closer to origin than the landmark itself.
    expect(Math.hypot(a.x, a.z)).toBeLessThan(200);
  });

  it('offsets along the radial direction for an off-axis landmark', () => {
    const a = safeArrivalXZ(300, 400, 0); // dist 500, clearance 3
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(497, 1);
    // Same bearing from origin (just nearer).
    expect(Math.atan2(a.z, a.x)).toBeCloseTo(Math.atan2(400, 300), 5);
  });

  it('steps south for a landmark sitting at the origin', () => {
    const a = safeArrivalXZ(0, 0, 8);
    expect(a.x).toBe(0);
    expect(a.z).toBeCloseTo(11, 5);
  });

  it('defaults the footprint radius when omitted', () => {
    const a = safeArrivalXZ(100, 0);
    expect(a.x).toBeCloseTo(91, 5); // 6 + 3 clearance
  });
});
