/**
 * Shared low-poly builders for procedural biome creatures.
 *
 * Each builder fills a THREE.Group with a faceted, flat-shaded monster built
 * around the origin (feet/base near y=0, body rising up), then the registration
 * wrapper in creatures/index.ts copies the spawn position + scale on top. Glow
 * accents use emissive intensities past the renderer's bloom threshold so the
 * UnrealBloom pass makes eyes/cores genuinely radiant.
 *
 * Builders deliberately avoid the humanoid limb-pivot names (leftArm/leftLeg…)
 * for non-humanoid bodies — those creatures simply idle-bob via the base
 * animation, which is the correct look for spiders, serpents, wisps, etc.
 */
import * as THREE from 'three';
import { vmat, box } from '../individual/_VoxelKit';

export interface CreaturePalette {
  body: number;
  body2: number;
  accent: number; // emissive glow (cracks / cores / runes)
  eye: number;    // emissive eye colour
}

function glow(color: number, intensity = 3.0): THREE.MeshStandardMaterial {
  return vmat(color, { roughness: 0.25, emissive: color, emissiveIntensity: intensity });
}

function rock(color: number): THREE.MeshStandardMaterial {
  return vmat(color, { roughness: 0.9, metalness: 0.05 });
}

/** A bent two-segment leg (thigh + shin) anchored at `(x, y, z)`, splayed outward. */
function legAt(
  parent: THREE.Object3D, x: number, y: number, z: number,
  len: number, r: number, mat: THREE.Material, outward: number, forward = 0,
): void {
  const hip = new THREE.Group();
  hip.position.set(x, y, z);
  const thigh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, len, 5), mat);
  thigh.rotation.z = outward;
  thigh.rotation.x = forward;
  thigh.position.set(Math.sin(outward) * len * 0.5, -Math.cos(outward) * len * 0.4, 0);
  hip.add(thigh);
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.4, len, 5), mat);
  shin.position.set(Math.sin(outward) * len, -len * 0.7, Math.sin(forward) * len * 0.4);
  hip.add(shin);
  hip.traverse((c) => { if (c instanceof THREE.Mesh) c.castShadow = true; });
  parent.add(hip);
}

// ── Wraith — floating hooded specter ──────────────────────────────────────────
export function buildWraith(g: THREE.Group, p: CreaturePalette): void {
  const robe = vmat(p.body, { roughness: 0.85 });
  // Flared robe body, hovering off the ground.
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.7, 8), robe);
  body.position.y = 1.15;
  body.castShadow = true;
  g.add(body);
  // Tattered hem points.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 4), vmat(p.body2, { roughness: 0.9 }));
    tip.rotation.x = Math.PI;
    tip.position.set(Math.cos(a) * 0.42, 0.35, Math.sin(a) * 0.42);
    g.add(tip);
  }
  // Hood + dark void face.
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 8), robe);
  hood.position.y = 2.05;
  hood.castShadow = true;
  g.add(hood);
  g.add(box(0.4, 0.4, 0.2, vmat(0x05060a, { roughness: 0.5 }), 0, 1.95, 0.18));
  // Two glowing eyes in the void.
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), glow(p.eye, 4.5));
    eye.position.set(sx * 0.1, 1.98, 0.28);
    g.add(eye);
  }
  // Wispy outstretched arms (thin tapered cones reaching forward).
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.09, 0.8, 5), robe);
    arm.position.set(sx * 0.4, 1.4, 0.25);
    arm.rotation.x = -1.1;
    arm.rotation.z = sx * 0.4;
    g.add(arm);
    const claw = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), glow(p.accent, 2.0));
    claw.position.set(sx * 0.55, 1.05, 0.55);
    g.add(claw);
  }
}

// ── Arachnid — spider / crawler / (scorpion via opts) ─────────────────────────
export function buildArachnid(
  g: THREE.Group, p: CreaturePalette, opts: { tail?: boolean; claws?: boolean; legs?: number } = {},
): void {
  const body = rock(p.body);
  const nLegs = opts.legs ?? 8;
  // Cephalothorax + abdomen.
  const ceph = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), body);
  ceph.scale.set(1.1, 0.7, 1.1);
  ceph.position.set(0, 0.55, 0.2);
  ceph.castShadow = true;
  g.add(ceph);
  const abdomen = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), vmat(p.body2, { roughness: 0.85 }));
  abdomen.scale.set(1, 0.85, 1.2);
  abdomen.position.set(0, 0.6, -0.4);
  abdomen.castShadow = true;
  g.add(abdomen);
  // Glow markings on the abdomen.
  abdomen.add((() => { const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), glow(p.accent, 2.8)); m.position.set(0, 0.1, -0.2); return m; })());
  // Legs, splayed in pairs along the sides.
  const legMat = rock(p.body);
  const half = Math.floor(nLegs / 2);
  for (let i = 0; i < half; i++) {
    const t = half > 1 ? i / (half - 1) : 0.5;
    const z = 0.45 - t * 0.85;
    const fwd = (t - 0.5) * 1.0;
    legAt(g, 0.28, 0.6, z, 0.55, 0.045, legMat, 1.1, fwd);
    legAt(g, -0.28, 0.6, z, 0.55, 0.045, legMat, -1.1, fwd);
  }
  // Eye cluster on the front of the cephalothorax.
  for (const [ex, ey] of [[-0.12, 0.62], [0.12, 0.62], [-0.06, 0.7], [0.06, 0.7], [0, 0.6]]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 5), glow(p.eye, 4.0));
    eye.position.set(ex, ey, 0.5);
    g.add(eye);
  }
  // Pincer claws (scorpion).
  if (opts.claws) {
    for (const sx of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.4, 5), body);
      arm.position.set(sx * 0.3, 0.5, 0.65);
      arm.rotation.x = -1.3;
      g.add(arm);
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 4), body);
      claw.rotation.x = -1.6;
      claw.position.set(sx * 0.34, 0.5, 0.95);
      g.add(claw);
    }
  }
  // Arched segmented tail + stinger (scorpion).
  if (opts.tail) {
    let ty = 0.7; let tz = -0.7;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Mesh(new THREE.SphereGeometry(0.13 - i * 0.012, 7, 6), body);
      ty += 0.18; tz += i < 3 ? -0.04 : 0.16;
      seg.position.set(0, ty, tz);
      g.add(seg);
    }
    const sting = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 5), glow(p.accent, 2.5));
    sting.position.set(0, ty - 0.02, tz + 0.18);
    sting.rotation.x = 1.6;
    g.add(sting);
  }
}

// ── Serpent — coiled snake rising to a head ───────────────────────────────────
export function buildSerpent(g: THREE.Group, p: CreaturePalette): void {
  const body = vmat(p.body, { roughness: 0.55, metalness: 0.1 });
  const scale2 = vmat(p.body2, { roughness: 0.55 });
  const N = 12;
  let y = 0.2; let z = -0.5; let radius = 0.26;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const seg = new THREE.Mesh(new THREE.SphereGeometry(radius, 8, 6), i % 2 ? scale2 : body);
    // S-curve coil rising upward.
    const x = Math.sin(t * Math.PI * 2.2) * (0.5 - t * 0.4);
    y = 0.2 + t * 1.5;
    z = -0.5 + Math.cos(t * Math.PI * 2.2) * (0.4 - t * 0.3) + t * 0.5;
    seg.position.set(x, y, z);
    seg.castShadow = true;
    g.add(seg);
    radius = 0.26 - t * 0.12;
  }
  // Head.
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), body);
  head.scale.set(1.1, 0.8, 1.3);
  head.position.set(0, y + 0.18, z + 0.18);
  head.castShadow = true;
  g.add(head);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), glow(p.eye, 4.5));
    eye.position.set(sx * 0.09, y + 0.24, z + 0.3);
    g.add(eye);
  }
  // Forked tongue.
  const tongue = box(0.02, 0.02, 0.18, glow(p.accent, 1.5), 0, y + 0.14, z + 0.36);
  g.add(tongue);
}

// ── Quadruped — wolf / hound / boar ───────────────────────────────────────────
export function buildQuadruped(
  g: THREE.Group, p: CreaturePalette, opts: { tusks?: boolean; mane?: boolean } = {},
): void {
  const body = rock(p.body);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 1.0, 8), body);
  torso.rotation.z = Math.PI / 2;
  torso.scale.set(1, 1, 0.85);
  torso.position.set(0, 0.78, 0);
  torso.castShadow = true;
  g.add(torso);
  // Glow accent stripes/cracks along the back.
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), glow(p.accent, 2.6));
    c.position.set(0, 1.05, 0.3 - i * 0.3);
    g.add(c);
  }
  // Legs (4).
  const legMat = rock(p.body2);
  for (const sx of [-1, 1]) {
    for (const sz of [0.32, -0.32]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.7, 5), legMat);
      leg.position.set(sx * 0.24, 0.35, sz);
      leg.castShadow = true;
      g.add(leg);
    }
  }
  // Head + snout at the front.
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), body);
  head.position.set(0, 0.95, 0.6);
  head.castShadow = true;
  g.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 5), body);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.9, 0.85);
  g.add(snout);
  // Ears.
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), body);
    ear.position.set(sx * 0.13, 1.18, 0.55);
    g.add(ear);
  }
  // Glowing eyes.
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), glow(p.eye, 4.0));
    eye.position.set(sx * 0.1, 0.98, 0.78);
    g.add(eye);
  }
  // Tail.
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.09, 0.5, 5), body);
  tail.position.set(0, 0.95, -0.55);
  tail.rotation.x = -0.7;
  g.add(tail);
  // Bristly mane (hound/wolf).
  if (opts.mane) {
    for (let i = 0; i < 6; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.26, 4), glow(p.accent, 2.0));
      spike.position.set(((i % 2) - 0.5) * 0.18, 1.12, 0.5 - i * 0.12);
      spike.rotation.x = -0.3;
      g.add(spike);
    }
  }
  // Tusks (boar).
  if (opts.tusks) {
    for (const sx of [-1, 1]) {
      const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 4), vmat(0xe8d2b0, { roughness: 0.5 }));
      tusk.position.set(sx * 0.1, 0.85, 0.92);
      tusk.rotation.x = -2.4;
      tusk.rotation.z = sx * 0.3;
      g.add(tusk);
    }
  }
}

// ── Golem / brute / sentinel — big rocky humanoid ─────────────────────────────
export function buildGolem(
  g: THREE.Group, p: CreaturePalette, opts: { sentinel?: boolean } = {},
): void {
  const body = rock(p.body);
  const body2 = rock(p.body2);
  // Bulky torso.
  const torso = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), body);
  torso.scale.set(1.1, 1.25, 0.95);
  torso.position.y = 1.25;
  torso.castShadow = true;
  g.add(torso);
  // Glowing core + cracks.
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), glow(p.accent, 3.5));
  core.position.set(0, 1.3, 0.4);
  g.add(core);
  for (const [cx, cy] of [[-0.2, 1.5], [0.22, 1.1], [0, 0.95]]) {
    const crack = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), glow(p.accent, 2.0));
    crack.position.set(cx, cy, 0.42);
    g.add(crack);
  }
  // Small sunken head.
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), body2);
  head.position.y = 1.95;
  head.castShadow = true;
  g.add(head);
  if (opts.sentinel) {
    // Armoured visor with a glowing slit.
    g.add(box(0.4, 0.12, 0.05, glow(p.eye, 3.0), 0, 1.95, 0.22));
  } else {
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), glow(p.eye, 4.0));
      eye.position.set(sx * 0.09, 1.98, 0.2);
      g.add(eye);
    }
  }
  // Massive block arms ending in fists, hanging at the sides.
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.0, 6), body2);
    arm.position.set(sx * 0.7, 1.2, 0);
    arm.castShadow = true;
    g.add(arm);
    const fist = new THREE.Mesh(new THREE.IcosahedronGeometry(0.26, 0), body);
    fist.position.set(sx * 0.72, 0.6, 0);
    fist.castShadow = true;
    g.add(fist);
  }
  // Thick legs.
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.85, 6), body);
    leg.position.set(sx * 0.26, 0.42, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  // Sentinel shoulder plates.
  if (opts.sentinel) {
    for (const sx of [-1, 1]) {
      g.add((() => { const m = box(0.4, 0.18, 0.5, body, sx * 0.55, 1.7, 0); return m; })());
    }
  }
}

// ── Elemental — floating glowing core with orbiting motes ─────────────────────
export function buildElemental(g: THREE.Group, p: CreaturePalette): void {
  // Bright pulsing core.
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), glow(p.accent, 4.5));
  core.position.y = 1.2;
  g.add(core);
  // Inner darker shell for depth.
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), vmat(p.body, { roughness: 0.3, transparent: true, opacity: 0.4, emissive: p.body2, emissiveIntensity: 1.2 }));
  shell.position.y = 1.2;
  g.add(shell);
  // Wispy tendrils trailing below.
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 4), glow(p.body2, 2.0));
    tail.rotation.x = Math.PI;
    tail.position.set(Math.cos(a) * 0.18, 0.75, Math.sin(a) * 0.18);
    g.add(tail);
  }
  // Orbiting motes.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const mote = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), glow(p.eye, 4.5));
    mote.position.set(Math.cos(a) * 0.55, 1.2 + Math.sin(a) * 0.3, Math.sin(a) * 0.55);
    g.add(mote);
  }
}

// ── Treant — walking tree ─────────────────────────────────────────────────────
export function buildTreant(g: THREE.Group, p: CreaturePalette): void {
  const bark = rock(p.body);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.7, 7), bark);
  trunk.position.y = 1.0;
  trunk.castShadow = true;
  g.add(trunk);
  // Root feet.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const root = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 5), bark);
    root.rotation.x = Math.PI;
    root.position.set(Math.cos(a) * 0.32, 0.18, Math.sin(a) * 0.32);
    root.rotation.z = Math.cos(a) * 0.3;
    g.add(root);
  }
  // Branch arms.
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 0.9, 5), bark);
    arm.position.set(sx * 0.45, 1.4, 0);
    arm.rotation.z = sx * 1.0;
    arm.castShadow = true;
    g.add(arm);
  }
  // Leafy crown.
  for (const [lx, ly, lz, r] of [[0, 2.1, 0, 0.5], [-0.3, 1.95, 0.1, 0.34], [0.32, 1.98, -0.1, 0.34], [0, 1.95, -0.3, 0.3]]) {
    const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), vmat(p.body2, { roughness: 0.85 }));
    leaves.position.set(lx, ly, lz);
    leaves.castShadow = true;
    g.add(leaves);
  }
  // Glowing eyes in the bark.
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), glow(p.eye, 3.5));
    eye.position.set(sx * 0.13, 1.35, 0.34);
    g.add(eye);
  }
}

// ── Lurker — squat amphibian ambush predator (bog lurker) ─────────────────────
export function buildLurker(g: THREE.Group, p: CreaturePalette): void {
  const body = rock(p.body);
  const belly = vmat(p.body2, { roughness: 0.85 });
  // Wide squat body.
  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), body);
  torso.scale.set(1.2, 0.7, 1.0);
  torso.position.y = 0.55;
  torso.castShadow = true;
  g.add(torso);
  // Pale underbelly.
  const under = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), belly);
  under.scale.set(1.1, 0.5, 0.9);
  under.position.set(0, 0.4, 0.2);
  g.add(under);
  // Wide gaping mouth.
  g.add(box(0.7, 0.1, 0.3, vmat(0x401818, { roughness: 0.6 }), 0, 0.5, 0.5));
  // Bulging eyes on top.
  for (const sx of [-1, 1]) {
    const stalk = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), body);
    stalk.position.set(sx * 0.28, 0.95, 0.3);
    g.add(stalk);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), glow(p.eye, 3.5));
    eye.position.set(sx * 0.28, 1.02, 0.42);
    g.add(eye);
  }
  // Four squat splayed legs.
  for (const sx of [-1, 1]) {
    for (const sz of [0.35, -0.35]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.4, 6), body);
      leg.position.set(sx * 0.55, 0.2, sz);
      leg.rotation.z = sx * 0.5;
      leg.castShadow = true;
      g.add(leg);
      // Webbed foot.
      const foot = box(0.26, 0.06, 0.3, body, sx * 0.7, 0.03, sz);
      g.add(foot);
    }
  }
  // Warty glow spots on the back.
  for (const [wx, wz] of [[-0.2, -0.1], [0.25, 0.1], [0, -0.25]]) {
    const wart = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), glow(p.accent, 2.0));
    wart.position.set(wx, 0.85, wz);
    g.add(wart);
  }
}

// ── Insect — giant wasp ───────────────────────────────────────────────────────
export function buildWasp(g: THREE.Group, p: CreaturePalette): void {
  const body = vmat(p.body, { roughness: 0.5 });
  const stripe = vmat(p.body2, { roughness: 0.5 });
  // Striped segmented abdomen.
  let z = -0.2;
  for (let i = 0; i < 4; i++) {
    const seg = new THREE.Mesh(new THREE.SphereGeometry(0.26 - i * 0.04, 8, 6), i % 2 ? stripe : body);
    z -= 0.22;
    seg.position.set(0, 1.0, z);
    seg.castShadow = true;
    g.add(seg);
  }
  // Stinger.
  const sting = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 5), glow(p.accent, 2.5));
  sting.rotation.x = -1.4;
  sting.position.set(0, 1.0, z - 0.2);
  g.add(sting);
  // Thorax + head.
  const thorax = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), body);
  thorax.position.set(0, 1.05, 0.1);
  thorax.castShadow = true;
  g.add(thorax);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), body);
  head.position.set(0, 1.05, 0.42);
  g.add(head);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), glow(p.eye, 4.0));
    eye.position.set(sx * 0.1, 1.08, 0.55);
    g.add(eye);
  }
  // Translucent wings.
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xddeeff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, flatShading: true });
  for (const sx of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.3), wingMat);
    wing.position.set(sx * 0.4, 1.3, 0);
    wing.rotation.z = sx * 0.4;
    wing.rotation.y = sx * 0.3;
    g.add(wing);
  }
  // Six legs.
  for (const sx of [-1, 1]) {
    for (const lz of [0.25, 0.0, -0.25]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.015, 0.5, 4), body);
      leg.position.set(sx * 0.25, 0.75, lz);
      leg.rotation.z = sx * 0.7;
      g.add(leg);
    }
  }
}
