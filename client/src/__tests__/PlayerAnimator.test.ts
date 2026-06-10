import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlayerAnimator, applySailingPose, type PlayerRig } from '../animations';

function makeRig(): PlayerRig {
  const group = new THREE.Group();
  const visualRoot = new THREE.Object3D();
  group.add(visualRoot);
  const mesh = (): THREE.Mesh => new THREE.Mesh();
  return {
    group, visualRoot,
    leftLeg: mesh(), rightLeg: mesh(), leftArm: mesh(), rightArm: mesh(),
    cloak: mesh(), head: mesh(),
  };
}

const baseInput = {
  delta: 0.1,
  isMoving: false,
  velocity: new THREE.Vector3(),
  isSwimming: false,
  facingYawOverride: null as number | null,
  isGrounded: true,
  inBoat: false,
};

describe('applySailingPose', () => {
  it('reaches forward and braces the legs at full blend', () => {
    const rig = makeRig();
    applySailingPose(rig, 1, 0);
    // Arms rotated forward (negative x).
    expect(rig.leftArm!.rotation.x).toBeLessThan(-0.5);
    expect(rig.rightArm!.rotation.x).toBeLessThan(-0.5);
    // Legs braced apart (opposite z splay).
    expect(rig.leftLeg!.rotation.z).toBeGreaterThan(0);
    expect(rig.rightLeg!.rotation.z).toBeLessThan(0);
    // Torso leans into the wind.
    expect(rig.visualRoot.rotation.x).toBeLessThan(0);
  });

  it('does nothing at zero blend', () => {
    const rig = makeRig();
    applySailingPose(rig, 0, 0);
    expect(rig.leftArm!.rotation.x).toBe(0);
  });
});

describe('PlayerAnimator', () => {
  it('eases into the sailing pose while in a boat', () => {
    const anim = new PlayerAnimator();
    const rig = makeRig();
    for (let i = 0; i < 20; i++) anim.update(rig, { ...baseInput, inBoat: true });
    expect(rig.leftArm!.rotation.x).toBeLessThan(-0.4); // hands on the rigging
  });

  it('faces the movement direction', () => {
    const anim = new PlayerAnimator();
    const rig = makeRig();
    const input = { ...baseInput, isMoving: true, velocity: new THREE.Vector3(5, 0, 0) };
    for (let i = 0; i < 40; i++) anim.update(rig, input);
    // Moving +X → yaw atan2(1,0) = PI/2.
    expect(rig.group.rotation.y).toBeCloseTo(Math.PI / 2, 1);
    expect(anim.facing).toBeCloseTo(Math.PI / 2, 1);
  });

  it('returns to a neutral forward offset out of the boat', () => {
    const anim = new PlayerAnimator();
    const rig = makeRig();
    for (let i = 0; i < 10; i++) anim.update(rig, { ...baseInput, inBoat: true });
    for (let i = 0; i < 40; i++) anim.update(rig, { ...baseInput, inBoat: false });
    expect(rig.visualRoot.position.z).toBeCloseTo(0, 2);
  });
});
