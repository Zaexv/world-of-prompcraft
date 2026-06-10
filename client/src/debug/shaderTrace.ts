import * as THREE from 'three';

/**
 * Runtime shader-compile tracer. The PerfHUD key dump only gives the packed
 * program cache key (opaque integers); this patches the WebGL context so every
 * newly-compiled program logs its readable `#define` header plus markers that
 * identify our custom materials. Diff the boot version of a material against the
 * version that compiles when you reach a new zone — the differing `#define` IS
 * the cause.
 *
 * Usage:
 *   1. `localStorage.shaderTrace = '1'` then reload (captures boot too), OR
 *      `window.__shaderTrace = true` live.
 *   2. Walk to the area that spikes (e.g. Fort Malaka).
 *   3. `copy(window.__shaderLog)` — a deduped array of every compiled program with
 *      `{ t (ms since load), material, flags, defines }`. Boot entries have small
 *      `t`; zone-entry ones have large `t`. Paste it to diff.
 *
 * Material tags are accurate: TERRAIN/WATER come from our unique injected GLSL
 * (`aEmissive` / `vWaterWorldPos`); clearcoat/instanced/skinned/depth come from
 * ACTIVE `#define`s (not the inert `#ifdef` blocks that fooled the first version).
 *
 * Off by default (zero cost); toggle the global flag at will.
 */
export function installShaderTrace(renderer: THREE.WebGLRenderer): void {
  const gl = renderer.getContext() as WebGLRenderingContext & {
    __tracePatched?: boolean;
  };
  if (gl.__tracePatched) return;
  gl.__tracePatched = true;

  // Default off (zero cost). Set localStorage.shaderTrace = '1' to capture from
  // the very first compile (boot + warmup) so zone-entry variants can be diffed
  // against what warmup already produced — anything logged after boot is provably
  // NOT warmed (dedup below). Toggle live too: window.__shaderTrace = true.
  let bootOn = false;
  try { bootOn = localStorage.getItem('shaderTrace') === '1'; } catch { /* ignore */ }
  const w = window as unknown as { __shaderTrace?: boolean; __shaderLog?: unknown[] };
  w.__shaderTrace = bootOn;
  w.__shaderLog = [];
  const seen = new Set<string>();

  type TracedShader = WebGLShader & { __src?: string };
  const origSource = gl.shaderSource.bind(gl);
  gl.shaderSource = function (shader: WebGLShader, source: string): void {
    (shader as TracedShader).__src = source;
    return origSource(shader, source);
  };

  const origCompile = gl.compileShader.bind(gl);
  gl.compileShader = function (shader: WebGLShader): void {
    origCompile(shader);
    if (!w.__shaderTrace) return;

    const src = (shader as TracedShader).__src ?? '';
    // One handler call per shader; key off the vertex shader (it carries the same
    // define header as the fragment, and `aEmissive` only appears there).
    if (!src.includes('void main')) return;

    // ACTIVE #define names (lines beginning `#define `), not the inert `#ifdef`
    // blocks that exist in every chunk — that distinction is what makes the tags
    // trustworthy this time.
    const defineLines = src
      .split('\n')
      .filter((l) => l.startsWith('#define '))
      .map((l) => l.slice(8).trim());
    const names = new Set(defineLines.map((l) => l.split(/\s+/)[0]));
    const has = (d: string): boolean => names.has(d);

    const tags: string[] = [];
    if (src.includes('aEmissive')) tags.push('TERRAIN');       // unique injected marker
    if (src.includes('vWaterWorldPos')) tags.push('WATER');    // unique injected marker
    if (has('USE_CLEARCOAT')) tags.push('clearcoat');
    if (has('USE_INSTANCING')) tags.push('instanced');
    if (has('USE_SKINNING')) tags.push('skinned');
    if (has('DEPTH_PACKING')) tags.push('depth');

    const interesting = [
      'USE_MAP', 'USE_NORMALMAP', 'USE_ROUGHNESSMAP', 'USE_METALNESSMAP', 'USE_EMISSIVEMAP',
      'USE_ENVMAP', 'USE_SHADOWMAP', 'USE_FOG', 'FOG_EXP2', 'USE_COLOR',
      'USE_ALPHAMAP', 'ALPHATEST', 'FLAT_SHADED', 'DOUBLE_SIDED', 'FLIP_SIDED',
    ];
    const flags = interesting.filter(has);
    // include light/clip COUNTS with their value
    for (const dl of defineLines) {
      if (/^NUM_(POINT|DIR|SPOT|HEMI)_LIGHTS?\b/.test(dl) && !dl.endsWith(' 0')) flags.push(dl);
      if (/^NUM_CLIPPING_PLANES\b/.test(dl) && !dl.endsWith(' 0')) flags.push(dl);
    }

    const material = tags.join('+') || 'standard/basic';
    const id = `${material}::${defineLines.join('|')}`;
    if (seen.has(id)) return; // each novel variant logged once per session
    seen.add(id);

    const entry = {
      t: Math.round(performance.now()),
      material,
      flags: flags.join(' '),
      defines: defineLines.join(' '),
    };
    w.__shaderLog?.push(entry);
    console.warn(
      `%c[shaderTrace +${entry.t}ms] ${material} %c${entry.flags}`,
      'color:#0ff;font-weight:bold',
      'color:#9f9',
    );
  };

  console.info(
    '%c[shaderTrace] installed — localStorage.shaderTrace="1" + reload, walk to spike, then copy(window.__shaderLog).',
    'color:#ff0',
  );
}
