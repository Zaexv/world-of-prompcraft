import * as THREE from 'three';
import { Mesh, BuildContext } from '../core/Mesh';
import { registerMesh } from '../core/MeshRegistry';
import * as G from '../../systems/worldbuilder/objects/geoCache';
import { createEmberParticles } from './fireParticles';

/**
 * AIBonfire — a "neural bonfire": instead of logs and flame, dark obsidian
 * monoliths lean over a levitating, pulsing AI core wrapped in a wireframe
 * shell and tumbling neon rings, with data motes orbiting and cyan embers
 * rising. Emissives are pushed overbright so the UnrealBloomPass picks them up.
 *
 * Self-animating: the core's `onBeforeRender` drives every moving part, so the
 * bonfire costs nothing while off-screen. Root is `noMerge` so the animated
 * sub-meshes survive buildMesh's static merge.
 */

let sharedHalo: THREE.Texture | null = null;

/** Soft radial cyan glow sprite (shared across every AI bonfire). */
function haloTexture(): THREE.Texture {
  if (sharedHalo) return sharedHalo;
  const s = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grad.addColorStop(0.0, 'rgba(210,255,255,0.95)');
  grad.addColorStop(0.25, 'rgba(90,225,255,0.50)');
  grad.addColorStop(0.6, 'rgba(40,140,255,0.16)');
  grad.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, s, s);
  sharedHalo = new THREE.CanvasTexture(canvas);
  return sharedHalo;
}

export class AIBonfire extends Mesh {
  static readonly type = 'ai_bonfire';
  static readonly category = 'prop' as const;

  build(ctx: BuildContext): THREE.Group {
    const { position: pos, scale: s } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    g.userData.noMerge = true;

    const basaltMat = new THREE.MeshStandardMaterial({
      color: 0x1c1f26, roughness: 0.85, metalness: 0.15, flatShading: true,
    });
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x12141a, roughness: 0.45, metalness: 0.35, flatShading: true,
    });
    const circuitMat = new THREE.MeshStandardMaterial({
      color: 0x66f6ff,
      emissive: new THREE.Color(0x2ee6ff).multiplyScalar(2.4),
      emissiveIntensity: 1.0,
    });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x9a5cff,
      emissive: new THREE.Color(0x7a3cff).multiplyScalar(2.0),
      emissiveIntensity: 1.0,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xd8ffff,
      emissive: new THREE.Color(0x35eaff).multiplyScalar(3.5),
      emissiveIntensity: 1.0,
      flatShading: true,
    });
    const shellMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.35, 2.0, 2.4), wireframe: true,
      transparent: true, opacity: 0.85,
    });
    const ringCyanMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.9, 2.3) });
    const ringVioletMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 0.6, 2.4) });
    const moteMat = new THREE.MeshStandardMaterial({
      color: 0xbafcff,
      emissive: new THREE.Color(0x4df0ff).multiplyScalar(2.8),
      emissiveIntensity: 1.0,
    });

    // Hexagonal obsidian dais with an inscribed circuit ring + rim rune nodes.
    const dais = new THREE.Mesh(G.cylinder(1.5 * s, 1.7 * s, 0.35 * s, 6), basaltMat);
    dais.position.y = 0.175 * s;
    dais.castShadow = true;
    dais.userData.isCollider = true;
    g.add(dais);

    const circuit = new THREE.Mesh(G.torus(1.1 * s, 0.045 * s, 6, 48), circuitMat);
    circuit.rotation.x = -Math.PI / 2;
    circuit.position.y = 0.37 * s;
    circuit.userData.noCollision = true;
    g.add(circuit);

    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const rune = new THREE.Mesh(G.box(0.14 * s, 0.14 * s, 0.14 * s), runeMat);
      rune.position.set(Math.cos(a) * 1.35 * s, 0.42 * s, Math.sin(a) * 1.35 * s);
      rune.rotation.y = -a;
      rune.userData.noCollision = true;
      g.add(rune);
    }

    // Six dark monolith shards leaning inward — the "logs" of the AI fire.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const shard = new THREE.Mesh(G.cone(0.26 * s, 1.9 * s, 4), shardMat);
      shard.position.set(Math.cos(a) * 0.8 * s, 1.1 * s, Math.sin(a) * 0.8 * s);
      // Lean the tip toward the centreline above the core.
      shard.rotation.set(Math.sin(a) * 0.42, a * 1.7, -Math.cos(a) * 0.42);
      shard.castShadow = true;
      shard.userData.isCollider = true;
      g.add(shard);
    }

    // Levitating AI core + counter-rotating wireframe shell.
    const coreY = 1.65 * s;
    const core = new THREE.Mesh(G.octahedron(0.4 * s, 1), coreMat);
    core.position.y = coreY;
    core.userData.noCollision = true;
    g.add(core);

    const shell = new THREE.Mesh(G.octahedron(0.62 * s, 1), shellMat);
    shell.position.y = coreY;
    shell.userData.noCollision = true;
    g.add(shell);

    // Two tumbling neon rings around the core.
    const ring1 = new THREE.Mesh(G.torus(0.88 * s, 0.024 * s, 5, 40), ringCyanMat);
    ring1.position.y = coreY;
    ring1.rotation.set(1.1, 0.4, 0);
    ring1.userData.noCollision = true;
    g.add(ring1);

    const ring2 = new THREE.Mesh(G.torus(1.05 * s, 0.02 * s, 5, 40), ringVioletMat);
    ring2.position.y = coreY;
    ring2.rotation.set(-0.7, 0, 0.5);
    ring2.userData.noCollision = true;
    g.add(ring2);

    // Orbiting data motes (small emissive octahedra on a spinning carrier).
    const motes = new THREE.Group();
    motes.position.y = coreY;
    const motePhase: number[] = [];
    const moteBaseY: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const mote = new THREE.Mesh(G.octahedron(0.07 * s, 0), moteMat);
      const y = (i % 2 === 0 ? 0.18 : -0.14) * s;
      mote.position.set(Math.cos(a) * 0.95 * s, y, Math.sin(a) * 0.95 * s);
      mote.userData.noCollision = true;
      motePhase.push(a * 2);
      moteBaseY.push(y);
      motes.add(mote);
    }
    g.add(motes);

    // Bloom halo around the core.
    const haloMat = new THREE.SpriteMaterial({
      map: haloTexture(),
      color: new THREE.Color(0.7, 2.2, 2.6),
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
      transparent: true,
    });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.set(4 * s, 4 * s, 1);
    halo.position.y = coreY;
    halo.userData.noCollision = true;
    g.add(halo);

    // Rising cyan "data embers".
    g.add(createEmberParticles({
      scale: s, count: 26, radius: 0.5, baseY: 1.0, rise: 2.8, speed: 1.1,
      size: 0.16, color: 0x7df4ff,
    }));

    // Drive every moving part from the core's render hook (off-screen = free).
    const ring1Axis = new THREE.Vector3(0.2, 1, 0.35).normalize();
    const ring2Axis = new THREE.Vector3(-0.4, 1, -0.15).normalize();
    let last = performance.now();
    let t = Math.random() * 10; // desync multiple bonfires
    core.onBeforeRender = (): void => {
      const now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1;
      t += dt;

      core.rotation.y += 0.6 * dt;
      core.rotation.x += 0.25 * dt;
      const pulse = Math.sin(t * 2.4);
      const coreScale = 1 + 0.07 * pulse;
      core.scale.setScalar(coreScale);
      core.position.y = coreY + 0.08 * s * Math.sin(t * 1.3);
      coreMat.emissiveIntensity = 0.85 + 0.3 * pulse;

      shell.rotation.y -= 0.35 * dt;
      shell.rotation.z += 0.2 * dt;
      shell.position.y = core.position.y;

      ring1.rotateOnAxis(ring1Axis, 0.8 * dt);
      ring2.rotateOnAxis(ring2Axis, -0.55 * dt);

      motes.rotation.y += 0.9 * dt;
      for (let i = 0; i < motes.children.length; i++) {
        motes.children[i].position.y = moteBaseY[i] + 0.1 * s * Math.sin(t * 2 + motePhase[i]);
      }

      runeMat.emissiveIntensity = 0.8 + 0.35 * Math.sin(t * 3);
      circuitMat.emissiveIntensity = 0.85 + 0.25 * Math.sin(t * 1.7 + 1);
      haloMat.opacity = 0.72 + 0.18 * pulse;
    };

    return g;
  }
}

registerMesh(AIBonfire);
