import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Boats } from '../scene/Boats';
import { Water } from '../scene/Water';
import type { Terrain } from '../scene/Terrain';

function makeTerrain(getHeightAt: (x: number, z: number) => number): Terrain {
  return { getHeightAt } as Terrain;
}

describe('Boats', () => {
  it('spawns a boat on submerged terrain', () => {
    const scene = new THREE.Scene();
    const terrain = makeTerrain(() => Water.LEVEL - 2);

    const boats = new Boats(scene, terrain);

    expect(boats.groups).toHaveLength(1);
    expect(scene.children).toContain(boats.groups[0]);
    expect(boats.groups[0].position.y).toBeCloseTo(Water.LEVEL + 0.25, 5);
  });

  it('does not spawn a boat when no water spawn point is found', () => {
    const scene = new THREE.Scene();
    const terrain = makeTerrain(() => Water.LEVEL + 4);

    const boats = new Boats(scene, terrain);

    expect(boats.groups).toHaveLength(0);
  });

  it('marks boat structural meshes as colliders', () => {
    const scene = new THREE.Scene();
    const terrain = makeTerrain(() => Water.LEVEL - 2);
    const boats = new Boats(scene, terrain);

    const colliders: THREE.Object3D[] = [];
    boats.groups[0].traverse((child) => {
      if (child.userData.isCollider === true) colliders.push(child);
    });

    expect(colliders.length).toBeGreaterThanOrEqual(3);
  });
});
