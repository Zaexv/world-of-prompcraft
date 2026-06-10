// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// Audio is irrelevant here and Tone.js has no real AudioContext under happy-dom.
vi.mock('../audio/AudioSystem', () => ({
  AudioSystem: { getInstance: () => ({ playSfx: vi.fn() }) },
}));

import { BoatSystem } from '../systems/BoatSystem';
import { buildMesh, hasMesh } from '../meshes';
import type { PlayerController } from '../entities/PlayerController';

function countMeshes(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => { if (c instanceof THREE.Mesh) n++; });
  return n;
}

// Minimal controller stand-in: BoatSystem only reads isSwimming/position and
// writes inBoat.
function fakeController(): PlayerController {
  return {
    isSwimming: false,
    inBoat: false,
    position: new THREE.Vector3(10, 0, -5),
  } as unknown as PlayerController;
}

describe('Boat mesh', () => {
  it('is registered and builds with geometry', () => {
    expect(hasMesh('boat_rowboat')).toBe(true);
    const obj = buildMesh('boat_rowboat', { position: new THREE.Vector3(), scale: 1 });
    expect(obj).toBeDefined();
    // Parts are merged by material (draw-call optimization), so expect a handful
    // of merged meshes — one per wood/sail material.
    expect(countMeshes(obj!)).toBeGreaterThanOrEqual(4);
  });
});

describe('BoatSystem — board on water, leave on land', () => {
  it('starts inactive', () => {
    const scene = new THREE.Scene();
    const sys = new BoatSystem(scene);
    expect(sys.isActive).toBe(false);
  });

  it('boards when the player enters water and seats them at deck height', () => {
    const scene = new THREE.Scene();
    const sys = new BoatSystem(scene);
    const ctrl = fakeController();
    const group = new THREE.Group();
    group.position.copy(ctrl.position);

    ctrl.isSwimming = true;
    sys.update(ctrl, group, 0.1);

    expect(ctrl.inBoat).toBe(true);
    expect(sys.isActive).toBe(true);
    // Player is lifted onto the boat, not left at the swim Y.
    expect(group.position.y).toBeGreaterThan(ctrl.position.y - 0.5);
  });

  it('leaves when the player reaches land and fully deactivates', () => {
    const scene = new THREE.Scene();
    const sys = new BoatSystem(scene);
    const ctrl = fakeController();
    const group = new THREE.Group();

    ctrl.isSwimming = true;
    sys.update(ctrl, group, 0.1);
    expect(ctrl.inBoat).toBe(true);

    // Back onto land; run past the leave animation window.
    ctrl.isSwimming = false;
    for (let i = 0; i < 10; i++) sys.update(ctrl, group, 0.1);

    expect(ctrl.inBoat).toBe(false);
    expect(sys.isActive).toBe(false);
  });
});
