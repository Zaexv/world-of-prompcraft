import * as THREE from "three";
import type { DungeonConfig } from "./DungeonConfig";

/**
 * All objects produced by a dungeon interior, including interactive meshes
 * and spawn positions that the DungeonSystem needs for gameplay logic.
 */
export interface DungeonObjects {
  group: THREE.Group;
  enemySpawnPoints: THREE.Vector3[];
  chestPosition: THREE.Vector3;
  exitPortalPosition: THREE.Vector3;
  chestMesh: THREE.Group;
  exitPortalMesh: THREE.Group;
}

// ---------------------------------------------------------------------------
// Shared geometry / material caches (created once per call, reused within)
// ---------------------------------------------------------------------------

interface SharedAssets {
  wallMat: THREE.MeshStandardMaterial;
  floorMat: THREE.MeshStandardMaterial;
  ceilingMat: THREE.MeshStandardMaterial;
  chestMat: THREE.MeshStandardMaterial;
  portalMat: THREE.MeshStandardMaterial;
}

function createSharedAssets(config: DungeonConfig): SharedAssets {
  return {
    wallMat: new THREE.MeshStandardMaterial({
      color: config.wallColor,
      emissive: config.ambientColor,
      emissiveIntensity: 0.08,
      roughness: 0.85,
      metalness: 0.05,
    }),
    floorMat: new THREE.MeshStandardMaterial({
      color: config.floorColor,
      emissive: config.ambientColor,
      emissiveIntensity: 0.05,
      roughness: 0.9,
    }),
    ceilingMat: new THREE.MeshStandardMaterial({
      color: config.ceilingColor,
      emissive: config.ambientColor,
      emissiveIntensity: 0.04,
      roughness: 0.9,
    }),
    chestMat: new THREE.MeshStandardMaterial({
      color: 0xc5a55a,
      emissive: 0x554400,
      emissiveIntensity: 0.3,
      roughness: 0.4,
      metalness: 0.3,
    }),
    portalMat: new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      emissive: 0x2244aa,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    }),
  };
}

// ---------------------------------------------------------------------------
// Room shell: floor, walls, ceiling
// ---------------------------------------------------------------------------

function buildRoom(
  group: THREE.Group,
  config: DungeonConfig,
  assets: SharedAssets,
): void {
  const { roomWidth, roomDepth } = config;
  const wallHeight = 8;

  // Floor
  const floorGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
  const floor = new THREE.Mesh(floorGeo, assets.floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // Ceiling
  const ceilingGeo = new THREE.PlaneGeometry(roomWidth, roomDepth);
  const ceiling = new THREE.Mesh(ceilingGeo, assets.ceilingMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = wallHeight;
  group.add(ceiling);

  // Front wall (positive Z)
  const frontBackGeo = new THREE.BoxGeometry(roomWidth, wallHeight, 0.5);
  const frontWall = new THREE.Mesh(frontBackGeo, assets.wallMat);
  frontWall.position.set(0, wallHeight / 2, roomDepth / 2);
  frontWall.castShadow = true;
  frontWall.receiveShadow = true;
  group.add(frontWall);

  // Back wall (negative Z)
  const backWall = new THREE.Mesh(frontBackGeo, assets.wallMat);
  backWall.position.set(0, wallHeight / 2, -roomDepth / 2);
  backWall.castShadow = true;
  backWall.receiveShadow = true;
  group.add(backWall);

  // Side walls
  const sideGeo = new THREE.BoxGeometry(0.5, wallHeight, roomDepth);
  const leftWall = new THREE.Mesh(sideGeo, assets.wallMat);
  leftWall.position.set(-roomWidth / 2, wallHeight / 2, 0);
  leftWall.castShadow = true;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  const rightWall = new THREE.Mesh(sideGeo, assets.wallMat);
  rightWall.position.set(roomWidth / 2, wallHeight / 2, 0);
  rightWall.castShadow = true;
  rightWall.receiveShadow = true;
  group.add(rightWall);
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

function addLighting(group: THREE.Group, config: DungeonConfig): void {
  // Strong ambient fill — dungeons should be moody but visible
  const ambientFill = new THREE.AmbientLight(0xffffff, 0.5);
  group.add(ambientFill);

  // Hemisphere light for natural fill (sky color + ground bounce)
  const hemiLight = new THREE.HemisphereLight(
    config.ambientColor,
    config.floorColor,
    0.6,
  );
  group.add(hemiLight);

  // Central point light — high intensity, large range to cover the room
  const centerLight = new THREE.PointLight(config.ambientColor, 3, 60);
  centerLight.position.set(0, 6, 0);
  centerLight.castShadow = true;
  group.add(centerLight);

  // Four corner fill lights for even coverage
  const { roomWidth, roomDepth } = config;
  const cornerIntensity = 1.2;
  const cornerRange = 25;
  const corners = [
    [-roomWidth * 0.35, 5, -roomDepth * 0.35],
    [roomWidth * 0.35, 5, -roomDepth * 0.35],
    [-roomWidth * 0.35, 5, roomDepth * 0.35],
    [roomWidth * 0.35, 5, roomDepth * 0.35],
  ] as const;

  for (const [cx, cy, cz] of corners) {
    const cornerLight = new THREE.PointLight(
      config.ambientColor,
      cornerIntensity,
      cornerRange,
    );
    cornerLight.position.set(cx, cy, cz);
    group.add(cornerLight);
  }
}

// ---------------------------------------------------------------------------
// Loot chest
// ---------------------------------------------------------------------------

function buildChest(
  group: THREE.Group,
  config: DungeonConfig,
  assets: SharedAssets,
): { chestGroup: THREE.Group; chestPos: THREE.Vector3 } {
  const chestGroup = new THREE.Group();
  const chestPos = new THREE.Vector3(0, 0, -config.roomDepth / 2 + 3);

  // Body
  const bodyGeo = new THREE.BoxGeometry(1.2, 0.8, 0.8);
  const body = new THREE.Mesh(bodyGeo, assets.chestMat);
  body.position.y = 0.4;
  body.castShadow = true;
  body.receiveShadow = true;
  chestGroup.add(body);

  // Lid
  const lidGeo = new THREE.BoxGeometry(1.2, 0.1, 0.8);
  const lid = new THREE.Mesh(lidGeo, assets.chestMat);
  lid.position.y = 0.85;
  lid.castShadow = true;
  chestGroup.add(lid);

  // Warm glow above the chest
  const chestLight = new THREE.PointLight(0xffaa44, 1.2, 8);
  chestLight.position.set(0, 2, 0);
  chestGroup.add(chestLight);

  chestGroup.position.copy(chestPos);
  group.add(chestGroup);

  return { chestGroup, chestPos };
}

// ---------------------------------------------------------------------------
// Exit portal
// ---------------------------------------------------------------------------

function buildExitPortal(
  group: THREE.Group,
  config: DungeonConfig,
  assets: SharedAssets,
): { portalGroup: THREE.Group; portalPos: THREE.Vector3 } {
  const portalGroup = new THREE.Group();
  const portalPos = new THREE.Vector3(0, 0, config.roomDepth / 2 - 2);

  // Torus ring (vertical, facing player)
  const torusGeo = new THREE.TorusGeometry(1.5, 0.15, 8, 24);
  const torus = new THREE.Mesh(torusGeo, assets.portalMat);
  torus.position.y = 2;
  torus.rotation.y = 0; // faces along Z axis by default
  torus.castShadow = true;
  portalGroup.add(torus);

  // Glow light at the portal center
  const portalLight = new THREE.PointLight(0x4488ff, 1.5, 10);
  portalLight.position.set(0, 2, 0);
  portalGroup.add(portalLight);

  portalGroup.position.copy(portalPos);
  group.add(portalGroup);

  return { portalGroup, portalPos };
}

// ---------------------------------------------------------------------------
// Enemy spawn points
// ---------------------------------------------------------------------------

function computeEnemySpawnPoints(config: DungeonConfig): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  const count = config.enemyCount;
  const radius = 10;

  for (let i = 0; i < count; i++) {
    // Distribute in a semicircle in the back half of the room (negative Z)
    const angle = Math.PI + (i / (count - 1 || 1)) * Math.PI; // PI to 2*PI
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * radius,
        0,
        Math.sin(angle) * radius,
      ),
    );
  }

  return points;
}

// ---------------------------------------------------------------------------
// Dungeon-specific decorations
// ---------------------------------------------------------------------------

function addEmberDepthsDecorations(
  group: THREE.Group,
  config: DungeonConfig,
): void {
  const { roomWidth, roomDepth } = config;

  // Lava pool material (shared for all pools)
  const lavaMat = new THREE.MeshStandardMaterial({
    color: 0xff6600,
    emissive: 0xff4400,
    emissiveIntensity: 2.0,
    roughness: 0.3,
  });

  // 3-4 lava pools on the floor
  const lavaPoolGeo = new THREE.CircleGeometry(2, 16);
  const poolPositions = [
    { x: -roomWidth * 0.25, z: -roomDepth * 0.2 },
    { x: roomWidth * 0.2, z: roomDepth * 0.15 },
    { x: -roomWidth * 0.1, z: roomDepth * 0.3 },
    { x: roomWidth * 0.3, z: -roomDepth * 0.1 },
  ];

  for (const pos of poolPositions) {
    const pool = new THREE.Mesh(lavaPoolGeo, lavaMat);
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(pos.x, 0.02, pos.z);
    group.add(pool);

    // Warm light underneath each pool
    const poolLight = new THREE.PointLight(0xff4400, 1.0, 8);
    poolLight.position.set(pos.x, 0.5, pos.z);
    group.add(poolLight);
  }

  // Stalactites from the ceiling (inverted cones)
  const stalactiteMat = new THREE.MeshStandardMaterial({
    color: 0x2a1a0a,
    roughness: 0.95,
  });

  for (let i = 0; i < 8; i++) {
    const sx = (Math.random() - 0.5) * roomWidth * 0.8;
    const sz = (Math.random() - 0.5) * roomDepth * 0.8;
    const height = 1.0 + Math.random() * 2.0;
    const stalGeo = new THREE.ConeGeometry(0.3, height, 5);
    const stal = new THREE.Mesh(stalGeo, stalactiteMat);
    stal.rotation.x = Math.PI; // invert
    stal.position.set(sx, 8 - height / 2, sz);
    stal.castShadow = true;
    group.add(stal);
  }
}

function addCrystalCavernsDecorations(
  group: THREE.Group,
  config: DungeonConfig,
): void {
  const { roomWidth, roomDepth } = config;

  // Crystal formation material (shared)
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x66aaee,
    emissive: 0x4488cc,
    emissiveIntensity: 1.2,
    roughness: 0.15,
    metalness: 0.3,
    transparent: true,
    opacity: 0.85,
  });

  // 5 crystal formations
  const crystalPositions = [
    { x: -roomWidth * 0.3, z: -roomDepth * 0.3 },
    { x: roomWidth * 0.25, z: -roomDepth * 0.25 },
    { x: -roomWidth * 0.15, z: roomDepth * 0.2 },
    { x: roomWidth * 0.35, z: roomDepth * 0.1 },
    { x: -roomWidth * 0.35, z: 0 },
  ];

  const crystalGeo = new THREE.ConeGeometry(0.4, 2.5, 6);

  for (const pos of crystalPositions) {
    // Each formation is a cluster of 2-3 crystals
    const clusterCount = 2 + Math.floor(Math.random() * 2);
    for (let j = 0; j < clusterCount; j++) {
      const crystal = new THREE.Mesh(crystalGeo, crystalMat);
      const scale = 0.6 + Math.random() * 0.8;
      crystal.scale.set(scale, scale, scale);
      crystal.position.set(
        pos.x + (Math.random() - 0.5) * 1.5,
        scale * 1.25,
        pos.z + (Math.random() - 0.5) * 1.5,
      );
      crystal.rotation.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * Math.PI,
        (Math.random() - 0.5) * 0.3,
      );
      crystal.castShadow = true;
      group.add(crystal);
    }
  }

  // Ice patches (semi-transparent blue planes on the floor)
  const iceMat = new THREE.MeshStandardMaterial({
    color: 0x88bbee,
    emissive: 0x224466,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
  });

  const iceGeo = new THREE.CircleGeometry(1.5, 12);
  const icePositions = [
    { x: roomWidth * 0.1, z: -roomDepth * 0.15 },
    { x: -roomWidth * 0.2, z: roomDepth * 0.1 },
    { x: roomWidth * 0.15, z: roomDepth * 0.3 },
  ];

  for (const pos of icePositions) {
    const ice = new THREE.Mesh(iceGeo, iceMat);
    ice.rotation.x = -Math.PI / 2;
    ice.position.set(pos.x, 0.01, pos.z);
    group.add(ice);
  }

  // Sparkle light at center
  const sparkleLight = new THREE.PointLight(0x4488cc, 0.8, 15);
  sparkleLight.position.set(0, 4, 0);
  group.add(sparkleLight);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a complete dungeon interior scene from a DungeonConfig.
 * Returns all interactive objects and spawn positions needed by DungeonSystem.
 */
export function createDungeonInterior(config: DungeonConfig): DungeonObjects {
  const group = new THREE.Group();
  group.name = `dungeon_${config.id}`;

  const assets = createSharedAssets(config);

  // Room shell
  buildRoom(group, config, assets);

  // Lighting
  addLighting(group, config);

  // Loot chest
  const { chestGroup, chestPos } = buildChest(group, config, assets);

  // Exit portal
  const { portalGroup, portalPos } = buildExitPortal(group, config, assets);

  // Enemy spawn points
  const enemySpawnPoints = computeEnemySpawnPoints(config);

  // Dungeon-specific decorations
  if (config.id === "ember_depths") {
    addEmberDepthsDecorations(group, config);
  } else if (config.id === "crystal_caverns") {
    addCrystalCavernsDecorations(group, config);
  }

  return {
    group,
    enemySpawnPoints,
    chestPosition: chestPos,
    exitPortalPosition: portalPos,
    chestMesh: chestGroup,
    exitPortalMesh: portalGroup,
  };
}

/**
 * Disposes all geometries and materials within a dungeon interior.
 */
export function disposeDungeonInterior(objects: DungeonObjects): void {
  objects.group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const material = child.material;
      if (Array.isArray(material)) {
        for (const mat of material) {
          mat.dispose();
        }
      } else {
        material.dispose();
      }
    }
  });

  // Remove all children
  while (objects.group.children.length > 0) {
    objects.group.remove(objects.group.children[0]);
  }
}
