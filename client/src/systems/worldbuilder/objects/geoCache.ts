/**
 * Global geometry cache shared across ALL builder files.
 *
 * Three.js geometry creation (new BoxGeometry, etc.) allocates vertex buffers
 * and uploads data to the GPU.  When the same shape is used in multiple
 * buildings/props across chunks the cost is paid repeatedly — this cache
 * makes it pay once.
 *
 * Key format: "TypeName|param0|param1|..."  (all numbers rounded to 3 dp)
 */

import * as THREE from 'three';

const _geoStore = new Map<string, THREE.BufferGeometry>();

function k(...args: (string | number)[]): string {
  return args.map(a => (typeof a === 'number' ? a.toFixed(3) : a)).join('|');
}

export function box(w: number, h: number, d: number): THREE.BoxGeometry {
  const key = k('box', w, h, d);
  let g = _geoStore.get(key) as THREE.BoxGeometry | undefined;
  if (!g) { g = new THREE.BoxGeometry(w, h, d); _geoStore.set(key, g); }
  return g;
}

export function cylinder(rt: number, rb: number, h: number, segs: number): THREE.CylinderGeometry {
  const key = k('cyl', rt, rb, h, segs);
  let g = _geoStore.get(key) as THREE.CylinderGeometry | undefined;
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, segs); _geoStore.set(key, g); }
  return g;
}

export function cone(r: number, h: number, segs: number): THREE.ConeGeometry {
  const key = k('cone', r, h, segs);
  let g = _geoStore.get(key) as THREE.ConeGeometry | undefined;
  if (!g) { g = new THREE.ConeGeometry(r, h, segs); _geoStore.set(key, g); }
  return g;
}

export function sphere(r: number, ws: number, hs: number,
  phiStart = 0, phiLen = Math.PI * 2, thetaStart = 0, thetaLen = Math.PI,
): THREE.SphereGeometry {
  const key = k('sph', r, ws, hs, phiStart, phiLen, thetaStart, thetaLen);
  let g = _geoStore.get(key) as THREE.SphereGeometry | undefined;
  if (!g) { g = new THREE.SphereGeometry(r, ws, hs, phiStart, phiLen, thetaStart, thetaLen); _geoStore.set(key, g); }
  return g;
}

export function torus(r: number, tube: number, radSegs: number, tubSegs: number): THREE.TorusGeometry {
  const key = k('tor', r, tube, radSegs, tubSegs);
  let g = _geoStore.get(key) as THREE.TorusGeometry | undefined;
  if (!g) { g = new THREE.TorusGeometry(r, tube, radSegs, tubSegs); _geoStore.set(key, g); }
  return g;
}

export function octahedron(r: number, detail = 0): THREE.OctahedronGeometry {
  const key = k('oct', r, detail);
  let g = _geoStore.get(key) as THREE.OctahedronGeometry | undefined;
  if (!g) { g = new THREE.OctahedronGeometry(r, detail); _geoStore.set(key, g); }
  return g;
}

export function dodecahedron(r: number, detail = 0): THREE.DodecahedronGeometry {
  const key = k('dod', r, detail);
  let g = _geoStore.get(key) as THREE.DodecahedronGeometry | undefined;
  if (!g) { g = new THREE.DodecahedronGeometry(r, detail); _geoStore.set(key, g); }
  return g;
}

/** Total cached geometries (useful for debugging). */
export function cachedGeoCount(): number { return _geoStore.size; }
