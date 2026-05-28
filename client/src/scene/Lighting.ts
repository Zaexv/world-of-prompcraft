import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';

export const SUN_DIR  = new THREE.Vector3( 200,  160,  100).normalize();
export const MOON_DIR = new THREE.Vector3(-150,  120, -200).normalize();

export class Lighting {
  public sun: THREE.DirectionalLight;
  public moon: THREE.DirectionalLight;
  public hemisphere: THREE.HemisphereLight;
  public ambient: THREE.AmbientLight;
  public rim: THREE.DirectionalLight;
  private readonly sunMesh: THREE.Sprite;
  private readonly moonMesh: THREE.Sprite;

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

    const sunLensflare = new Lensflare();
    sunLensflare.addElement(new LensflareElement(makeFlareTex(256, [255, 255, 220], 0.35), 500, 0.0));
    sunLensflare.addElement(new LensflareElement(makeFlareTex(64,  [255, 220, 160], 0.20), 120, 0.4));
    sunLensflare.addElement(new LensflareElement(makeFlareTex(64,  [200, 200, 255], 0.15), 140, 0.65));
    sunLensflare.addElement(new LensflareElement(makeFlareTex(64,  [255, 180, 140], 0.18), 100, 0.8));
    sunLensflare.addElement(new LensflareElement(makeFlareTex(64,  [180, 220, 255], 0.12), 130, 1.0));
    this.sunMesh.add(sunLensflare);

    // ── Moon (primary night light, casts soft shadows) ───────────────────────
    this.moon = new THREE.DirectionalLight(0x9fb9ff, 0); // 0 -> OFF
    this.moon.position.set(-150, 120, -200);
    this.moon.castShadow = true;
    this.moon.shadow.mapSize.set(1024, 1024);
    this.moon.shadow.camera.near = 1;
    this.moon.shadow.camera.far = 500;
    this.moon.shadow.camera.left   = -80;
    this.moon.shadow.camera.right  =  80;
    this.moon.shadow.camera.top    =  80;
    this.moon.shadow.camera.bottom = -80;
    this.moon.shadow.bias       = -0.0003;
    this.moon.shadow.normalBias =  0.02;
    this.moon.target.position.set(0, 0, 0);
    scene.add(this.moon);
    scene.add(this.moon.target);

    // Moon sprite — crisp disc with a subtle cool halo
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

    const moonLensflare = new Lensflare();
    moonLensflare.addElement(new LensflareElement(makeFlareTex(256, [200, 220, 255], 0.18), 350, 0.0));
    moonLensflare.addElement(new LensflareElement(makeFlareTex(64,  [180, 210, 255], 0.10),  80, 0.5));
    moonLensflare.addElement(new LensflareElement(makeFlareTex(64,  [160, 200, 255], 0.08),  90, 0.8));
    this.moonMesh.add(moonLensflare);

    // ── Daytime sky fill ─────────────────────────────────────────────────────
    this.hemisphere = new THREE.HemisphereLight(0x87ceeb, 0x4a3800, 0.80);
    scene.add(this.hemisphere);

    this.ambient = new THREE.AmbientLight(0xfff0cc, 0.50);
    scene.add(this.ambient);

    this.rim = new THREE.DirectionalLight(0xffeebb, 0.30);
    this.rim.position.set(80, 30, 120);
    this.rim.castShadow = false;
    scene.add(this.rim);

    scene.fog = new THREE.FogExp2(0x9ec8e0, 0.0006);
  }

  /** Move both shadow frustums to stay centred on the player. */
  trackPlayer(x: number, z: number): void {
    this.sun.position.set(x + 200, 160, z + 100);
    this.sun.target.position.set(x, 0, z);
    this.sun.target.updateMatrixWorld();

    this.moon.position.set(x - 150, 120, z - 200);
    this.moon.target.position.set(x, 0, z);
    this.moon.target.updateMatrixWorld();
  }

  /** Pin both celestial discs to their sky directions relative to the camera. */
  updateCelestialDiscs(cameraPos: THREE.Vector3): void {
    this.sunMesh.position.copy(SUN_DIR).multiplyScalar(800).add(cameraPos);
    this.moonMesh.position.copy(MOON_DIR).multiplyScalar(800).add(cameraPos);
  }
}

/**
 * Gaussian sun disc texture — warm white core with a wide corona.
 * The SpriteMaterial color multiplier provides the overbright tint.
 */
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
  tex.needsUpdate = true;
  return tex;
}

/**
 * Moon disc texture — sharp white disc with a small cool halo.
 * Intentionally tighter than the sun to read as a physical object.
 */
function makeMoonTex(size: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;

  // Hard disc core (fills ~20% of radius)
  const disc = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.20);
  disc.addColorStop(0.0, 'rgba(240,245,255,1.0)');
  disc.addColorStop(0.7, 'rgba(220,235,255,0.95)');
  disc.addColorStop(1.0, 'rgba(200,220,255,0.0)');
  ctx.fillStyle = disc;
  ctx.fillRect(0, 0, size, size);

  // Soft atmospheric halo
  const halo = ctx.createRadialGradient(cx, cx, 0, cx, cx, cx);
  halo.addColorStop(0.0,  'rgba(200,220,255,0.30)');
  halo.addColorStop(0.25, 'rgba(180,210,255,0.15)');
  halo.addColorStop(0.55, 'rgba(160,200,255,0.05)');
  halo.addColorStop(1.0,  'rgba(0,0,0,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/** Build a radial-gradient canvas texture suitable for lens flare elements. */
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
  tex.needsUpdate = true;
  return tex;
}
