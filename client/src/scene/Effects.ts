import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/*  Helper: procedural circular gradient texture (for wisp sprites)   */
/* ------------------------------------------------------------------ */
function createGlowTexture(size = 64): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(200,255,240,0.6)');
  gradient.addColorStop(1, 'rgba(100,180,255,0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Helper: procedural leaf texture                                   */
/* ------------------------------------------------------------------ */
function createLeafTexture(size = 32): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);

  // Simple leaf shape
  ctx.beginPath();
  ctx.ellipse(size / 2, size / 2, size * 0.45, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#b888dd';
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Wisp data                                                         */
/* ------------------------------------------------------------------ */
interface WispData {
  sprite: THREE.Sprite;
  spriteMaterial: THREE.SpriteMaterial;  // cached to avoid per-frame casts
  origin: THREE.Vector3;
  phase: number;      // offset in animation cycle
  speed: number;      // radians per second
  radiusX: number;
  radiusZ: number;
  baseY: number;
  baseIntensity: number;
  pulseSpeed: number;
}

/* ------------------------------------------------------------------ */
/*  Leaf data                                                         */
/* ------------------------------------------------------------------ */
interface LeafData {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  swayPhase: number;
  swaySpeed: number;
}

/* ================================================================== */
/*  Effects — magical environmental effects for a Teldrassil scene    */
/* ================================================================== */
export class Effects {
  private scene: THREE.Scene;
  private elapsed = 0;

  // Wisps
  private wisps: WispData[] = [];

  // Ambient particles
  private particles!: THREE.Points;
  private particlePositions!: Float32Array;
  private particleVelocities: Float32Array;
  private particleCount = 200;

  // Ground glow (material cached to avoid per-frame casts)
  private glowPatches: { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; phase: number; baseOpacity: number }[] = [];

  // Falling leaves
  private leaves: LeafData[] = [];

  /* ---------------------------------------------------------------- */
  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleVelocities = new Float32Array(this.particleCount * 3);

    this.initWisps();
    this.initParticles();
    this.initGroundGlow();
    this.initLeaves();
  }

  /* =====================  WISPS  ================================== */
  private initWisps(): void {
    const glowTex = createGlowTexture();
    const count = 8 + Math.floor(Math.random() * 5); // 8-12

    const tealColor = new THREE.Color(0x44ffcc);
    const purpleColor = new THREE.Color(0xaa66ff);

    for (let i = 0; i < count; i++) {
      const isTeal = Math.random() > 0.5;
      const color = isTeal ? tealColor.clone() : purpleColor.clone();

      const originX = (Math.random() - 0.5) * 80;
      const originZ = (Math.random() - 0.5) * 80;
      const baseY = 2 + Math.random() * 8;

      // Emissive sprite only (no PointLight — major perf win)
      const spriteMat = new THREE.SpriteMaterial({
        map: glowTex,
        color,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.8,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.scale.set(1.8, 1.8, 1);
      sprite.position.set(originX, baseY, originZ);
      this.scene.add(sprite);

      this.wisps.push({
        sprite,
        spriteMaterial: spriteMat,
        origin: new THREE.Vector3(originX, baseY, originZ),
        phase: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.2,
        radiusX: 2 + Math.random() * 4,
        radiusZ: 2 + Math.random() * 4,
        baseY,
        baseIntensity: 0.4 + Math.random() * 0.3,
        pulseSpeed: 0.8 + Math.random() * 1.2,
      });
    }
  }

  /* =====================  AMBIENT PARTICLES  ====================== */
  private initParticles(): void {
    const geo = new THREE.BufferGeometry();
    this.particlePositions = new Float32Array(this.particleCount * 3);

    const colors = new Float32Array(this.particleCount * 3);
    const teal = new THREE.Color(0x44ffcc);
    const purple = new THREE.Color(0xaa66ff);

    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      this.particlePositions[i3] = (Math.random() - 0.5) * 100;
      this.particlePositions[i3 + 1] = Math.random() * 30;
      this.particlePositions[i3 + 2] = (Math.random() - 0.5) * 100;

      // random velocity
      this.particleVelocities[i3] = (Math.random() - 0.5) * 0.3;
      this.particleVelocities[i3 + 1] = 0.1 + Math.random() * 0.15; // upward
      this.particleVelocities[i3 + 2] = (Math.random() - 0.5) * 0.3;

      // color
      const c = Math.random() > 0.5 ? teal : purple;
      colors[i3] = c.r;
      colors[i3 + 1] = c.g;
      colors[i3 + 2] = c.b;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(this.particlePositions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.08,
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.7,
    });

    this.particles = new THREE.Points(geo, mat);
    this.scene.add(this.particles);
  }

  /* =====================  GROUND GLOW  ============================ */
  private initGroundGlow(): void {
    const patchCount = 15 + Math.floor(Math.random() * 6); // 15-20
    const teal = 0x44ffcc;
    const purple = 0xaa66ff;

    for (let i = 0; i < patchCount; i++) {
      const radius = 2 + Math.random() * 3;
      const geo = new THREE.CircleGeometry(radius, 24);
      const baseOpacity = 0.15 + Math.random() * 0.15;
      const color = Math.random() > 0.5 ? teal : purple;

      const mat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: baseOpacity,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2; // lay flat
      mesh.position.set(
        (Math.random() - 0.5) * 80,
        0.05, // just above ground
        (Math.random() - 0.5) * 80,
      );

      this.scene.add(mesh);
      this.glowPatches.push({
        mesh,
        material: mat,
        phase: Math.random() * Math.PI * 2,
        baseOpacity,
      });
    }
  }

  /* =====================  FALLING LEAVES  ========================= */
  private initLeaves(): void {
    const leafCount = 30;
    const leafTex = createLeafTexture();

    const colors = [0xb888dd, 0xccaaee, 0xc0c0d0]; // purple / lavender / silver

    for (let i = 0; i < leafCount; i++) {
      const geo = new THREE.PlaneGeometry(0.3, 0.15);
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        transparent: true,
        opacity: 0.6 + Math.random() * 0.3,
        side: THREE.DoubleSide,
        map: leafTex,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(
        (Math.random() - 0.5) * 80,
        10 + Math.random() * 20,
        (Math.random() - 0.5) * 80,
      );
      // random initial rotation
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI,
      );

      this.scene.add(mesh);

      this.leaves.push({
        mesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.5,
          -(0.3 + Math.random() * 0.4),
          (Math.random() - 0.5) * 0.5,
        ),
        swayPhase: Math.random() * Math.PI * 2,
        swaySpeed: 1 + Math.random() * 2,
      });
    }
  }

  // Last known player position for relocating effects
  private playerX = 0;
  private playerZ = 0;

  /** Update the player position so effects stay near the camera. */
  setPlayerPosition(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
  }

  /* ================================================================ */
  /*  UPDATE                                                          */
  /* ================================================================ */
  update(delta: number): void {
    this.elapsed += delta;
    const t = this.elapsed;

    // --- Wisps (sprite-only, no PointLights for performance) ---
    for (const w of this.wisps) {
      const angle = t * w.speed + w.phase;
      // Figure-8 / lissajous path
      const x = w.origin.x + Math.sin(angle) * w.radiusX;
      const z = w.origin.z + Math.sin(angle * 2) * w.radiusZ;
      const y = w.baseY + Math.sin(t * 0.5 + w.phase) * 1.5;

      w.sprite.position.set(x, y, z);

      // Pulse brightness
      const pulse = 0.5 + 0.5 * Math.sin(t * w.pulseSpeed + w.phase);
      const s = 1.4 + 0.5 * pulse;
      w.sprite.scale.set(s, s, 1);
      w.spriteMaterial.opacity = 0.5 + 0.4 * pulse;
    }

    // --- Ambient particles ---
    const positions = this.particlePositions;
    for (let i = 0; i < this.particleCount; i++) {
      const i3 = i * 3;
      positions[i3] += this.particleVelocities[i3] * delta;
      positions[i3 + 1] += this.particleVelocities[i3 + 1] * delta;
      positions[i3 + 2] += this.particleVelocities[i3 + 2] * delta;

      // Add gentle horizontal sway
      positions[i3] += Math.sin(t + i) * 0.005;
      positions[i3 + 2] += Math.cos(t + i * 0.7) * 0.005;

      // Reset near player if too high
      if (positions[i3 + 1] > 30) {
        positions[i3] = this.playerX + (Math.random() - 0.5) * 100;
        positions[i3 + 1] = 0;
        positions[i3 + 2] = this.playerZ + (Math.random() - 0.5) * 100;
      }
    }
    (this.particles.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;

    // --- Ground glow ---
    for (const g of this.glowPatches) {
      const pulse = Math.sin(t * 0.6 + g.phase) * 0.5 + 0.5; // 0..1
      g.material.opacity = g.baseOpacity * (0.6 + 0.4 * pulse);
    }

    // --- Falling leaves ---
    for (const leaf of this.leaves) {
      const m = leaf.mesh;
      m.position.x += leaf.velocity.x * delta + Math.sin(t * leaf.swaySpeed + leaf.swayPhase) * 0.01;
      m.position.y += leaf.velocity.y * delta;
      m.position.z += leaf.velocity.z * delta + Math.cos(t * leaf.swaySpeed + leaf.swayPhase) * 0.01;

      // Gentle tumble
      m.rotation.x += delta * 0.3;
      m.rotation.z += delta * 0.2;

      // Reset near player when hitting ground
      if (m.position.y < 0) {
        m.position.set(
          this.playerX + (Math.random() - 0.5) * 80,
          25 + Math.random() * 10,
          this.playerZ + (Math.random() - 0.5) * 80,
        );
      }
    }
  }
}
