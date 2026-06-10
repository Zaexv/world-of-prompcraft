// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildMesh, hasMesh } from '../meshes';

function countMeshes(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => { if (c instanceof THREE.Mesh) n++; });
  return n;
}

const ctx = { position: new THREE.Vector3(0, 0, 0), scale: 1, label: 'smoke' };

describe('mesh registry smoke — authored content builds & is non-empty', () => {
  const types = [
    'malaka_church',
    'npc_individual_eltito_01',
    'npc_individual_luisa_patatera',
    'npc_individual_merchant_malaka_01',
    'npc_individual_guard_malaka_01',
    'biome_volcano',
  ];
  for (const t of types) {
    it(`${t} is registered and builds with geometry`, () => {
      expect(hasMesh(t)).toBe(true);
      const obj = buildMesh(t, { ...ctx, position: ctx.position.clone() });
      expect(obj).toBeDefined();
      expect(countMeshes(obj!)).toBeGreaterThan(0);
    });
  }
});
