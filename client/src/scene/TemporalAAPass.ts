import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';

// Exponential-moving-average temporal AA.
// Each frame: output = mix(history, currentRender, 1/frames).
// Ghosting window ≈ `frames` frames. Never freezes; no full-cycle wait.

const VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

const FRAG = /* glsl */`
uniform sampler2D tCurrent;
uniform sampler2D tHistory;
uniform float uBlend;
varying vec2 vUv;
void main() {
  vec4 curr = texture2D(tCurrent, vUv);
  vec4 hist = texture2D(tHistory, vUv);
  gl_FragColor = mix(hist, curr, uBlend);
}
`;

export class TemporalAAPass extends Pass {
  private readonly history: THREE.WebGLRenderTarget;
  private readonly mat: THREE.ShaderMaterial;
  private readonly fsq: FullScreenQuad;
  private readonly blendFactor: number;
  private initialized = false;

  constructor(width: number, height: number, frames = 5) {
    super();
    this.blendFactor = 1 / frames;

    this.history = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
    });

    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tCurrent: { value: null },
        tHistory: { value: null },
        uBlend:   { value: this.blendFactor },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });

    this.fsq = new FullScreenQuad(this.mat);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ): void {
    // On the very first frame skip history (nothing valid stored yet).
    const factor = this.initialized ? this.blendFactor : 1.0;
    this.initialized = true;

    this.mat.uniforms.tCurrent.value = readBuffer.texture;
    this.mat.uniforms.tHistory.value  = this.history.texture;
    this.mat.uniforms.uBlend.value    = factor;

    // 1. Write blended result to writeBuffer (consumed by downstream passes).
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.fsq.render(renderer);

    // 2. Copy blended result into history so next frame can reference it.
    //    Read from writeBuffer, write to history — different targets, safe.
    this.mat.uniforms.tCurrent.value = writeBuffer.texture;
    this.mat.uniforms.uBlend.value   = 1.0; // pure copy, history not sampled
    renderer.setRenderTarget(this.history);
    this.fsq.render(renderer);
  }

  override setSize(width: number, height: number): void {
    this.history.setSize(width, height);
    this.initialized = false; // discard stale history on resize
  }

  override dispose(): void {
    this.history.dispose();
    this.mat.dispose();
    this.fsq.dispose();
  }
}
