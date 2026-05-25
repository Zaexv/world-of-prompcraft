import * as THREE from 'three';

/** Reusable vector to avoid per-frame allocation. */
const _projected = new THREE.Vector3();

/**
 * Project a 3D world position to 2D screen pixel coordinates.
 * Returns null if the position is behind the camera.
 *
 * @param worldPos - The 3D world position
 * @param camera - The perspective camera
 * @param width - Screen width in pixels
 * @param height - Screen height in pixels
 * @returns { x, y } in screen pixels, or null if behind camera
 */
export function worldToScreen(
  worldPos: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): { x: number; y: number } | null {
  _projected.copy(worldPos);
  _projected.project(camera);

  // Behind camera or beyond far plane check
  if (_projected.z < -1 || _projected.z > 1) return null;

  const x = (_projected.x * 0.5 + 0.5) * width;
  const y = (-_projected.y * 0.5 + 0.5) * height;

  // Reject positions outside viewport bounds (with small margin)
  if (x < -100 || x > width + 100 || y < -100 || y > height + 100) return null;

  return {
    x: (_projected.x * 0.5 + 0.5) * width,
    y: (-_projected.y * 0.5 + 0.5) * height,
  };
}

/**
 * Project a 3D world position with a Y offset (e.g., above an entity's head).
 * Returns null if behind camera.
 */
export function worldToScreenWithOffset(
  worldPos: THREE.Vector3,
  yOffset: number,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
): { x: number; y: number } | null {
  _projected.set(worldPos.x, worldPos.y + yOffset, worldPos.z);
  _projected.project(camera);

  if (_projected.z < -1 || _projected.z > 1) return null;

  const x = (_projected.x * 0.5 + 0.5) * width;
  const y = (-_projected.y * 0.5 + 0.5) * height;

  if (x < -100 || x > width + 100 || y < -100 || y > height + 100) return null;

  return {
    x: (_projected.x * 0.5 + 0.5) * width,
    y: (-_projected.y * 0.5 + 0.5) * height,
  };
}
