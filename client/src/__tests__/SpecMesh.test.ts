import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildSpecMesh } from '../systems/worldbuilder/objects/SpecMesh';
import type { MeshSpec } from '../network/MessageProtocol';

describe('buildSpecMesh', () => {
  const spec: MeshSpec = {
    parts: [
      { shape: 'box', size: [2, 1, 2], position: [0, 0.5, 0], color: '#3344cc' },
      { shape: 'pyramid', size: [1.5, 2, 1.5], position: [0, 2, 0], color: '#cc2233' },
    ],
  };

  it('builds a Group with one mesh per part', () => {
    const group = buildSpecMesh(spec, new THREE.Vector3(5, 0, -3), 1);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(2);
    expect(group.children.every((c) => c instanceof THREE.Mesh)).toBe(true);
  });

  it('places the group at the given position and scale', () => {
    const group = buildSpecMesh(spec, new THREE.Vector3(5, 1, -3), 2);
    expect(group.position.x).toBe(5);
    expect(group.position.z).toBe(-3);
    expect(group.scale.x).toBe(2);
  });

  it('applies each part local offset', () => {
    const group = buildSpecMesh(spec, new THREE.Vector3(0, 0, 0), 1);
    const second = group.children[1];
    expect(second.position.y).toBe(2);
  });

  it('handles an empty spec without throwing', () => {
    const group = buildSpecMesh({ parts: [] }, new THREE.Vector3(0, 0, 0), 1);
    expect(group.children.length).toBe(0);
  });

  it('falls back to a box for an unknown shape', () => {
    const weird = { parts: [{ shape: 'blob', size: [1], position: [0, 0, 0], color: '#fff' }] } as unknown as MeshSpec;
    const group = buildSpecMesh(weird, new THREE.Vector3(0, 0, 0), 1);
    expect(group.children.length).toBe(1);
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
  });
});
