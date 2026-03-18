/**
 * Common math utilities for smooth interpolation and clamping.
 */

/** Linear interpolation between a and b by factor t. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Clamp val between min and max. */
export function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

/**
 * Lerp between two angles (radians) taking the shortest path around the circle.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  // Wrap diff into [-PI, PI]
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

/**
 * SmoothDamp — attempt to reach target from current, like Unity's SmoothDamp.
 * Returns [newValue, newVelocity].
 */
export function smoothDamp(
  current: number,
  target: number,
  currentVelocity: number,
  smoothTime: number,
  delta: number,
  maxSpeed: number = Infinity,
): [number, number] {
  const st = Math.max(0.0001, smoothTime);
  const omega = 2.0 / st;
  const x = omega * delta;
  const exp = 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x);

  let change = current - target;
  const maxChange = maxSpeed * st;
  change = clamp(change, -maxChange, maxChange);

  const adjustedTarget = current - change;
  const temp = (currentVelocity + omega * change) * delta;
  let newVelocity = (currentVelocity - omega * temp) * exp;
  let newValue = adjustedTarget + (change + temp) * exp;

  // Prevent overshooting
  if (target - current > 0.0 === newValue > target) {
    newValue = target;
    newVelocity = (newValue - target) / delta;
  }

  return [newValue, newVelocity];
}
