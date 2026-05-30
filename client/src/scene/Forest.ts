import * as THREE from 'three';
import { AssetPaths } from '../config/AssetPaths';
import type { CollisionSystem } from '../systems/CollisionSystem';
import { buildBonfire } from '../systems/worldbuilder/objects/furniture';
import { buildMoonwell, buildPavilion } from '../systems/worldbuilder/objects/structures';
import { applyBarkPBR, applyCanopyPBR } from '../utils/PBRMaps';
import { Water } from './Water';
import type { Terrain } from './Terrain';

const FOREST_RADIUS = 320;
const FOREST_CLEARING_RADIUS = 28;
const TREE_CELL_SIZE = 16;
const TREE_COUNT_LIMIT = 84;
const MUSHROOM_COUNT_LIMIT = 220;
const CRYSTAL_COUNT_LIMIT = 84;
const ORB_COUNT = 12;

function hash2(x: number, z: number, seed = 0): number {
  let n = (x * 374761393) ^ (z * 668265263) ^ (seed * 1442695041);
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function makeOrbMaterial(colorA: THREE.ColorRepresentation, colorB: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
    },
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec3 vNormalDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 p = position;
        p += normal * (sin(uTime * 1.8 + position.x * 6.0 + position.y * 4.0 + position.z * 5.0) * 0.03);
        vec4 worldPos = modelMatrix * vec4(p, 1.0);
        vWorldPos = worldPos.xyz;
        vNormalDir = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColorA;
      uniform vec3 uColorB;
      varying vec3 vNormalDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 n = normalize(vNormalDir);
        float fresnel = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.2);
        float pulse = 0.55 + 0.45 * sin(uTime * 2.6 + vWorldPos.x * 0.06 + vWorldPos.z * 0.08);
        vec3 color = mix(uColorA, uColorB, pulse);
        color += fresnel * vec3(0.18, 0.42, 0.65);
        float alpha = 0.72 + fresnel * 0.22;
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}

function makeGroundPatch(texturePath: string, radius: number, tint: THREE.ColorRepresentation): THREE.Mesh {
  const texture = new THREE.TextureLoader().load(texturePath);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(2, radius / 8), Math.max(2, radius / 8));
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: tint,
    roughness: 1.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0.88,
    // Flat ground decal: it lies just above the opaque terrain, which already
    // writes depth. If this transparent patch ALSO wrote depth it would punch a
    // hole into the depth buffer that the (depthWrite:false) water plane then
    // fails its depth test against — making large discs of water vanish as the
    // transparent draw-order sort flips with camera rotation. Never write depth.
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 36), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  mesh.userData.noCollision = true;
  return mesh;
}

export class StartingForest {
  private readonly root = new THREE.Group();
  private collisionSystem: CollisionSystem | null = null;
  private collisionRegistered = false;
  private readonly orbEntries: Array<{
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    anchorX: number;
    anchorY: number;
    anchorZ: number;
    phase: number;
    bob: number;
    orbitRadius: number;
    orbitSpeed: number;
  }> = [];
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempQuat = new THREE.Quaternion();
  private readonly treePositions: Array<{ x: number; z: number; scale: number }> = [];
  private elapsed = 0;
  private grassTimeUniform: THREE.IUniform<number> | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly terrain: Terrain) {
    this.root.name = 'starting-forest';
    this.scene.add(this.root);
    this.generate();
  }

  setCollisionSystem(collisionSystem: CollisionSystem): void {
    this.collisionSystem = collisionSystem;
    if (this.collisionRegistered) return;
    void this.collisionSystem.addCollidableFiltered(this.root);
    this.collisionRegistered = true;
  }

  update(delta: number): void {
    this.elapsed += delta;
    if (this.grassTimeUniform) {
      this.grassTimeUniform.value = this.elapsed;
    }
    for (const orb of this.orbEntries) {
      orb.phase += delta;
      const orbitAngle = orb.phase * orb.orbitSpeed;
      orb.mesh.position.x = orb.anchorX + Math.cos(orbitAngle) * orb.orbitRadius;
      orb.mesh.position.z = orb.anchorZ + Math.sin(orbitAngle) * orb.orbitRadius;
      orb.mesh.position.y = orb.anchorY + Math.sin(orb.phase * 1.7) * orb.bob;
      orb.mesh.rotation.y += delta * 0.45;
      orb.mesh.scale.setScalar(0.95 + Math.sin(orb.phase * 2.2) * 0.05);
      orb.material.uniforms.uTime.value = this.elapsed;
    }
  }

  private generate(): void {
    this.buildGroundCover();
    this.buildTrees();
    this.buildGrass();
    this.buildMushrooms();
    this.buildCrystals();
    this.buildOrbs();
    this.buildSanctuaries();
  }

  private buildGroundCover(): void {
    const grassSites = [
      { x: 0, z: 0, radius: 112, texture: AssetPaths.textures.terrain.grass, tint: 0x5f8e51 },
      { x: -178, z: -176, radius: 46, texture: AssetPaths.textures.terrain.grass, tint: 0x56834b },
      { x: 8, z: -96, radius: 40, texture: AssetPaths.textures.terrain.grass, tint: 0x648b53 },
      { x: 176, z: -164, radius: 44, texture: AssetPaths.textures.terrain.grass, tint: 0x567f47 },
      { x: -20, z: -412, radius: 36, texture: AssetPaths.textures.terrain.rock, tint: 0x7b7264 },
    ];

    for (const site of grassSites) {
      const y = this.terrain.getHeightAt(site.x, site.z) + 0.03;
      const patch = makeGroundPatch(site.texture, site.radius, site.tint);
      patch.position.set(site.x, y, site.z);
      patch.scale.setScalar(1.0);
      this.root.add(patch);
    }
  }

  private buildGrass(): void {
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(0, 0);
    bladeShape.bezierCurveTo(-0.035, 0.16, -0.045, 0.6, -0.01, 1.0);
    bladeShape.bezierCurveTo(0.008, 1.04, 0.025, 1.04, 0.04, 1.0);
    bladeShape.bezierCurveTo(0.045, 0.6, 0.035, 0.16, 0, 0);
    const bladeGeo = new THREE.ShapeGeometry(bladeShape, 8);

    const bladeMat = new THREE.MeshStandardMaterial({
      color: 0x5bbf64,
      emissive: new THREE.Color(0x173f22),
      emissiveIntensity: 0.12,
      roughness: 1.0,
      side: THREE.DoubleSide,
    });
    bladeMat.onBeforeCompile = (shader) => {
      this.grassTimeUniform = shader.uniforms.uTime = { value: 0 };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', /* glsl */ `
          #include <common>
          uniform float uTime;
        `)
        .replace('#include <begin_vertex>', /* glsl */ `
          #include <begin_vertex>
          float swayMask = clamp(transformed.y, 0.0, 1.0);
          float seed = dot(instanceMatrix[3].xyz, vec3(0.17, 0.11, 0.23));
          float windA = sin(uTime * 1.8 + seed * 3.5);
          float windB = cos(uTime * 1.3 + seed * 2.1);
          transformed.x += windA * 0.04 * swayMask;
          transformed.z += windB * 0.025 * swayMask;
          transformed.y += windA * 0.015 * swayMask;
        `);
    };

    const blades: Array<{ x: number; z: number; scale: number; yaw: number; lean: number }> = [];
    const addBlade = (x: number, z: number, scale: number, yaw: number, lean: number): void => {
      if (Math.hypot(x, z) > 170) return;
      blades.push({ x, z, scale, yaw, lean });
    };

    let tuftIndex = 0;
    for (const tree of this.treePositions) {
      const tuftsAroundTree = 7 + Math.floor(hash2(tuftIndex, 60, 61) * 4);
      for (let i = 0; i < tuftsAroundTree; i++) {
        const angle = hash2(tuftIndex, i, 62) * Math.PI * 2;
        const dist = lerp(1.3, 5.8, hash2(tuftIndex, i, 63)) * lerp(0.45, 1.0, tree.scale / 1.45);
        const px = tree.x + Math.cos(angle) * dist;
        const pz = tree.z + Math.sin(angle) * dist;
        const scale = lerp(0.6, 1.6, hash2(tuftIndex, i, 64));
        const lean = (hash2(tuftIndex, i, 65) - 0.5) * 0.25;
        const yaw = hash2(tuftIndex, i, 66) * Math.PI * 2;
        addBlade(px, pz, scale, yaw, lean);
        addBlade(px, pz, scale * 0.9, yaw + Math.PI / 2, -lean * 0.8);
      }
      tuftIndex++;
    }

    for (let i = 0; i < 220; i++) {
      const angle = hash2(i, 70, 71) * Math.PI * 2;
      const radius = Math.sqrt(hash2(i, 72, 73)) * 150;
      const px = Math.cos(angle) * radius + (hash2(i, 74, 75) - 0.5) * 6;
      const pz = Math.sin(angle) * radius + (hash2(i, 76, 77) - 0.5) * 6;
      if (hash2(i, 78, 79) > 0.58) continue;
      const scale = lerp(0.55, 1.4, hash2(i, 80, 81));
      const lean = (hash2(i, 82, 83) - 0.5) * 0.28;
      const yaw = hash2(i, 84, 85) * Math.PI * 2;
      addBlade(px, pz, scale, yaw, lean);
      addBlade(px, pz, scale * 0.92, yaw + Math.PI / 2, -lean * 0.7);
    }

    const count = blades.length;
    if (count === 0) return;

    const grass = new THREE.InstancedMesh(bladeGeo, bladeMat, count);
    grass.castShadow = true;
    grass.receiveShadow = true;
    grass.userData.noCollision = true;

    for (let i = 0; i < count; i++) {
      const blade = blades[i]!;
      const y = this.terrain.getHeightAt(blade.x, blade.z) + 0.02;
      this.tempPosition.set(blade.x, y, blade.z);
      this.tempQuat.setFromEuler(new THREE.Euler(blade.lean, blade.yaw, blade.lean * 0.4));
      this.tempScale.set(blade.scale * 0.8, blade.scale, blade.scale * 0.8);
      this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
      grass.setMatrixAt(i, this.tempMatrix);
    }

    grass.instanceMatrix.needsUpdate = true;
    this.root.add(grass);
  }

  private buildTrees(): void {
    // Trees within this radius from origin get PBR textures; beyond → flat color.
    const NEAR_THRESHOLD = 160;

    const trunkGeo = new THREE.CylinderGeometry(0.34, 0.48, 5.8, 7);
    const canopyGeo = new THREE.ConeGeometry(2.9, 6.2, 8, 1);

    const trunkMatNear = new THREE.MeshStandardMaterial({ color: 0x3b2411, roughness: 0.95 });
    applyBarkPBR(trunkMatNear);
    const canopyMatNear = new THREE.MeshStandardMaterial({ color: 0x234d2e, roughness: 0.85 });
    applyCanopyPBR(canopyMatNear);

    const trunkMatFar = new THREE.MeshStandardMaterial({ color: 0x3b2411, roughness: 0.95 });
    const canopyMatFar = new THREE.MeshStandardMaterial({ color: 0x234d2e, roughness: 0.85 });

    const trees: Array<{ x: number; z: number; scale: number; tilt: number }> = [];
    const pushTree = (x: number, z: number, scale: number, tilt: number): void => {
      const radius = Math.hypot(x, z);
      if (radius < FOREST_CLEARING_RADIUS || radius > FOREST_RADIUS) return;
      if (this.terrain.getHeightAt(x, z) <= Water.LEVEL) return;
      trees.push({ x, z, scale, tilt });
    };

    for (let gx = -9; gx <= 9; gx++) {
      for (let gz = -9; gz <= 9; gz++) {
        const px = gx * TREE_CELL_SIZE + (hash2(gx, gz, 1) - 0.5) * 10;
        const pz = gz * TREE_CELL_SIZE + (hash2(gx, gz, 2) - 0.5) * 10;
        const density = hash2(gx, gz, 3);
        if (density > 0.33) continue;
        pushTree(
          px,
          pz,
          lerp(0.82, 1.45, hash2(gx, gz, 4)),
          (hash2(gx, gz, 5) - 0.5) * 0.35,
        );
      }
    }

    const satelliteGroves = [
      { x: -178, z: -176, spread: 26, seed: 41 },
      { x: 8, z: -96, spread: 24, seed: 42 },
      { x: 176, z: -164, spread: 28, seed: 43 },
      { x: -20, z: -412, spread: 22, seed: 44 },
      { x: 132, z: 102, spread: 20, seed: 45 },
    ];

    for (const grove of satelliteGroves) {
      for (let gx = -2; gx <= 2; gx++) {
        for (let gz = -2; gz <= 2; gz++) {
          const px = grove.x + gx * (grove.spread * 0.45) + (hash2(gx, gz, grove.seed) - 0.5) * grove.spread * 0.6;
          const pz = grove.z + gz * (grove.spread * 0.45) + (hash2(gx, gz, grove.seed + 1) - 0.5) * grove.spread * 0.6;
          const dist = Math.hypot(px - grove.x, pz - grove.z);
          if (dist > grove.spread) continue;
          if (hash2(gx, gz, grove.seed + 2) > 0.45) continue;
          pushTree(
            px,
            pz,
            lerp(0.75, 1.34, hash2(gx, gz, grove.seed + 3)),
            (hash2(gx, gz, grove.seed + 4) - 0.5) * 0.28,
          );
        }
      }
    }

    trees.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    const count = Math.min(trees.length, TREE_COUNT_LIMIT);
    this.treePositions.length = 0;
    for (let i = 0; i < count; i++) {
      const tree = trees[i]!;
      this.treePositions.push({ x: tree.x, z: tree.z, scale: tree.scale });
    }

    // Split into near (PBR) and far (flat). Preserve the original sort index so
    // hash-based random values (rotation, scale) stay identical to the old single-batch.
    const nearBatch: Array<{ x: number; z: number; scale: number; tilt: number; idx: number }> = [];
    const farBatch:  Array<{ x: number; z: number; scale: number; tilt: number; idx: number }> = [];
    for (let i = 0; i < count; i++) {
      const tree = trees[i]!;
      (Math.hypot(tree.x, tree.z) <= NEAR_THRESHOLD ? nearBatch : farBatch).push({ ...tree, idx: i });
    }

    const buildBatch = (
      batch: typeof nearBatch,
      trunkMat: THREE.MeshStandardMaterial,
      canopyMat: THREE.MeshStandardMaterial,
      castShadow: boolean,
    ): void => {
      if (batch.length === 0) return;
      const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, batch.length);
      const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, batch.length);
      trunkMesh.castShadow = castShadow;
      trunkMesh.receiveShadow = true;
      canopyMesh.castShadow = castShadow;
      canopyMesh.receiveShadow = castShadow;
      trunkMesh.userData.noCollision = true;
      canopyMesh.userData.noCollision = true;

      for (let j = 0; j < batch.length; j++) {
        const tree = batch[j]!;
        const i = tree.idx; // use original index to keep hash values stable
        const y = this.terrain.getHeightAt(tree.x, tree.z);
        const trunkHeight = 5.8 * tree.scale;
        const canopyLift = trunkHeight * 0.55 + 6.2 * tree.scale * 0.28;

        this.tempPosition.set(tree.x, y, tree.z);
        this.tempQuat.setFromEuler(new THREE.Euler(tree.tilt * 0.2, hash2(i, i, 6) * Math.PI * 2, tree.tilt * 0.12));
        this.tempScale.setScalar(tree.scale);
        this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
        trunkMesh.setMatrixAt(j, this.tempMatrix);

        this.tempPosition.set(tree.x, y + canopyLift, tree.z);
        this.tempQuat.setFromEuler(new THREE.Euler(0, hash2(i, i, 7) * Math.PI * 2, 0));
        this.tempScale.setScalar(tree.scale * lerp(0.9, 1.15, hash2(i, i, 8)));
        this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
        canopyMesh.setMatrixAt(j, this.tempMatrix);
      }

      trunkMesh.instanceMatrix.needsUpdate = true;
      canopyMesh.instanceMatrix.needsUpdate = true;
      this.root.add(trunkMesh);
      this.root.add(canopyMesh);
    };

    buildBatch(nearBatch, trunkMatNear, canopyMatNear, true);
    buildBatch(farBatch,  trunkMatFar,  canopyMatFar,  false);

    const colliderGroup = new THREE.Group();
    colliderGroup.name = 'starting-forest-colliders';
    for (let i = 0; i < count; i++) {
      const tree = trees[i]!;
      const y = this.terrain.getHeightAt(tree.x, tree.z);
      const trunkHeight = 5.8 * tree.scale;
      const collider = new THREE.Mesh(
        new THREE.CylinderGeometry(0.48 * tree.scale, 0.62 * tree.scale, trunkHeight, 7),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      collider.position.set(tree.x, y + trunkHeight * 0.5, tree.z);
      collider.rotation.y = hash2(i, i, 9) * Math.PI * 2;
      collider.userData.isCollider = true;
      collider.userData.noCollision = false;
      colliderGroup.add(collider);
    }
    this.root.add(colliderGroup);
  }

  private buildMushrooms(): void {
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.14, 0.8, 6);
    const capGeo = new THREE.CylinderGeometry(0.28, 0.46, 0.3, 8);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xe2cfa8, roughness: 0.9 });
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x3155b3,
      emissive: new THREE.Color(0x2244cc),
      emissiveIntensity: 0.7,
      roughness: 0.7,
    });

    const positions: Array<{ x: number; z: number; scale: number; yaw: number }> = [];
    const nests = [
      { x: 0, z: 0, radius: 118, density: 0.9, seed: 10 },
      { x: -178, z: -176, radius: 34, density: 1.0, seed: 11 },
      { x: 8, z: -96, radius: 28, density: 1.0, seed: 12 },
      { x: 176, z: -164, radius: 30, density: 0.95, seed: 13 },
      { x: -20, z: -412, radius: 20, density: 0.85, seed: 14 },
      { x: 132, z: 102, radius: 26, density: 0.8, seed: 15 },
    ];

    for (const nest of nests) {
      for (let i = 0; i < 220; i++) {
        const angle = hash2(i, nest.seed, nest.seed + 1) * Math.PI * 2;
        const radial = Math.pow(hash2(i, nest.seed + 2, nest.seed + 3), 0.78) * nest.radius;
        const jitter = (hash2(i, nest.seed + 4, nest.seed + 5) - 0.5) * 5;
        const px = nest.x + Math.cos(angle) * (radial + jitter);
        const pz = nest.z + Math.sin(angle) * (radial + jitter);
        if (Math.hypot(px, pz) > FOREST_RADIUS * 0.98) continue;
        if (hash2(i, nest.seed + 6, nest.seed + 7) > 0.55 * nest.density) continue;
        if (this.terrain.getHeightAt(px, pz) <= Water.LEVEL) continue;
        positions.push({
          x: px,
          z: pz,
          scale: lerp(0.7, 1.45, hash2(i, nest.seed + 8, nest.seed + 9)),
          yaw: hash2(i, nest.seed + 10, nest.seed + 11) * Math.PI * 2,
        });
      }
    }

    for (let t = 0; t < this.treePositions.length; t++) {
      const tree = this.treePositions[t]!;
      const clumps = 3 + Math.floor(hash2(t, 100, 101) * 5);
      for (let i = 0; i < clumps; i++) {
        const angle = hash2(t, i, 102) * Math.PI * 2;
        const dist = lerp(1.1, 5.4, hash2(t, i, 103)) * lerp(0.55, 1.0, tree.scale / 1.45);
        const px = tree.x + Math.cos(angle) * dist + (hash2(t, i, 104) - 0.5) * 1.6;
        const pz = tree.z + Math.sin(angle) * dist + (hash2(t, i, 105) - 0.5) * 1.6;
        if (Math.hypot(px, pz) > FOREST_RADIUS * 0.98) continue;
        if (hash2(t, i, 106) > 0.6) continue;
        if (this.terrain.getHeightAt(px, pz) <= Water.LEVEL) continue;
        positions.push({
          x: px,
          z: pz,
          scale: lerp(0.68, 1.28, hash2(t, i, 107)),
          yaw: hash2(t, i, 108) * Math.PI * 2,
        });
      }
    }

    positions.sort((a, b) => {
      let bestA = Number.POSITIVE_INFINITY;
      let bestB = Number.POSITIVE_INFINITY;
      for (const tree of this.treePositions) {
        const da = (a.x - tree.x) * (a.x - tree.x) + (a.z - tree.z) * (a.z - tree.z);
        const db = (b.x - tree.x) * (b.x - tree.x) + (b.z - tree.z) * (b.z - tree.z);
        if (da < bestA) bestA = da;
        if (db < bestB) bestB = db;
      }
      return bestA - bestB;
    });

    const count = Math.min(positions.length, MUSHROOM_COUNT_LIMIT);
    const stems = new THREE.InstancedMesh(stemGeo, stemMat, count);
    const caps = new THREE.InstancedMesh(capGeo, capMat, count);
    stems.castShadow = true;
    stems.receiveShadow = true;
    caps.castShadow = true;
    caps.receiveShadow = true;
    stems.userData.noCollision = true;
    caps.userData.noCollision = true;

    for (let i = 0; i < count; i++) {
      const mushroom = positions[i]!;
      const y = this.terrain.getHeightAt(mushroom.x, mushroom.z);
      const stemHeight = 0.8 * mushroom.scale;
      const capLift = stemHeight * 0.95;

      this.tempPosition.set(mushroom.x, y, mushroom.z);
      this.tempQuat.setFromEuler(new THREE.Euler(0, mushroom.yaw, 0));
      this.tempScale.setScalar(mushroom.scale);
      this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
      stems.setMatrixAt(i, this.tempMatrix);

      this.tempPosition.set(mushroom.x, y + capLift, mushroom.z);
      this.tempQuat.setFromEuler(new THREE.Euler((hash2(i, i, 15) - 0.5) * 0.3, mushroom.yaw, (hash2(i, i, 16) - 0.5) * 0.3));
      this.tempScale.setScalar(mushroom.scale * lerp(0.8, 1.18, hash2(i, i, 17)));
      this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
      caps.setMatrixAt(i, this.tempMatrix);
    }

    stems.instanceMatrix.needsUpdate = true;
    caps.instanceMatrix.needsUpdate = true;
    this.root.add(stems);
    this.root.add(caps);
  }

  private buildCrystals(): void {
    const crystalGeo = new THREE.ConeGeometry(0.26, 1.35, 5);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x67ffd6,
      emissive: new THREE.Color(0x00ffaa),
      emissiveIntensity: 0.95,
      roughness: 0.08,
      metalness: 0.25,
      transparent: true,
      opacity: 0.92,
    });

    const positions: Array<{ x: number; z: number; scale: number; yaw: number; pitch: number }> = [];
    const veins = [
      { x: 0, z: 0, radius: 150, density: 0.75, seed: 18 },
      { x: -178, z: -176, radius: 44, density: 0.9, seed: 19 },
      { x: 8, z: -96, radius: 38, density: 0.8, seed: 20 },
      { x: 176, z: -164, radius: 48, density: 0.95, seed: 21 },
      { x: -20, z: -412, radius: 30, density: 1.0, seed: 22 },
      { x: 132, z: 102, radius: 34, density: 0.7, seed: 23 },
    ];

    for (const vein of veins) {
      for (let i = 0; i < 180; i++) {
        const angle = hash2(i, vein.seed, vein.seed + 1) * Math.PI * 2;
        const radial = lerp(vein.radius * 0.35, vein.radius, Math.pow(hash2(i, vein.seed + 2, vein.seed + 3), 0.6));
        const jitter = (hash2(i, vein.seed + 4, vein.seed + 5) - 0.5) * 8;
        const px = vein.x + Math.cos(angle) * (radial + jitter);
        const pz = vein.z + Math.sin(angle) * (radial + jitter);
        const dist = Math.hypot(px, pz);
        if (dist < 24 || dist > FOREST_RADIUS * 0.985) continue;
        if (hash2(i, vein.seed + 6, vein.seed + 7) > 0.6 * vein.density) continue;
        if (this.terrain.getHeightAt(px, pz) <= Water.LEVEL) continue;
        positions.push({
          x: px,
          z: pz,
          scale: lerp(0.55, 1.55, hash2(i, vein.seed + 8, vein.seed + 9)),
          yaw: hash2(i, vein.seed + 10, vein.seed + 11) * Math.PI * 2,
          pitch: (hash2(i, vein.seed + 12, vein.seed + 13) - 0.5) * 0.65,
        });
      }
    }

    const count = Math.min(positions.length, CRYSTAL_COUNT_LIMIT);
    const crystals = new THREE.InstancedMesh(crystalGeo, crystalMat, count);
    crystals.castShadow = true;
    crystals.receiveShadow = true;
    crystals.userData.noCollision = true;

    for (let i = 0; i < count; i++) {
      const crystal = positions[i]!;
      const y = this.terrain.getHeightAt(crystal.x, crystal.z);
      this.tempPosition.set(crystal.x, y + 0.1, crystal.z);
      this.tempQuat.setFromEuler(new THREE.Euler(crystal.pitch, crystal.yaw, crystal.pitch * 0.5));
      this.tempScale.setScalar(crystal.scale);
      this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
      crystals.setMatrixAt(i, this.tempMatrix);
    }

    crystals.instanceMatrix.needsUpdate = true;
    this.root.add(crystals);
  }

  private buildSanctuaries(): void {
    const sites = [
      {
        x: 0,
        z: 0,
        scale: 1.25,
        rotation: 0.2,
        includeMoonwell: true,
        includeTemple: true,
        bonfires: 3,
      },
      {
        x: -178,
        z: -176,
        scale: 1.0,
        rotation: 1.4,
        includeMoonwell: true,
        includeTemple: true,
        bonfires: 1,
      },
      {
        x: 8,
        z: -96,
        scale: 0.95,
        rotation: -0.5,
        includeMoonwell: true,
        includeTemple: true,
        bonfires: 1,
      },
      {
        x: 176,
        z: -164,
        scale: 0.95,
        rotation: 0.9,
        includeMoonwell: true,
        includeTemple: true,
        bonfires: 2,
      },
      {
        x: -20,
        z: -412,
        scale: 0.9,
        rotation: 2.3,
        includeMoonwell: true,
        includeTemple: false,
        bonfires: 1,
      },
    ] as const;

    for (const site of sites) {
      const y = this.terrain.getHeightAt(site.x, site.z);

      const ring = makeGroundPatch(
        site.includeTemple ? AssetPaths.textures.terrain.rock : AssetPaths.textures.terrain.grass,
        site.includeTemple ? 18 : 14,
        site.includeTemple ? 0x7b725f : 0x5f8e51,
      );
      ring.position.set(site.x, y + 0.06, site.z);
      ring.scale.setScalar(site.includeTemple ? 1.25 : 0.95);
      ring.rotation.z = 0;
      this.root.add(ring);

      if (site.includeMoonwell) {
        const moonwell = buildMoonwell(new THREE.Vector3(site.x - 8, y, site.z + 6), site.scale);
        moonwell.rotation.y = site.rotation;
        this.root.add(moonwell);
      }

      if (site.includeTemple) {
        const temple = buildPavilion(new THREE.Vector3(site.x + 12, y, site.z - 6), site.scale);
        temple.rotation.y = site.rotation + Math.PI * 0.25;
        this.root.add(temple);
      }

      for (let i = 0; i < site.bonfires; i++) {
        const angle = (i / Math.max(1, site.bonfires)) * Math.PI * 2;
        const dist = site.includeTemple ? 18 : 12;
        const fire = buildBonfire(
          new THREE.Vector3(
            site.x + Math.cos(angle) * dist,
            y,
            site.z + Math.sin(angle) * dist,
          ),
          site.scale * 0.75,
        );
        fire.rotation.y = angle;
        this.root.add(fire);
      }
    }
  }

  private buildOrbs(): void {
    const orbGeo = new THREE.SphereGeometry(0.55, 20, 20);
    const outerMat = makeOrbMaterial(0x76b8ff, 0x8d44ff);
    const innerMat = makeOrbMaterial(0xe7fbff, 0x76ffd0);

    for (let i = 0; i < ORB_COUNT; i++) {
      const angle = (i / ORB_COUNT) * Math.PI * 2;
      const ringRadius = 18 + (i % 3) * 10;
      const x = Math.cos(angle) * ringRadius + (hash2(i, 0, 30) - 0.5) * 6;
      const z = Math.sin(angle) * ringRadius + (hash2(i, 0, 31) - 0.5) * 6;
      const y = this.terrain.getHeightAt(x, z) + lerp(10, 18, hash2(i, 0, 32));

      const orb = new THREE.Mesh(orbGeo, i % 2 === 0 ? outerMat.clone() : innerMat.clone());
      orb.position.set(x, y, z);
      orb.scale.setScalar(lerp(0.8, 1.35, hash2(i, 0, 33)));
      orb.castShadow = false;
      orb.receiveShadow = false;
      orb.userData.noCollision = true;
      this.root.add(orb);

      this.orbEntries.push({
        mesh: orb,
        material: orb.material as THREE.ShaderMaterial,
        anchorX: x,
        anchorY: y,
        anchorZ: z,
        phase: hash2(i, 0, 34) * Math.PI * 2,
        bob: lerp(0.6, 1.8, hash2(i, 0, 35)),
        orbitRadius: lerp(1.2, 2.6, hash2(i, 0, 36)),
        orbitSpeed: lerp(0.25, 0.55, hash2(i, 0, 37)),
      });
    }
  }
}
