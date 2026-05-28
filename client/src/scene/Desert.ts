import * as THREE from 'three';
import { AssetPaths } from '../config/AssetPaths';
import type { CollisionSystem } from '../systems/CollisionSystem';
import type { Terrain } from './Terrain';

function hash2(x: number, z: number, seed = 0): number {
  let n = (x * 374761393) ^ (z * 668265263) ^ (seed * 1442695041);
  n = (n ^ (n >> 13)) * 1274126177;
  return ((n ^ (n >> 16)) >>> 0) / 4294967295;
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

interface DesertPlacement {
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
  tilt: number;
}

let desertRoughnessTexture: THREE.CanvasTexture | null = null;

function getDesertRoughnessTexture(): THREE.CanvasTexture {
  if (desertRoughnessTexture) return desertRoughnessTexture;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    desertRoughnessTexture = new THREE.CanvasTexture(canvas);
    return desertRoughnessTexture;
  }

  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const dune = 0.55 + 0.2 * Math.sin(x * 0.14) + 0.15 * Math.cos(y * 0.11);
      const grain = 0.25 * hash2(x, y, 9);
      const v = Math.floor(255 * THREE.MathUtils.clamp(dune + grain, 0, 1));
      image.data[i] = v;
      image.data[i + 1] = v;
      image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  desertRoughnessTexture = new THREE.CanvasTexture(canvas);
  desertRoughnessTexture.wrapS = THREE.RepeatWrapping;
  desertRoughnessTexture.wrapT = THREE.RepeatWrapping;
  desertRoughnessTexture.repeat.set(6, 6);
  desertRoughnessTexture.needsUpdate = true;
  return desertRoughnessTexture;
}

function makeSandPatch(radius: number, color: THREE.ColorRepresentation): THREE.Mesh {
  const texture = new THREE.TextureLoader().load(AssetPaths.textures.terrain.sand);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(3, radius / 8), Math.max(3, radius / 8));
  texture.colorSpace = THREE.SRGBColorSpace;

  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughnessMap: getDesertRoughnessTexture(),
    color,
    roughness: 0.95,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const patch = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), material);
  patch.rotation.x = -Math.PI / 2;
  patch.userData.noCollision = true;
  patch.receiveShadow = true;
  return patch;
}

export class DesertScenery {
  private readonly root = new THREE.Group();
  private readonly collidableRoots: THREE.Object3D[] = [];
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempQuat = new THREE.Quaternion();
  private readonly tmpWorldPos = new THREE.Vector3();
  private playerX = 0;
  private playerZ = 0;
  private readonly visibleRadiusSq = 180 * 180;
  private collisionSystem: CollisionSystem | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly terrain: Terrain) {
    this.root.name = 'desert-scenery';
    this.scene.add(this.root);
    this.generate();
  }

  setCollisionSystem(collisionSystem: CollisionSystem): void {
    this.collisionSystem = collisionSystem;
    for (const root of this.collidableRoots) {
      void this.collisionSystem.addCollidableFiltered(root);
    }
  }

  setPlayerPosition(x: number, z: number): void {
    this.playerX = x;
    this.playerZ = z;
    this.update(0);
  }

  update(_delta: number): void {
    for (const child of this.root.children) {
      child.getWorldPosition(this.tmpWorldPos);
      const dx = this.tmpWorldPos.x - this.playerX;
      const dz = this.tmpWorldPos.z - this.playerZ;
      const radiusSq = typeof child.userData.visibilityRadiusSq === 'number'
        ? child.userData.visibilityRadiusSq
        : this.visibleRadiusSq;
      child.visible = (dx * dx + dz * dz) <= radiusSq;
    }
  }

  private generate(): void {
    this.buildSandBasins();
    this.buildCacti();
    this.buildRocks();
  }

  private isDesert(x: number, z: number): boolean {
    const ax = Math.abs(x);
    const az = Math.abs(z);
    return ax > 280 && az > 220;
  }

  private buildSandBasins(): void {
    const centers = [
      { x: 540, z: 420, r: 240, tint: 0xc6a064 },
      { x: -540, z: 420, r: 240, tint: 0xbe9460 },
      { x: 540, z: -420, r: 240, tint: 0xb98a52 },
      { x: -540, z: -420, r: 240, tint: 0xc09762 },
      { x: 420, z: 540, r: 220, tint: 0xd0aa6d },
      { x: -420, z: 540, r: 220, tint: 0xc19257 },
      { x: 420, z: -540, r: 220, tint: 0xb8854c },
      { x: -420, z: -540, r: 220, tint: 0xc8a15f },
    ];

    for (const center of centers) {
      const y = this.terrain.getHeightAt(center.x, center.z) + 0.02;
      const patch = makeSandPatch(center.r, center.tint);
      patch.position.set(center.x, y, center.z);
      patch.userData.visibilityRadiusSq = (center.r + 120) * (center.r + 120);
      this.root.add(patch);
    }
  }

  private buildCacti(): void {
    const trunkGeo = new THREE.CylinderGeometry(0.45, 0.55, 4.2, 7);
    const armGeo = new THREE.CylinderGeometry(0.16, 0.22, 1.8, 6);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x3d8a4d,
      emissive: new THREE.Color(0x183a20),
      emissiveIntensity: 0.08,
      roughness: 0.95,
    });

    const cacti: DesertPlacement[] = [];
    for (let gx = -20; gx <= 20; gx++) {
      for (let gz = -20; gz <= 20; gz++) {
        const x = gx * 40 + (hash2(gx, gz, 1) - 0.5) * 18;
        const z = gz * 40 + (hash2(gx, gz, 2) - 0.5) * 18;
        if (!this.isDesert(x, z)) continue;
        if (hash2(gx, gz, 3) > 0.15) continue;
        cacti.push({
          x,
          z,
          y: this.terrain.getHeightAt(x, z),
          scale: lerp(0.8, 1.8, hash2(gx, gz, 4)),
          yaw: hash2(gx, gz, 5) * Math.PI * 2,
          tilt: 0,
        });
      }
    }

    this.addClusteredCacti(cacti, trunkGeo, armGeo, mat, 160);
  }

  private buildRocks(): void {
    const rockGeo = new THREE.DodecahedronGeometry(0.8, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x8d7a62,
      roughness: 1.0,
      metalness: 0.0,
    });

    const rocks: DesertPlacement[] = [];
    for (let gx = -24; gx <= 24; gx++) {
      for (let gz = -24; gz <= 24; gz++) {
        const x = gx * 30 + (hash2(gx, gz, 10) - 0.5) * 14;
        const z = gz * 30 + (hash2(gx, gz, 11) - 0.5) * 14;
        if (!this.isDesert(x, z)) continue;
        if (hash2(gx, gz, 12) > 0.22) continue;
        rocks.push({
          x,
          z,
          y: this.terrain.getHeightAt(x, z),
          scale: lerp(0.5, 2.4, hash2(gx, gz, 13)),
          yaw: hash2(gx, gz, 14) * Math.PI * 2,
          tilt: (hash2(gx, gz, 15) - 0.5) * 0.55,
        });
      }
    }

    this.addClusteredRocks(rocks, rockGeo, rockMat, 180);
  }

  private addClusteredCacti(
    cacti: DesertPlacement[],
    trunkGeo: THREE.CylinderGeometry,
    armGeo: THREE.CylinderGeometry,
    material: THREE.MeshStandardMaterial,
    cellSize: number,
  ): void {
    const buckets = this.bucketPlacements(cacti, cellSize);
    for (const { cellX, cellZ, placements } of buckets) {
      const centerX = (cellX + 0.5) * cellSize;
      const centerZ = (cellZ + 0.5) * cellSize;
      const centerY = this.terrain.getHeightAt(centerX, centerZ);
      const cluster = new THREE.Group();
      cluster.position.set(centerX, centerY, centerZ);
      cluster.userData.visibilityRadiusSq = (cellSize * 1.35) * (cellSize * 1.35);

      const trunk = new THREE.InstancedMesh(trunkGeo, material, placements.length);
      const leftArm = new THREE.InstancedMesh(armGeo, material, placements.length);
      const rightArm = new THREE.InstancedMesh(armGeo, material, placements.length);
      trunk.castShadow = true;
      trunk.receiveShadow = true;
      leftArm.castShadow = true;
      leftArm.receiveShadow = true;
      rightArm.castShadow = true;
      rightArm.receiveShadow = true;
      trunk.userData.isCollider = true;
      leftArm.userData.isCollider = true;
      rightArm.userData.isCollider = true;

      for (let i = 0; i < placements.length; i++) {
        const cactus = placements[i]!;
        const height = 4.2 * cactus.scale;

        this.tempPosition.set(cactus.x - centerX, cactus.y - centerY, cactus.z - centerZ);
        this.tempQuat.setFromEuler(new THREE.Euler(0, cactus.yaw, 0));
        this.tempScale.setScalar(cactus.scale);
        this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
        trunk.setMatrixAt(i, this.tempMatrix);

        this.tempPosition.set(
          cactus.x - centerX - 0.55 * cactus.scale,
          cactus.y - centerY + height * 0.58,
          cactus.z - centerZ,
        );
        this.tempQuat.setFromEuler(new THREE.Euler(0, cactus.yaw + Math.PI / 2, Math.PI / 2));
        this.tempScale.setScalar(cactus.scale);
        this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
        leftArm.setMatrixAt(i, this.tempMatrix);

        this.tempPosition.set(
          cactus.x - centerX + 0.55 * cactus.scale,
          cactus.y - centerY + height * 0.64,
          cactus.z - centerZ,
        );
        this.tempQuat.setFromEuler(new THREE.Euler(0, cactus.yaw - Math.PI / 2, Math.PI / 2));
        this.tempScale.setScalar(cactus.scale);
        this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
        rightArm.setMatrixAt(i, this.tempMatrix);
      }

      trunk.instanceMatrix.needsUpdate = true;
      leftArm.instanceMatrix.needsUpdate = true;
      rightArm.instanceMatrix.needsUpdate = true;
      cluster.add(trunk);
      cluster.add(leftArm);
      cluster.add(rightArm);
      this.root.add(cluster);
      this.collidableRoots.push(cluster);
      if (this.collisionSystem) {
        void this.collisionSystem.addCollidableFiltered(cluster);
      }
    }
  }

  private addClusteredRocks(
    rocks: DesertPlacement[],
    rockGeo: THREE.DodecahedronGeometry,
    rockMat: THREE.MeshStandardMaterial,
    cellSize: number,
  ): void {
    const buckets = this.bucketPlacements(rocks, cellSize);
    for (const { cellX, cellZ, placements } of buckets) {
      const centerX = (cellX + 0.5) * cellSize;
      const centerZ = (cellZ + 0.5) * cellSize;
      const centerY = this.terrain.getHeightAt(centerX, centerZ);
      const cluster = new THREE.Group();
      cluster.position.set(centerX, centerY, centerZ);
      cluster.userData.visibilityRadiusSq = (cellSize * 1.35) * (cellSize * 1.35);

      const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, placements.length);
      rockMesh.castShadow = true;
      rockMesh.receiveShadow = true;
      rockMesh.userData.isCollider = true;

      for (let i = 0; i < placements.length; i++) {
        const rock = placements[i]!;
        this.tempPosition.set(rock.x - centerX, rock.y - centerY + 0.4 * rock.scale, rock.z - centerZ);
        this.tempQuat.setFromEuler(new THREE.Euler(rock.tilt, rock.yaw, rock.tilt * 0.3));
        this.tempScale.setScalar(rock.scale);
        this.tempMatrix.compose(this.tempPosition, this.tempQuat, this.tempScale);
        rockMesh.setMatrixAt(i, this.tempMatrix);
      }

      rockMesh.instanceMatrix.needsUpdate = true;
      cluster.add(rockMesh);
      this.root.add(cluster);
      this.collidableRoots.push(cluster);
      if (this.collisionSystem) {
        void this.collisionSystem.addCollidableFiltered(cluster);
      }
    }
  }

  private bucketPlacements(
    placements: DesertPlacement[],
    cellSize: number,
  ): Array<{ cellX: number; cellZ: number; placements: DesertPlacement[] }> {
    const buckets = new Map<string, { cellX: number; cellZ: number; placements: DesertPlacement[] }>();
    for (const placement of placements) {
      const cellX = Math.floor(placement.x / cellSize);
      const cellZ = Math.floor(placement.z / cellSize);
      const key = `${cellX},${cellZ}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.placements.push(placement);
      } else {
        buckets.set(key, { cellX, cellZ, placements: [placement] });
      }
    }
    return Array.from(buckets.values());
  }
}
