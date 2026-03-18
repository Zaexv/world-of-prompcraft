import { describe, it, expect } from 'vitest';
import { lerp, clamp, lerpAngle, smoothDamp } from '../utils/MathHelpers';

describe('lerp', () => {
  it('returns a when t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('returns b when t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('returns midpoint when t=0.5', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });
});

describe('clamp', () => {
  it('clamps below min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps above max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('passes through value in range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
});

describe('lerpAngle', () => {
  it('interpolates between 0 and PI', () => {
    const result = lerpAngle(0, Math.PI, 0.5);
    expect(result).toBeCloseTo(Math.PI / 2, 5);
  });

  it('takes shortest path around circle', () => {
    // From -170 degrees to 170 degrees should go through 180, not through 0
    const a = (-170 * Math.PI) / 180;
    const b = (170 * Math.PI) / 180;
    const result = lerpAngle(a, b, 0.5);
    // Midpoint should be near +/-180 degrees
    expect(Math.abs(result)).toBeCloseTo(Math.PI, 1);
  });
});

describe('smoothDamp', () => {
  it('moves toward target', () => {
    const [value] = smoothDamp(0, 10, 0, 0.3, 0.016);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(10);
  });

  it('respects max speed', () => {
    const [value] = smoothDamp(0, 1000, 0, 0.1, 0.016, 1.0);
    // Should be limited by maxSpeed
    expect(value).toBeLessThan(100);
  });
});
