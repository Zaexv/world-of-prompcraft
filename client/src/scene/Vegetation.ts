import * as THREE from 'three';
import { Terrain } from './Terrain';
import { Water } from './Water';

interface Footprint {
  x: number;
  z: number;
  radius: number;
}

/**
 * Teldrassil-themed vegetation: massive ancient trees, medium trees,
 * glowing mushrooms, ferns/bushes, and hanging vines.
 */
export class Vegetation {
  /** Massive ancient tree groups, exposed for mesh-based collision. */
  public readonly massiveTreeGroups: THREE.Group[] = [];

  // Instanced meshes for batch rendering
  private mediumTrunks: THREE.InstancedMesh;
  private mediumCanopies: THREE.InstancedMesh;
  private mushroomStems: THREE.InstancedMesh;
  private mushroomCaps: THREE.InstancedMesh;
  private ferns: THREE.InstancedMesh;

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    buildingFootprints: Footprint[],
  ) {
    // --- Seeded pseudo-random ---
    let seed = 42;
    const rand = (): number => {
      seed = (seed * 16807 + 0) % 2147483647;
      return seed / 2147483647;
    };

    const dummy = new THREE.Object3D();
    const tempColor = new THREE.Color();

    // Helper: check if position is blocked by building footprints or water
    const isBlocked = (px: number, pz: number, margin = 0): boolean => {
      const py = terrain.getHeightAt(px, pz);
      if (py < Water.LEVEL + 0.5) return true;
      for (const fp of buildingFootprints) {
        const dx = px - fp.x;
        const dz = pz - fp.z;
        if (dx * dx + dz * dz < (fp.radius + margin) * (fp.radius + margin)) {
          return true;
        }
      }
      return false;
    };

    // =================================================================
    // 1. MASSIVE ANCIENT TREES (3-5, placed as individual groups)
    // =================================================================
    const massiveTreePositions: { x: number; z: number }[] = [];
    const massiveCount = 4;
    let massivePlaced = 0;

    for (let attempts = 0; attempts < 200 && massivePlaced < massiveCount; attempts++) {
      const tx = (rand() - 0.5) * 350;
      const tz = (rand() - 0.5) * 350;
      if (isBlocked(tx, tz, 12)) continue;

      const ty = terrain.getHeightAt(tx, tz);
      if (ty > 10) continue;

      // Check distance from other massive trees
      let tooClose = false;
      for (const pos of massiveTreePositions) {
        const dx = tx - pos.x;
        const dz = tz - pos.z;
        if (dx * dx + dz * dz < 60 * 60) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      massiveTreePositions.push({ x: tx, z: tz });
      const treeGroup = this.createMassiveTree(scene, tx, ty, tz, rand);
      this.massiveTreeGroups.push(treeGroup);
      massivePlaced++;
    }

    // =================================================================
    // 2. MEDIUM TREES (instanced, 80 target)
    // =================================================================
    const medTreeCount = 80;
    const medTrunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 14, 7);
    const medTrunkMat = new THREE.MeshStandardMaterial({
      color: 0x3b2a1a,
      roughness: 0.95,
    });
    const medCanopyGeo = new THREE.SphereGeometry(4, 7, 5);
    const medCanopyMat = new THREE.MeshStandardMaterial({
      color: 0x2d6b3a,
      roughness: 0.75,
    });

    this.mediumTrunks = new THREE.InstancedMesh(medTrunkGeo, medTrunkMat, medTreeCount);
    this.mediumCanopies = new THREE.InstancedMesh(medCanopyGeo, medCanopyMat, medTreeCount);
    this.mediumTrunks.castShadow = true;
    this.mediumTrunks.receiveShadow = true;
    this.mediumCanopies.castShadow = true;
    this.mediumCanopies.receiveShadow = true;

    let medPlaced = 0;
    for (let attempts = 0; attempts < 3000 && medPlaced < medTreeCount; attempts++) {
      const tx = (rand() - 0.5) * 450;
      const tz = (rand() - 0.5) * 450;
      if (isBlocked(tx, tz, 2)) continue;

      const ty = terrain.getHeightAt(tx, tz);
      if (ty > 12) continue;
      if (ty > 8 && rand() > 0.3) continue;

      const scale = 0.6 + rand() * 0.8;
      const rotY = rand() * Math.PI * 2;
      const trunkH = 14 * scale;

      // Trunk
      dummy.position.set(tx, ty + trunkH * 0.5, tz);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, rotY, 0);
      dummy.updateMatrix();
      this.mediumTrunks.setMatrixAt(medPlaced, dummy.matrix);

      // Canopy
      dummy.position.set(tx, ty + trunkH + 1.5 * scale, tz);
      dummy.scale.set(scale * 1.2, scale * (0.8 + rand() * 0.4), scale * 1.2);
      dummy.updateMatrix();
      this.mediumCanopies.setMatrixAt(medPlaced, dummy.matrix);

      // Visible green with purple tint variation
      const g = 0.3 + rand() * 0.2;
      const purpleMix = rand() * 0.15;
      tempColor.setRGB(0.15 + purpleMix, g, 0.18 + purpleMix * 0.6);
      this.mediumCanopies.setColorAt(medPlaced, tempColor);

      medPlaced++;
    }

    this.mediumTrunks.count = medPlaced;
    this.mediumCanopies.count = medPlaced;
    this.mediumTrunks.instanceMatrix.needsUpdate = true;
    this.mediumCanopies.instanceMatrix.needsUpdate = true;
    if (this.mediumCanopies.instanceColor)
      this.mediumCanopies.instanceColor.needsUpdate = true;

    scene.add(this.mediumTrunks);
    scene.add(this.mediumCanopies);

    // =================================================================
    // 3. GLOWING MUSHROOMS (instanced, ~100)
    // =================================================================
    const mushroomCount = 100;
    const stemGeo = new THREE.CylinderGeometry(0.06, 0.08, 0.5, 5);
    const stemMat = new THREE.MeshStandardMaterial({
      color: 0xd8d0c0,
      roughness: 0.7,
    });
    const capGeo = new THREE.SphereGeometry(0.2, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x00ffaa,
      emissive: 0x00ffaa,
      emissiveIntensity: 1.8,
      roughness: 0.3,
      transparent: true,
      opacity: 0.9,
    });

    this.mushroomStems = new THREE.InstancedMesh(stemGeo, stemMat, mushroomCount);
    this.mushroomCaps = new THREE.InstancedMesh(capGeo, capMat, mushroomCount);

    let mushPlaced = 0;
    for (let attempts = 0; attempts < 2000 && mushPlaced < mushroomCount; attempts++) {
      // Bias mushrooms toward massive tree locations
      let mx: number, mz: number;
      if (massiveTreePositions.length > 0 && rand() > 0.3) {
        const tree = massiveTreePositions[Math.floor(rand() * massiveTreePositions.length)];
        mx = tree.x + (rand() - 0.5) * 30;
        mz = tree.z + (rand() - 0.5) * 30;
      } else {
        mx = (rand() - 0.5) * 400;
        mz = (rand() - 0.5) * 400;
      }

      if (isBlocked(mx, mz)) continue;
      const my = terrain.getHeightAt(mx, mz);
      if (my > 10) continue;

      const scale = 0.5 + rand() * 1.0;
      const rotY = rand() * Math.PI * 2;

      // Stem
      dummy.position.set(mx, my + 0.25 * scale, mz);
      dummy.scale.set(scale, scale, scale);
      dummy.rotation.set(0, rotY, (rand() - 0.5) * 0.3);
      dummy.updateMatrix();
      this.mushroomStems.setMatrixAt(mushPlaced, dummy.matrix);

      // Cap
      dummy.position.set(mx, my + 0.5 * scale, mz);
      dummy.updateMatrix();
      this.mushroomCaps.setMatrixAt(mushPlaced, dummy.matrix);

      // Color variation: teal or purple
      if (rand() > 0.5) {
        tempColor.setHex(0x00ffaa);
      } else {
        tempColor.setHex(0xaa44ff);
      }
      this.mushroomCaps.setColorAt(mushPlaced, tempColor);

      mushPlaced++;
    }

    this.mushroomStems.count = mushPlaced;
    this.mushroomCaps.count = mushPlaced;
    this.mushroomStems.instanceMatrix.needsUpdate = true;
    this.mushroomCaps.instanceMatrix.needsUpdate = true;
    if (this.mushroomCaps.instanceColor)
      this.mushroomCaps.instanceColor.needsUpdate = true;

    scene.add(this.mushroomStems);
    scene.add(this.mushroomCaps);

    // =================================================================
    // 4. FERNS / BUSHES (instanced, ~150)
    // =================================================================
    const fernCount = 150;
    const fernGeo = new THREE.ConeGeometry(0.8, 0.6, 5);
    const fernMat = new THREE.MeshStandardMaterial({
      color: 0x2d7a38,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });

    this.ferns = new THREE.InstancedMesh(fernGeo, fernMat, fernCount);
    this.ferns.receiveShadow = true;

    let fernPlaced = 0;
    for (let attempts = 0; attempts < 3000 && fernPlaced < fernCount; attempts++) {
      const fx = (rand() - 0.5) * 420;
      const fz = (rand() - 0.5) * 420;
      if (isBlocked(fx, fz, 1)) continue;

      const fy = terrain.getHeightAt(fx, fz);
      if (fy > 11) continue;

      const scale = 0.6 + rand() * 1.2;
      dummy.position.set(fx, fy + 0.15 * scale, fz);
      dummy.scale.set(scale, scale * (0.5 + rand() * 0.5), scale);
      dummy.rotation.set(
        (rand() - 0.5) * 0.2,
        rand() * Math.PI * 2,
        (rand() - 0.5) * 0.2,
      );
      dummy.updateMatrix();
      this.ferns.setMatrixAt(fernPlaced, dummy.matrix);

      // Brighter green with variation
      const g = 0.35 + rand() * 0.2;
      tempColor.setRGB(0.12 + rand() * 0.08, g, 0.15 + rand() * 0.08);
      this.ferns.setColorAt(fernPlaced, tempColor);

      fernPlaced++;
    }

    this.ferns.count = fernPlaced;
    this.ferns.instanceMatrix.needsUpdate = true;
    if (this.ferns.instanceColor)
      this.ferns.instanceColor.needsUpdate = true;

    scene.add(this.ferns);

    // =================================================================
    // 5. HANGING VINES on massive trees
    // =================================================================
    this.createHangingVines(scene, terrain, massiveTreePositions, rand);
  }

  // ------------------------------------------------------------------
  // Create a single massive ancient tree (non-instanced, unique group)
  // ------------------------------------------------------------------
  private createMassiveTree(
    scene: THREE.Scene,
    x: number,
    y: number,
    z: number,
    rand: () => number,
  ): THREE.Group {
    const group = new THREE.Group();

    const barkMat = new THREE.MeshStandardMaterial({
      color: 0x2a1c10,
      roughness: 0.95,
    });

    const trunkRadius = 5 + rand() * 3;
    const trunkHeight = 50 + rand() * 30;

    // Main trunk
    const trunkGeo = new THREE.CylinderGeometry(
      trunkRadius * 0.7,
      trunkRadius,
      trunkHeight,
      12,
    );
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.position.y = trunkHeight * 0.5;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Root flare at base
    const rootGeo = new THREE.CylinderGeometry(
      trunkRadius,
      trunkRadius * 1.6,
      trunkHeight * 0.15,
      12,
    );
    const roots = new THREE.Mesh(rootGeo, barkMat);
    roots.position.y = trunkHeight * 0.075;
    roots.castShadow = true;
    group.add(roots);

    // Gnarled root extensions
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + rand() * 0.5;
      const rootExtGeo = new THREE.CylinderGeometry(0.8, 1.5, trunkRadius * 2, 6);
      const rootExt = new THREE.Mesh(rootExtGeo, barkMat);
      rootExt.position.set(
        Math.cos(angle) * trunkRadius * 1.3,
        1,
        Math.sin(angle) * trunkRadius * 1.3,
      );
      rootExt.rotation.set(
        Math.sin(angle) * 0.6,
        0,
        -Math.cos(angle) * 0.6,
      );
      rootExt.castShadow = true;
      group.add(rootExt);
    }

    // Massive canopy: multiple overlapping spheres and cones
    const canopyDarkGreen = new THREE.MeshStandardMaterial({
      color: 0x2a6b35,
      roughness: 0.8,
    });
    const canopyPurpleTint = new THREE.MeshStandardMaterial({
      color: 0x3a4060,
      roughness: 0.75,
    });

    const canopyBaseY = trunkHeight * 0.75;
    const canopySpread = trunkRadius * 3;

    // Large canopy spheres
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + rand() * 0.5;
      const dist = canopySpread * (0.3 + rand() * 0.7);
      const sphereR = 6 + rand() * 5;
      const canopyGeo = new THREE.SphereGeometry(sphereR, 7, 5);
      const mat = rand() > 0.3 ? canopyDarkGreen : canopyPurpleTint;
      const canopy = new THREE.Mesh(canopyGeo, mat);
      canopy.position.set(
        Math.cos(angle) * dist,
        canopyBaseY + rand() * 10,
        Math.sin(angle) * dist,
      );
      canopy.castShadow = true;
      group.add(canopy);
    }

    // Central top canopy cones
    for (let i = 0; i < 3; i++) {
      const coneR = 8 + rand() * 4;
      const coneH = 10 + rand() * 8;
      const coneGeo = new THREE.ConeGeometry(coneR, coneH, 8);
      const mat = rand() > 0.5 ? canopyDarkGreen : canopyPurpleTint;
      const cone = new THREE.Mesh(coneGeo, mat);
      cone.position.set(
        (rand() - 0.5) * 5,
        canopyBaseY + 5 + rand() * 10,
        (rand() - 0.5) * 5,
      );
      cone.castShadow = true;
      group.add(cone);
    }

    // Branch stubs for vine attachment points
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + rand() * 0.4;
      const branchH = canopyBaseY * (0.5 + rand() * 0.4);
      const branchGeo = new THREE.CylinderGeometry(0.4, 0.8, canopySpread * 0.5, 5);
      const branch = new THREE.Mesh(branchGeo, barkMat);
      branch.position.set(
        Math.cos(angle) * trunkRadius * 1.2,
        branchH,
        Math.sin(angle) * trunkRadius * 1.2,
      );
      branch.rotation.set(
        Math.sin(angle) * 0.8,
        0,
        -Math.cos(angle) * 0.8,
      );
      branch.castShadow = true;
      group.add(branch);
    }

    group.position.set(x, y, z);
    scene.add(group);
    return group;
  }

  // ------------------------------------------------------------------
  // Hanging vines on massive trees
  // ------------------------------------------------------------------
  private createHangingVines(
    scene: THREE.Scene,
    _terrain: Terrain,
    treePositions: { x: number; z: number }[],
    rand: () => number,
  ): void {
    const vineMat = new THREE.MeshStandardMaterial({
      color: 0x1a3a15,
      roughness: 0.9,
    });
    const vineGeo = new THREE.CylinderGeometry(0.05, 0.04, 8, 4);

    // Count total vines for InstancedMesh allocation
    const vineCounts: number[] = [];
    let totalVines = 0;
    for (let _vi = 0; _vi < treePositions.length; _vi++) {
      const count = 12 + Math.floor(rand() * 10);
      vineCounts.push(count);
      totalVines += count;
    }

    // Use single shared geometry + InstancedMesh for all vines
    const vineInstanced = new THREE.InstancedMesh(vineGeo, vineMat, totalVines);
    vineInstanced.castShadow = true;
    const vineDummy = new THREE.Object3D();

    let vineIdx = 0;
    for (let t = 0; t < treePositions.length; t++) {
      const tree = treePositions[t];
      for (let i = 0; i < vineCounts[t]; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = 3 + rand() * 12;
        const hangHeight = 25 + rand() * 30;
        const vineLength = 5 + rand() * 12;
        const vineScale = vineLength / 8; // base geo is height 8

        vineDummy.position.set(
          tree.x + Math.cos(angle) * dist,
          hangHeight - vineLength * 0.5,
          tree.z + Math.sin(angle) * dist,
        );
        vineDummy.rotation.set(
          (rand() - 0.5) * 0.15,
          0,
          (rand() - 0.5) * 0.15,
        );
        vineDummy.scale.set(0.6 + rand() * 0.8, vineScale, 0.6 + rand() * 0.8);
        vineDummy.updateMatrix();
        vineInstanced.setMatrixAt(vineIdx, vineDummy.matrix);
        vineIdx++;
      }
    }
    vineInstanced.instanceMatrix.needsUpdate = true;
    scene.add(vineInstanced);
  }
}
