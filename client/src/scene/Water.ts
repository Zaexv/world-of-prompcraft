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

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec2 uv1 = vUv * 8.0 + vec2(time * 0.05, time * 0.03);
  vec2 uv2 = vUv * 16.0 + vec2(-time * 0.08, time * 0.04);
  
  float n = noise(uv1) * 0.6 + noise(uv2) * 0.4;
  float foam = smoothstep(0.6, 0.85, n);
  
  gl_FragColor = vec4(1.0, 1.0, 1.0, foam * 0.5);
}
`;

// ── Water class ─────────────────────────────────────────────────────────────

export class Water {
  public mesh: THREE.Mesh;
  private readonly waterMesh: THREE.Mesh;
  private readonly waterMat: THREE.MeshStandardMaterial;
  private readonly foam: THREE.Mesh;
  private readonly foamMat: THREE.ShaderMaterial;
  private readonly normalTexture: THREE.Texture;
  private waveTime = 0;

  private readonly cubeCamera: THREE.CubeCamera;
  private readonly cubeRenderTarget: THREE.WebGLCubeRenderTarget;
  private hasCaptured = false; 

  private reflectionIntensity = 1.5;
  private targetIntensity = 1.5;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;

  public static readonly LEVEL = -1.0;

  static getWaterLevel(): number {
    return Water.LEVEL;
  }

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene    = scene;
    this.renderer = renderer;

    const geometry = new THREE.PlaneGeometry(2048, 2048, 1, 1);

    this.normalTexture = this.generateNormalMap(512);
    this.normalTexture.wrapS = this.normalTexture.wrapT = THREE.RepeatWrapping;
    this.normalTexture.repeat.set(4, 4);

    this.cubeRenderTarget = new THREE.WebGLCubeRenderTarget(128, {
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    this.cubeCamera = new THREE.CubeCamera(200, 2000, this.cubeRenderTarget);
    this.cubeCamera.position.y = Water.LEVEL + 50; 
    this.cubeCamera.visible = false;
    scene.add(this.cubeCamera);

    this.waterMat = new THREE.MeshStandardMaterial({
      color: 0x2080a0,
      roughness: 0.1,
      metalness: 0.6,
      envMap: this.cubeRenderTarget.texture,
      envMapIntensity: this.reflectionIntensity,
      normalMap: this.normalTexture,
      normalScale: new THREE.Vector2(0.8, 0.8),
      transparent: true,
      opacity: 0.5, // Increased transparency
      depthWrite: false,
      depthTest: true,
      depthFunc: THREE.LessEqualDepth, // Improved depth handling
      // The sea plane sits at y=-1 and the terrain noise crosses that same level
      // at every shoreline, leaving the two surfaces nearly coplanar there. Since
      // water tests (but doesn't write) depth, that coplanarity makes the depth
      // comparison flip with camera angle/distance — the waterline shimmers and
      // whole patches blink out as the camera moves. Biasing the water's tested
      // depth slightly toward the camera makes it win the comparison cleanly at
      // the boundary instead of fighting the terrain for it.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
      side: THREE.DoubleSide,
    });
    
    // Inject analytical Blinn-Phong sun specular.
    this.waterMat.onBeforeCompile = (shader) => {
      shader.uniforms['sunDirection'] = { value: SUN_DIR };
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
          float spec = pow(NdotH, 50.0) * 4.0;
          gl_FragColor.rgb += vec3(1.0, 0.95, 0.8) * spec;
        }
        #include <tonemapping_fragment>`,
      );
    };

    this.waterMesh = new THREE.Mesh(geometry, this.waterMat);
    this.waterMesh.rotation.x = -Math.PI / 2;
    this.waterMesh.position.y = Water.LEVEL;
    this.waterMesh.frustumCulled = false;
    this.waterMesh.renderOrder = 0; // Ensure water renders first
    scene.add(this.waterMesh);
    this.mesh = this.waterMesh; // for external access

    // --- Shore foam overlay ---
    const foamGeom = new THREE.PlaneGeometry(2048, 2048, 1, 1);
    this.foamMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
      },
      vertexShader: FOAM_VERT,
      fragmentShader: FOAM_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      side: THREE.DoubleSide,
    });
    this.foam = new THREE.Mesh(foamGeom, this.foamMat);
    this.foam.rotation.x = -Math.PI / 2;
    this.foam.position.y = Water.LEVEL + 0.02;
    this.foam.frustumCulled = false;
    this.foam.renderOrder = 1; // Render after water
    scene.add(this.foam);
  }

  update(delta: number, camera: THREE.Camera, playerX: number, playerZ: number): void {
    this.waveTime += delta;
    this.foamMat.uniforms.time.value = this.waveTime;

    // Follow player
    this.waterMesh.position.x = playerX;
    this.waterMesh.position.z = playerZ;
    this.foam.position.x      = playerX;
    this.foam.position.z      = playerZ;

    // Reflection quality culling
    if (!this.hasCaptured || Math.abs(this.cubeCamera.position.x - playerX) > 100 || Math.abs(this.cubeCamera.position.z - playerZ) > 100) {
      this.cubeCamera.position.x = playerX;
      this.cubeCamera.position.z = playerZ;
    }

    const dist = (camera as THREE.PerspectiveCamera).position.distanceTo(this.waterMesh.position);
    this.targetIntensity = dist < 40 ? 1.5 : 0.8;
    this.reflectionIntensity += (this.targetIntensity - this.reflectionIntensity) * delta * 2;
    this.waterMat.envMapIntensity = this.reflectionIntensity;

    if (!this.hasCaptured) {
      this.waterMesh.visible = false;
      this.foam.visible      = false;
      this.cubeCamera.update(this.renderer, this.scene);
      this.waterMesh.visible = true;
      this.foam.visible      = true;
      this.hasCaptured = true;
    }
  }

  private generateNormalMap(size: number): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(size, size);
    const data = imageData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;
        const u = x / size * Math.PI * 8;
        const v = y / size * Math.PI * 8;

        let nx = Math.sin(u) * 0.5 + Math.sin(u * 2.1 + v) * 0.3 + Math.cos(v * 1.5) * 0.2;
        let ny = Math.cos(v) * 0.5 + Math.sin(v * 2.1 + u) * 0.3 + Math.cos(u * 1.5) * 0.2;
        let nz = 1.0;
        
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx /= len; ny /= len; nz /= len;

        data[idx]     = Math.round((nx * 0.5 + 0.5) * 255);
        data[idx + 1] = Math.round((ny * 0.5 + 0.5) * 255);
        data[idx + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
  }
}
