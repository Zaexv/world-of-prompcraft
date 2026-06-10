import * as THREE from 'three';

/**
 * Rising ember particles for fires (bonfire, campfire).
 *
 * Self-contained: the returned THREE.Points animates itself from its own
 * `onBeforeRender` hook, so callers just `group.add(...)` it — no global update
 * registry or per-frame traversal needed. onBeforeRender only fires while the
 * object is actually rendered, so off-screen fires cost nothing.
 */

let sharedSprite: THREE.Texture | null = null;

/** A soft round glow sprite (shared across every fire). */
function emberSprite(): THREE.Texture {
  if (sharedSprite) return sharedSprite;
  const s = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Headless / no-2d-context environments (e.g. happy-dom in tests): skip the
    // painted gradient, return a blank texture so mesh construction never throws.
    sharedSprite = new THREE.CanvasTexture(canvas);
    return sharedSprite;
  }
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,200,120,0.75)');
  grad.addColorStop(1, 'rgba(255,120,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  sharedSprite = new THREE.CanvasTexture(canvas);
  return sharedSprite;
}

export interface EmberOptions {
  /** Uniform scale factor, matching the host mesh's scale. */
  scale?: number;
  /** Number of live embers. */
  count?: number;
  /** Emission radius at the base (pre-scale). */
  radius?: number;
  /** How high embers rise before recycling (pre-scale). */
  rise?: number;
  /** Height the embers spawn at (pre-scale). */
  baseY?: number;
  /** Rise speed (pre-scale, world-units/sec). */
  speed?: number;
  /** Point sprite size (pre-scale). */
  size?: number;
  /** Ember tint. */
  color?: THREE.ColorRepresentation;
}

export function createEmberParticles(opts: EmberOptions = {}): THREE.Points {
  const scale = opts.scale ?? 1;
  const count = opts.count ?? 18;
  const radius = (opts.radius ?? 0.25) * scale;
  const rise = (opts.rise ?? 2.0) * scale;
  const baseY = (opts.baseY ?? 0.3) * scale;
  const speed = (opts.speed ?? 1.2) * scale;
  const size = (opts.size ?? 0.18) * scale;
  const baseColor = new THREE.Color(opts.color ?? 0xff7a18);

  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count);   // lateral sway phase
  const speeds = new Float32Array(count);  // per-ember rise speed
  const lives = new Float32Array(count);   // normalized 0..1 progress

  const reset = (i: number, randomLife: boolean): void => {
    const a = Math.random() * Math.PI * 2;
    const r = Math.random() * radius;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = baseY;
    positions[i * 3 + 2] = Math.sin(a) * r;
    seeds[i] = Math.random() * Math.PI * 2;
    speeds[i] = speed * (0.6 + Math.random() * 0.8);
    lives[i] = randomLife ? Math.random() : 0;
  };
  for (let i = 0; i < count; i++) reset(i, true);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  // Bound the rise volume so frustum culling is correct as embers climb.
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, baseY + rise * 0.5, 0), rise + radius);

  const mat = new THREE.PointsMaterial({
    size,
    map: emberSprite(),
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });

  const points = new THREE.Points(geo, mat);
  points.userData.noCollision = true;

  const posAttr = geo.attributes.position as THREE.BufferAttribute;
  const colAttr = geo.attributes.color as THREE.BufferAttribute;
  let last = performance.now();

  points.onBeforeRender = (): void => {
    const now = performance.now();
    let dt = (now - last) / 1000;
    last = now;
    // Clamp to avoid a huge jump after the tab was backgrounded/culled.
    if (dt > 0.1) dt = 0.1;

    for (let i = 0; i < count; i++) {
      lives[i] += (speeds[i] / rise) * dt;
      if (lives[i] >= 1) reset(i, false);
      const l = lives[i];
      positions[i * 3 + 1] = baseY + l * rise;
      // Gentle widening sway as the ember rises.
      positions[i * 3] += Math.sin(seeds[i] + l * 6) * 0.12 * scale * l * dt;
      positions[i * 3 + 2] += Math.cos(seeds[i] + l * 5) * 0.12 * scale * l * dt;
      // Fade out toward the top (additive → invisible) and cool toward red.
      const fade = 1 - l;
      colors[i * 3] = baseColor.r * fade;
      colors[i * 3 + 1] = baseColor.g * fade * fade;
      colors[i * 3 + 2] = baseColor.b * fade * fade * fade;
    }
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  };

  return points;
}
