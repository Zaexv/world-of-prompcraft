import * as THREE from 'three';
import { SUN_DIR } from './Lighting';

// ── Shore foam overlay shader ───────────────────────────────────────────────

const FOAM_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FOAM_FRAG = /* glsl */`
uniform float time;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i),               hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

void main() {
  vec2 uv1 = vUv * 12.0 + vec2(time * 0.14,  time * 0.06);
  vec2 uv2 = vUv *  6.0 + vec2(time * 0.09, -time * 0.04);
  float foam = smoothstep(0.50, 0.72, vnoise(uv1) * vnoise(uv2) * 1.6);
  float pulse = clamp(sin(time * 0.38) * 0.65 + 0.55, 0.0, 1.0);
  gl_FragColor = vec4(0.92, 0.97, 1.0, foam * pulse * 0.20);
}
`;

// ── Water class ─────────────────────────────────────────────────────────────

/**
 * Water plane using PBR + a CubeCamera environment map for sky/terrain
 * reflections. Update frequency scales with camera height:
 *  - Close to water (camera Y < NEAR_THRESHOLD): 0.5 s — captures player.
 *  - Far away: ENV_UPDATE_INTERVAL — cheap sky-only refresh.
 *
 * An analytical Blinn-Phong sun specular is injected into the fragment shader
 * so the sun glint is always frame-accurate regardless of cubemap freshness.
 */
export class Water {
  public mesh: THREE.Mesh;

  private readonly waterMesh: THREE.Mesh;
  private readonly waterMat: THREE.MeshStandardMaterial;
  private readonly foam: THREE.Mesh;
  private readonly foamMat: THREE.ShaderMaterial;
  private readonly normalTexture: THREE.CanvasTexture;
  private waveTime = 0;

  private readonly cubeCamera: THREE.CubeCamera;
  private readonly cubeRenderTarget: THREE.WebGLCubeRenderTarget;
  private cubeUpdateTimer: number;

  // When camera Y is below this, update cubemap fast to capture the player.
  private static readonly NEAR_THRESHOLD    = 25;
  private static readonly NEAR_INTERVAL     = 0.5;
  private static readonly DISTANT_INTERVAL  = 3.0;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;

  /** Water surface Y level — physics / collision reference, never changes. */
  public static readonly LEVEL = -1.0;

  static getWaterLevel(): number {
    return Water.LEVEL;
  }

  private static readonly AMP_A   = 0.26;
  private static readonly AMP_B   = 0.09;
  private static readonly FREQ_A  = 0.38;
  private static readonly FREQ_B  = 1.25;
  private static readonly PHASE_B = 1.05;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene    = scene;
    this.renderer = renderer;

    const geometry = new THREE.PlaneGeometry(2048, 2048, 1, 1);

    // Procedural wave normal map tiled 8× for fine ripple detail.
    const normalCanvas = this.generateNormalMap(512);
    this.normalTexture = new THREE.CanvasTexture(normalCanvas);
    this.normalTexture.wrapS = this.normalTexture.wrapT = THREE.RepeatWrapping;
    this.normalTexture.repeat.set(8, 8);

    // 128 px cube faces — plenty for sky/terrain reflections, very cheap to update.
    this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(128, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCamera = new THREE.CubeCamera(0.5, 2000, this.cubeRenderTarget);
    this.cubeCamera.position.y = Water.LEVEL;
    scene.add(this.cubeCamera);

    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x0d4a5a,
      roughness: 0.05,
      metalness: 0.90,
      envMap: this.cubeRenderTarget.texture,
      envMapIntensity: 1.5,
      normalMap: this.normalTexture,
      normalScale: new THREE.Vector2(0.4, 0.4),
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    // Inject analytical Blinn-Phong sun specular.
    // vWorldPosition is declared only in the vertex shader (envmap_pars_vertex),
    // not the fragment shader, so referencing it there causes a linker error and
    // the mesh silently disappears. We declare our own varying in both stages.
    this.waterMat.onBeforeCompile = (shader) => {
      shader.uniforms['sunDirection'] = { value: SUN_DIR };

      // Vertex: declare + write the varying.
      // clipping_planes_vertex is the final include in the vertex main, so
      // `transformed` is fully resolved by the time we write here.
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWaterWorldPos;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        '#include <clipping_planes_vertex>',
        `#include <clipping_planes_vertex>
        vWaterWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );

      // Fragment: receive varying, declare uniform, add specular before tonemapping.
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        `#include <common>
        uniform vec3 sunDirection;
        varying vec3 vWaterWorldPos;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <tonemapping_fragment>',
        `{
          vec3 sunDir  = normalize(sunDirection);
          vec3 viewDir = normalize(cameraPosition - vWaterWorldPos);
          vec3 H       = normalize(sunDir + viewDir);
          float NdotH  = max(dot(vec3(0.0, 1.0, 0.0), H), 0.0);
          // Exponent 80 → wide glint that mimics wave-scattered sunlight.
          float sunSpec = pow(NdotH, 80.0) * 2.5;
          gl_FragColor.rgb += vec3(1.0, 0.95, 0.70) * sunSpec;
        }
        #include <tonemapping_fragment>`,
      );
    };

    this.waterMesh = new THREE.Mesh(geometry, this.waterMat);
    this.waterMesh.rotation.x   = -Math.PI / 2;
    this.waterMesh.position.y   = Water.LEVEL;
    this.waterMesh.frustumCulled = false;
    scene.add(this.waterMesh);

    this.mesh = this.waterMesh;

    this.foamMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: FOAM_VERT,
      fragmentShader: FOAM_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    this.foam = new THREE.Mesh(
      new THREE.PlaneGeometry(2048, 2048, 1, 1),
      this.foamMat,
    );
    this.foam.rotation.x    = -Math.PI / 2;
    this.foam.position.y    = Water.LEVEL + 0.02;
    this.foam.frustumCulled = false;
    scene.add(this.foam);

    // Capture env map on first frame.
    this.cubeUpdateTimer = Water.DISTANT_INTERVAL;
  }

  /**
   * Call every frame. `camera` drives the adaptive update rate so player
   * reflections appear when the camera is close to water level.
   */
  update(delta: number, camera: THREE.Camera, playerX?: number, playerZ?: number): void {
    this.waveTime += delta;

    this.foamMat.uniforms['time'].value = this.waveTime;

    // Scroll normal map UVs at two rates for organic-looking ripples.
    this.normalTexture.offset.x = this.waveTime * 0.018;
    this.normalTexture.offset.y = this.waveTime * 0.011;

    const waveY =
      Water.AMP_A * Math.sin(this.waveTime * Water.FREQ_A) +
      Water.AMP_B * Math.sin(this.waveTime * Water.FREQ_B + Water.PHASE_B);

    this.waterMesh.position.y = Water.LEVEL + waveY;
    this.foam.position.y      = Water.LEVEL + waveY + 0.02;

    if (playerX !== undefined && playerZ !== undefined) {
      this.waterMesh.position.x  = playerX;
      this.waterMesh.position.z  = playerZ;
      this.foam.position.x       = playerX;
      this.foam.position.z       = playerZ;
      this.cubeCamera.position.x = playerX;
      this.cubeCamera.position.z = playerZ;
    }

    // Close to water → fast update so the player appears in the reflection.
    const near     = (camera as THREE.PerspectiveCamera).position.y < Water.NEAR_THRESHOLD;
    const interval = near ? Water.NEAR_INTERVAL : Water.DISTANT_INTERVAL;

    this.cubeUpdateTimer += delta;
    if (this.cubeUpdateTimer >= interval) {
      this.cubeUpdateTimer = 0;
      // Hide water so it does not self-reflect (front face would appear in the
      // upward cube face and tint the sky reflection teal).
      this.waterMesh.visible = false;
      this.foam.visible      = false;
      this.cubeCamera.update(this.renderer, this.scene);
      this.waterMesh.visible = true;
      this.foam.visible      = true;
    }
  }

  private generateNormalMap(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const s1 = 0.05, s2 = 0.12, s3 = 0.03;

        const nx = Math.sin(x * s1) * Math.cos(y * s2) * 0.3
                 + Math.sin(x * s2 + y * s1) * 0.2
                 + Math.cos(x * s3 - y * s3) * 0.1;
        const ny = Math.cos(x * s2) * Math.sin(y * s1) * 0.3
                 + Math.cos(x * s1 - y * s2) * 0.2
                 + Math.sin(x * s3 + y * s3) * 0.1;

        data[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = 220;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }
}
