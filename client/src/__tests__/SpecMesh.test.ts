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

  it('builds capsule and torus parts', () => {
    const organic: MeshSpec = {
      parts: [
        { shape: 'capsule', size: [0.3, 1.2], position: [0, 0.6, 0], color: '#8B4513' },
        { shape: 'torus', size: [0.5, 0.15], position: [0, 1, 0], color: '#ffcc00' },
      ],
    };
    const group = buildSpecMesh(organic, new THREE.Vector3(0, 0, 0), 1);
    const [capsule, torus] = group.children as THREE.Mesh[];
    expect(capsule.geometry).toBeInstanceOf(THREE.CapsuleGeometry);
    expect(torus.geometry).toBeInstanceOf(THREE.TorusGeometry);
  });

  it('scales a sphere with unequal radii into an ellipsoid', () => {
    const egg: MeshSpec = {
      parts: [{ shape: 'sphere', size: [0.4, 0.6, 0.4], position: [0, 0.5, 0], color: '#f0e68c' }],
    };
    const group = buildSpecMesh(egg, new THREE.Vector3(0, 0, 0), 1);
    const mesh = group.children[0] as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    expect(box.max.x).toBeCloseTo(0.4, 1);
    expect(box.max.y).toBeCloseTo(0.6, 1);
  });

  it('lays a capsule horizontally when axis is set', () => {
    const body: MeshSpec = {
      parts: [
        { shape: 'capsule', size: [0.3, 1.4], position: [0, 0.4, 0], axis: 'z', color: '#8B4513' },
      ],
    };
    const group = buildSpecMesh(body, new THREE.Vector3(0, 0, 0), 1);
    const mesh = group.children[0] as THREE.Mesh;
    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    // Long axis now Z, not Y.
    expect(box.max.z - box.min.z).toBeCloseTo(1.4, 1);
    expect(box.max.y - box.min.y).toBeCloseTo(0.6, 1);
  });

  it('applies material finishes from the mat hint', () => {
    const finishes: MeshSpec = {
      parts: [
        { shape: 'box', size: [1, 1, 1], position: [0, 0, 0], color: '#ccc', mat: 'metal' },
        { shape: 'sphere', size: [0.5], position: [0, 1, 0], color: '#3cf', mat: 'glow' },
        { shape: 'box', size: [1, 1, 1], position: [0, 2, 0], color: '#9df', mat: 'glass' },
      ],
    };
    const group = buildSpecMesh(finishes, new THREE.Vector3(0, 0, 0), 1);
    const mats = group.children.map((c) => (c as THREE.Mesh).material as THREE.MeshStandardMaterial);
    expect(mats[0].metalness).toBeGreaterThan(0.5);
    expect(mats[1].emissiveIntensity).toBeGreaterThan(0);
    expect(mats[2].transparent).toBe(true);
  });

  it('falls back to a box for an unknown shape', () => {
    const weird = { parts: [{ shape: 'blob', size: [1], position: [0, 0, 0], color: '#fff' }] } as unknown as MeshSpec;
    const group = buildSpecMesh(weird, new THREE.Vector3(0, 0, 0), 1);
    expect(group.children.length).toBe(1);
    const mesh = group.children[0] as THREE.Mesh;
    expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
  });
});
