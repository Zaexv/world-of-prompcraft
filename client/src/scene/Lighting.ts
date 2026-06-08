import * as THREE from 'three';

export const SUN_DIR  = new THREE.Vector3( 200,  160,  100).normalize();
export const MOON_DIR = new THREE.Vector3(-150,  120, -200).normalize();

interface FlareEntry {
  sprite: THREE.Sprite;
  offset: number;      // 0 = at sun, 1 = anti-sun (diametrically opposite)
  baseOpacity: number;
}

export class Lighting {
  public sun: THREE.DirectionalLight;
  public moon: THREE.DirectionalLight;
  public hemisphere: THREE.HemisphereLight;
  public ambient: THREE.AmbientLight;
  public rim: THREE.DirectionalLight;
  private readonly sunMesh: THREE.Sprite;
  private readonly moonMesh: THREE.Sprite;
  private readonly flareSprites: FlareEntry[] = [];

  // Reusable temporaries for flare update — avoids per-frame allocations.
  private readonly _camFwd = new THREE.Vector3();
  private readonly _ndcVec = new THREE.Vector3();
  private readonly _dirVec = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    // ── Sun ──────────────────────────────────────────────────────────────────
    this.sun = new THREE.DirectionalLight(0xfff8e0, 2.5);
    this.sun.position.set(200, 160, 100);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 500;
    this.sun.shadow.camera.left   = -80;
    this.sun.shadow.camera.right  =  80;
    this.sun.shadow.camera.top    =  80;
    this.sun.shadow.camera.bottom = -80;
    this.sun.shadow.bias       = -0.0003;
    this.sun.shadow.normalBias =  0.02;
    this.sun.target.position.set(0, 0, 0);
    scene.add(this.sun);
    scene.add(this.sun.target);

    this.sunMesh = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeSunTex(256),
        color: new THREE.Color(3.5, 3.2, 2.4),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        transparent: true,
      }),
    );
    this.sunMesh.scale.set(180, 180, 1);
    scene.add(this.sunMesh);

    // ── Lens flare streak ────────────────────────────────────────────────────
    // Replaces Three.js Lensflare which called gl.readPixels() every frame —
    // a CPU↔GPU pipeline sync that caused rendering freezes and produced a
    // "yellow ball" when the EffectComposer's depth buffer made the occlusion
    // test return wrong results.
    //
    // Sprites are positioned along the screen-space sun→anti-sun axis each
    // frame.  Visibility is a CPU dot-product — zero GPU readback.
    const flareDefs: Array<{
      rgb: [number, number, number];
      peakAlpha: number;
      size: number;
      offset: number;
    }> = [
      { rgb: [255, 220, 160], peakAlpha: 0.40, size: 100, offset: 0.40 },
      { rgb: [200, 200, 255], peakAlpha: 0.30, size: 120, offset: 0.65 },
      { rgb: [255, 180, 140], peakAlpha: 0.36, size:  85, offset: 0.80 },
      { rgb: [180, 220, 255], peakAlpha: 0.24, size: 110, offset: 1.00 },
    ];
    for (const def of flareDefs) {
      const mat = new THREE.SpriteMaterial({
        map: makeFlareTex(64, def.rgb, def.peakAlpha),
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        fog: false,
        transparent: true,
        opacity: 0,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.scale.setScalar(def.size);
      sprite.visible = false;
      scene.add(sprite);
      this.flareSprites.push({ sprite, offset: def.offset, baseOpacity: def.peakAlpha });
    }

    // ── Moon ─────────────────────────────────────────────────────────────────
    // The moon is currently OFF (intensity 0) and nothing turns it on, so it
    // must NOT cast shadows — otherwise three.js renders a full-scene shadow
    // depth pass every frame for a light that contributes zero illumination.
    // (Re-enable castShadow + the shadow camera config below if a day/night
    // cycle ever activates the moon.)
    this.moon = new THREE.DirectionalLight(0x9fb9ff, 0); // 0 -> OFF
    this.moon.position.set(-150, 120, -200);
    this.moon.castShadow = false;
    this.moon.target.position.set(0, 0, 0);
    scene.add(this.moon);
    scene.add(this.moon.target);

    this.moonMesh = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: makeMoonTex(256),
        color: new THREE.Color(1.8, 1.9, 2.2),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        transparent: true,
      }),
    );
    this.moonMesh.scale.set(50, 50, 1);
    this.moonMesh.visible = false;
    scene.add(this.moonMesh);

    // ── Daytime sky fill ─────────────────────────────────────────────────────
    this.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x4a3800, 1.20); // Boosted from 0.80
    scene.add(this.hemisphere);

    this.ambient = new THREE.AmbientLight(0xfff0cc, 0.65); // Boosted from 0.50
    scene.add(this.ambient);

    this.rim = new THREE.DirectionalLight(0xffeebb, 0.45); // Boosted from 0.30
    this.rim.position.set(80, 30, 120);
    this.rim.castShadow = false;
    scene.add(this.rim);

    scene.fog = new THREE.FogExp2(0x9ec8e0, 0.0006);
  }

  /** Keep the sun's shadow frustum centred on the player. */
  trackPlayer(x: number, z: number): void {
    this.sun.position.set(x + 200, 160, z + 100);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();
    // The moon is off and casts no shadow, so its frustum needs no tracking.
  }

  /** Pin celestial discs to their sky directions and update the flare streak. */
  updateCelestialDiscs(cameraPos: THREE.Vector3, camera: THREE.PerspectiveCamera): void {
    this.sunMesh.position.copy(SUN_DIR).multiplyScalar(800).add(cameraPos);
    this.moonMesh.position.copy(MOON_DIR).multiplyScalar(800).add(cameraPos);
    this._updateFlares(camera, cameraPos);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * CPU-side lens flare update — no GPU readback.
   *
   * Opacity: derived from camera-forward dot SUN_DIR (how directly we look at sun).
   * Position: each sprite is unprojected onto the screen-space line from the sun
   * through the screen centre, then placed at 800 world units from the camera so
   * it matches the sun sprite's distance and never clips the near plane.
   */
  private _updateFlares(camera: THREE.PerspectiveCamera, cameraPos: THREE.Vector3): void {
    camera.getWorldDirection(this._camFwd);
    const dot = this._camFwd.dot(SUN_DIR);
    // Fade from invisible (dot ≤ 0.25) to full (dot ≥ 0.6).
    const opacity = THREE.MathUtils.clamp((dot - 0.25) / 0.35, 0, 1);

    if (opacity < 0.001) {
      for (const f of this.flareSprites) f.sprite.visible = false;
      return;
    }

    // Project the sun's world position to NDC to find its screen location.
    this._ndcVec.copy(this.sunMesh.position).project(camera);
    if (this._ndcVec.z >= 1.0) {
      // Sun is at or beyond the far plane — should never happen, guard anyway.
      for (const f of this.flareSprites) f.sprite.visible = false;
      return;
    }
    const sx = this._ndcVec.x;
    const sy = this._ndcVec.y;

    for (const f of this.flareSprites) {
      // Screen-space position along sun → screen-centre → anti-sun axis.
      // offset=0 → at sun;  offset=0.5 → screen centre;  offset=1 → anti-sun.
      const t = f.offset;
      this._ndcVec.set(sx * (1 - 2 * t), sy * (1 - 2 * t), 0.5);
      this._ndcVec.unproject(camera);

      // Place sprite at 800 units in the unprojected direction so it sits on
      // the same virtual sphere as the sun mesh.
      this._dirVec.copy(this._ndcVec).sub(cameraPos).normalize();
      f.sprite.position.copy(cameraPos).addScaledVector(this._dirVec, 800);
      f.sprite.visible = true;
      (f.sprite.material as THREE.SpriteMaterial).opacity = opacity * f.baseOpacity;
    }
  }
}

// ── Texture helpers ──────────────────────────────────────────────────────────

function makeSunTex(size: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;

  const core = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.28);
  core.addColorStop(0.0, 'rgba(255,252,230,1.0)');
  core.addColorStop(0.6, 'rgba(255,245,200,0.85)');
  core.addColorStop(1.0, 'rgba(255,235,170,0.0)');
  ctx.fillStyle = core;
  ctx.fillRect(0, 0, size, size);

  const corona = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  corona.addColorStop(0.0,  'rgba(255,240,160,0.55)');
  corona.addColorStop(0.25, 'rgba(255,220,120,0.35)');
  corona.addColorStop(0.55, 'rgba(255,190, 80,0.12)');
  corona.addColorStop(0.80, 'rgba(255,160, 50,0.04)');
  corona.addColorStop(1.0,  'rgba(0,0,0,0)');
  ctx.fillStyle = corona;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function makeMoonTex(size: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;

  const disc = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.20);
  disc.addColorStop(0.0, 'rgba(240,245,255,1.0)');
  disc.addColorStop(0.7, 'rgba(220,235,255,0.95)');
  disc.addColorStop(1.0, 'rgba(200,220,255,0.0)');
  ctx.fillStyle = disc;
  ctx.fillRect(0, 0, size, size);

  const halo = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  halo.addColorStop(0.0,  'rgba(200,220,255,0.30)');
  halo.addColorStop(0.25, 'rgba(180,210,255,0.15)');
  halo.addColorStop(0.55, 'rgba(160,200,255,0.05)');
  halo.addColorStop(1.0,  'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}

function makeFlareTex(size: number, rgb: [number, number, number], peakAlpha: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const [r, g, b] = rgb;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0.0, `rgba(${r},${g},${b},${peakAlpha})`);
  grad.addColorStop(0.3, `rgba(${r},${g},${b},${(peakAlpha * 0.4).toFixed(2)})`);
  grad.addColorStop(1.0, `rgba(0,0,0,0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  return tex;
}
