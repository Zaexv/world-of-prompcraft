import * as THREE from 'three';

/**
 * Teldrassil night sky — rendered to a CubeTexture and set as scene.background.
 * This avoids inverted-sphere distortion and is GPU-friendly (no extra draw call).
 *
 * Features: deep indigo-to-teal gradient, procedural stars, purple nebula,
 * two moons (primary silver, secondary violet).
 */
export class Skybox {
  constructor(scene: THREE.Scene) {
    const size = 512;
    const cubeTexture = this.generateCubeTexture(size);
    scene.background = cubeTexture;
  }

  private generateCubeTexture(size: number): THREE.CubeTexture {
    // Generate 6 faces: +X, -X, +Y, -Y, +Z, -Z
    const faces: HTMLCanvasElement[] = [];
    // Direction vectors for each face (center of face in cube-map space)
    const faceDirections: Array<{
      right: [number, number, number];
      up: [number, number, number];
      forward: [number, number, number];
    }> = [
      { right: [0, 0, -1], up: [0, 1, 0], forward: [1, 0, 0] },   // +X
      { right: [0, 0, 1], up: [0, 1, 0], forward: [-1, 0, 0] },    // -X
      { right: [1, 0, 0], up: [0, 0, 1], forward: [0, 1, 0] },     // +Y
      { right: [1, 0, 0], up: [0, 0, -1], forward: [0, -1, 0] },   // -Y
      { right: [1, 0, 0], up: [0, 1, 0], forward: [0, 0, 1] },     // +Z
      { right: [-1, 0, 0], up: [0, 1, 0], forward: [0, 0, -1] },   // -Z
    ];

    for (const face of faceDirections) {
      faces.push(this.renderFace(size, face));
    }

    const cubeTexture = new THREE.CubeTexture(faces);
    cubeTexture.needsUpdate = true;
    return cubeTexture;
  }

  private renderFace(
    size: number,
    dirs: { right: [number, number, number]; up: [number, number, number]; forward: [number, number, number] },
  ): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    // Colors
    const zenith = [10, 6, 40];      // deep indigo
    const horizon = [18, 34, 51];     // dark teal
    const below = [10, 6, 18];        // near-black purple
    const nebulaCol = [102, 51, 170]; // purple

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        // Map pixel to direction
        const u = (x / size) * 2 - 1;
        const v = (y / size) * 2 - 1; // Note: v is inverted for cube maps
        const dx = dirs.forward[0] + dirs.right[0] * u + dirs.up[0] * (-v);
        const dy = dirs.forward[1] + dirs.right[1] * u + dirs.up[1] * (-v);
        const dz = dirs.forward[2] + dirs.right[2] * u + dirs.up[2] * (-v);
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const ndx = dx / len;
        const ndy = dy / len;
        const ndz = dz / len;
        const h = ndy; // height = y component of normalized direction

        // Base gradient
        let r: number, g: number, b: number;
        if (h > 0) {
          const t = Math.min(h, 1);
          r = horizon[0] + (zenith[0] - horizon[0]) * t;
          g = horizon[1] + (zenith[1] - horizon[1]) * t;
          b = horizon[2] + (zenith[2] - horizon[2]) * t;
        } else {
          const t = Math.min(-h, 1);
          r = horizon[0] + (below[0] - horizon[0]) * t;
          g = horizon[1] + (below[1] - horizon[1]) * t;
          b = horizon[2] + (below[2] - horizon[2]) * t;
        }

        // Stars (above horizon only)
        if (h > 0.02) {
          const sx = Math.floor(ndx * 200 + 500);
          const sz = Math.floor(ndz * 200 + 500);
          const starHash = this.hash(sx, sz);
          if (starHash > 0.97) {
            const brightness = 0.5 + 0.5 * this.hash(sx + 7, sz + 3);
            const fade = Math.min(1, (h - 0.02) / 0.23);
            const starI = brightness * fade * 200;
            r = Math.min(255, r + starI * 0.85);
            g = Math.min(255, g + starI * 0.88);
            b = Math.min(255, b + starI);
          }
        }

        // Nebula glow
        if (h > -0.1 && h < 0.8) {
          const nu = ndx * 3 + 0.5;
          const nv = ndz * 3 + 0.8;
          const n = this.fbm(nu, nv);
          const nebulaMask = Math.max(0, Math.min(1, (h + 0.1) / 0.4)) * Math.max(0, Math.min(1, (0.8 - h) / 0.4));
          const nebulaI = n * nebulaMask * 0.3;
          r = Math.min(255, r + nebulaCol[0] * nebulaI);
          g = Math.min(255, g + nebulaCol[1] * nebulaI);
          b = Math.min(255, b + nebulaCol[2] * nebulaI);
        }

        // Primary moon (large, silver-blue)
        const m1 = this.moonDisc(ndx, ndy, ndz, 0.4, 0.7, -0.5, 0.04, 0.15);
        r = Math.min(255, r + 190 * m1);
        g = Math.min(255, g + 210 * m1);
        b = Math.min(255, b + 242 * m1);

        // Secondary moon (smaller, purple-tinted)
        const m2 = this.moonDisc(ndx, ndy, ndz, -0.6, 0.5, 0.3, 0.025, 0.09) * 0.7;
        r = Math.min(255, r + 178 * m2);
        g = Math.min(255, g + 153 * m2);
        b = Math.min(255, b + 217 * m2);

        const idx = (y * size + x) * 4;
        data[idx] = Math.round(r);
        data[idx + 1] = Math.round(g);
        data[idx + 2] = Math.round(b);
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  // --- Helpers ---

  private hash(x: number, y: number): number {
    let a = Math.abs(x * 443.8975 + y * 397.2973) % 1000;
    a = (a * (a + 19.19)) % 1000;
    return (a / 1000) % 1;
  }

  private noise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const a = this.hash(ix, iy);
    const b = this.hash(ix + 1, iy);
    const c = this.hash(ix, iy + 1);
    const d = this.hash(ix + 1, iy + 1);

    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }

  private fbm(x: number, y: number): number {
    let value = 0;
    let amp = 0.5;
    for (let i = 0; i < 4; i++) {
      value += amp * this.noise(x, y);
      x *= 2.2;
      y *= 2.2;
      amp *= 0.5;
    }
    return value;
  }

  private moonDisc(
    dx: number, dy: number, dz: number,
    mx: number, my: number, mz: number,
    radius: number, glowRadius: number,
  ): number {
    const ml = Math.sqrt(mx * mx + my * my + mz * mz);
    const nmx = mx / ml, nmy = my / ml, nmz = mz / ml;
    const dist = Math.sqrt(
      (dx - nmx) ** 2 + (dy - nmy) ** 2 + (dz - nmz) ** 2,
    );
    const disc = Math.max(0, 1 - Math.max(0, (dist - radius * 0.9) / (radius * 0.1)));
    const glow = Math.max(0, 1 - Math.max(0, (dist - radius) / (glowRadius - radius)));
    return disc + glow * 0.3;
  }
}
