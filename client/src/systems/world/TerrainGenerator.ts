/**
 * TerrainGenerator — Encapsulates terrain mesh generation.
 *
 * Handles tree mesh creation with various shapes and biome-specific styling.
 */

import * as THREE from 'three';
import { BiomeMaterials, TreeShape } from './BiomeManager';

/** Pick a random element from an array. */
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * TerrainGenerator — Centralized terrain/vegetation mesh generation.
 */
export class TerrainGenerator {
  private trunkGeometry: THREE.CylinderGeometry;
  private coneCanopyGeo: THREE.ConeGeometry;
  private roundCanopyGeo: THREE.SphereGeometry;
  private tallCanopyGeo: THREE.ConeGeometry;
  private weepingCanopyGeo: THREE.SphereGeometry;
  private deadBranchGeo: THREE.CylinderGeometry;
  private crystalGeo: THREE.ConeGeometry;
  private mushroomCapGeo: THREE.CylinderGeometry;
  private vineGeo: THREE.CylinderGeometry;
  private vineMat: THREE.MeshStandardMaterial;
  private charMat: THREE.MeshStandardMaterial;
  private crystalMat: THREE.MeshStandardMaterial;

  constructor() {
    // Shared geometries — different tree shapes
    this.trunkGeometry = new THREE.CylinderGeometry(0.15, 0.25, 2, 6);
    this.coneCanopyGeo = new THREE.ConeGeometry(1.2, 3, 7);
    this.roundCanopyGeo = new THREE.SphereGeometry(1.5, 7, 5);
    this.tallCanopyGeo = new THREE.ConeGeometry(0.8, 4.5, 7);
    this.weepingCanopyGeo = new THREE.SphereGeometry(1.8, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.7);
    this.deadBranchGeo = new THREE.CylinderGeometry(0.04, 0.08, 1.5, 4);
    this.crystalGeo = new THREE.ConeGeometry(0.5, 3, 5);
    this.mushroomCapGeo = new THREE.CylinderGeometry(1.5, 0.3, 0.5, 8);
    this.vineGeo = new THREE.CylinderGeometry(0.02, 0.015, 2, 3);
    this.vineMat = new THREE.MeshStandardMaterial({ color: 0x1a3a15, roughness: 0.9 });
    this.charMat = new THREE.MeshStandardMaterial({ color: 0x1a0a05, roughness: 1.0 });
    this.crystalMat = new THREE.MeshStandardMaterial({
      color: 0x6a9abb,
      emissive: 0x223344,
      emissiveIntensity: 0.4,
      roughness: 0.3,
      metalness: 0.2,
    });
  }

  /**
   * Build a tree mesh group from a shape type.
   *
   * @param shape Tree shape type
   * @param scale Tree scale
   * @param mats Biome-specific materials
   */
  buildTree(
    shape: TreeShape,
    scale: number,
    mats: BiomeMaterials,
  ): THREE.Group {
    const tree = new THREE.Group();

    // Trunk (shared by most shapes)
    const trunk = new THREE.Mesh(this.trunkGeometry, mats.trunk);
    trunk.position.y = scale;
    trunk.scale.set(scale, scale, scale);
    trunk.castShadow = true;
    trunk.userData.isCollider = true;

    switch (shape) {
      case TreeShape.Cone: {
        tree.add(trunk);
        const canopy = new THREE.Mesh(this.coneCanopyGeo, pick(mats.canopy));
        canopy.position.y = scale * 2 + scale * 1.5;
        canopy.scale.set(scale, scale, scale);
        canopy.castShadow = false;
        canopy.receiveShadow = true;
        canopy.userData.distanceShadowCaster = true;
        canopy.userData.shadowDistance = 36;
        tree.add(canopy);
        break;
      }
      case TreeShape.Round: {
        tree.add(trunk);
        const canopy = new THREE.Mesh(this.roundCanopyGeo, pick(mats.canopy));
        canopy.position.y = scale * 2 + scale * 1.5;
        canopy.scale.set(scale * 1.2, scale * 0.9, scale * 1.2);
        canopy.castShadow = false;
        canopy.receiveShadow = true;
        tree.add(canopy);
        break;
      }
      case TreeShape.Tall: {
        tree.add(trunk);
        const canopy = new THREE.Mesh(this.tallCanopyGeo, pick(mats.canopy));
        canopy.position.y = scale * 2 + scale * 2.5;
        canopy.scale.set(scale * 0.8, scale * 1.2, scale * 0.8);
        canopy.castShadow = false;
        canopy.receiveShadow = true;
        tree.add(canopy);
        break;
      }
      case TreeShape.Weeping: {
        tree.add(trunk);
        const canopy = new THREE.Mesh(this.weepingCanopyGeo, pick(mats.canopy));
        canopy.position.y = scale * 1.8 + scale;
        canopy.scale.set(scale * 1.1, scale * 0.8, scale * 1.1);
        canopy.castShadow = false;
        canopy.receiveShadow = true;
        tree.add(canopy);
        break;
      }
      case TreeShape.Dead: {
        tree.add(trunk);
        for (let i = 0; i < 3; i++) {
          const angle = (Math.PI * 2 * i) / 3;
          const branch = new THREE.Mesh(this.deadBranchGeo, this.charMat);
          branch.position.set(
            Math.cos(angle) * scale * 0.3,
            scale * 1.5 + i * 0.3,
            Math.sin(angle) * scale * 0.3,
          );
          branch.rotation.z = angle;
          branch.scale.set(scale, scale, scale);
          tree.add(branch);
        }
        break;
      }
      case TreeShape.Crystal: {
        tree.add(trunk);
        const crystal = new THREE.Mesh(this.crystalGeo, this.crystalMat);
        crystal.position.y = scale * 2 + scale * 1.5;
        crystal.scale.set(scale, scale, scale);
        crystal.castShadow = true;
        tree.add(crystal);
        break;
      }
      case TreeShape.Mushroom: {
        const stem = new THREE.Mesh(this.trunkGeometry, this.vineMat);
        stem.position.y = scale * 0.8;
        stem.scale.set(scale * 0.3, scale, scale * 0.3);
        stem.castShadow = true;
        tree.add(stem);

        const cap = new THREE.Mesh(this.mushroomCapGeo, pick(mats.canopy));
        cap.position.y = scale * 2.5;
        cap.scale.set(scale * 1.5, scale * 0.5, scale * 1.5);
        cap.castShadow = false;
        cap.receiveShadow = true;
        tree.add(cap);

        const vine1 = new THREE.Mesh(this.vineGeo, this.vineMat);
        vine1.position.set(-scale * 0.8, scale * 1.5, 0);
        vine1.rotation.z = -0.3;
        tree.add(vine1);

        const vine2 = new THREE.Mesh(this.vineGeo, this.vineMat);
        vine2.position.set(scale * 0.8, scale * 1.5, 0);
        vine2.rotation.z = 0.3;
        tree.add(vine2);
        break;
      }
    }

    return tree;
  }
}
