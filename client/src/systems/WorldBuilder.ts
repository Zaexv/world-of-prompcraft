import * as THREE from 'three';
import type { Terrain } from '../scene/Terrain';
import type { CollisionSystem } from './CollisionSystem';

/** A world object placed by the WorldBuilder agent */
export interface PlacedObject {
  id: string;
  type: string;
  group: THREE.Group;
  label?: string;
}

export class WorldBuilder {
  private scene: THREE.Scene;
  private terrain: Terrain;
  private collisionSystem: CollisionSystem | null = null;
  private objects: Map<string, PlacedObject> = new Map();

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.scene = scene;
    this.terrain = terrain;
  }

  setCollisionSystem(cs: CollisionSystem): void {
    this.collisionSystem = cs;
  }

  spawnObject(params: {
    objectId: string;
    objectType: string;
    position: [number, number, number];
    scale?: number;
    label?: string;
  }): void {
    if (this.objects.has(params.objectId)) return;

    const y = this.terrain.getHeightAt(params.position[0], params.position[2]);
    const pos = new THREE.Vector3(params.position[0], y, params.position[2]);
    const scale = params.scale ?? 1;

    const group = this.buildObject(params.objectType, pos, scale, params.label);
    if (!group) return;

    this.scene.add(group);
    if (this.collisionSystem) {
      this.collisionSystem.addCollidableFiltered(group);
    }

    this.objects.set(params.objectId, {
      id: params.objectId,
      type: params.objectType,
      group,
      label: params.label,
    });
  }

  removeObject(objectId: string): void {
    const placed = this.objects.get(objectId);
    if (!placed) return;
    this.scene.remove(placed.group);
    this.collisionSystem?.removeCollidable(placed.group);
    placed.group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    this.objects.delete(objectId);
  }

  getPlacedObjectIds(): string[] {
    return Array.from(this.objects.keys());
  }

  private buildObject(
    type: string,
    pos: THREE.Vector3,
    scale: number,
    label?: string,
  ): THREE.Group | null {
    switch (type) {
      case 'moonwell': return this.buildMoonwell(pos, scale);
      case 'tower': return this.buildTower(pos, scale);
      case 'ruins': return this.buildRuins(pos, scale);
      case 'campfire': return this.buildCampfire(pos, scale);
      case 'mushroom_cluster': return this.buildMushroomCluster(pos, scale);
      case 'crystal_cluster': return this.buildCrystalCluster(pos, scale);
      case 'ancient_tree': return this.buildAncientTree(pos, scale);
      case 'altar': return this.buildAltar(pos, scale);
      case 'runic_stone': return this.buildRunicStone(pos, scale);
      case 'lantern': return this.buildLantern(pos, scale);
      case 'wooden_fence': return this.buildWoodenFence(pos, scale);
      case 'pavilion': return this.buildPavilion(pos, scale);
      case 'bonfire': return this.buildBonfire(pos, scale);
      case 'portal_arch': return this.buildPortalArch(pos, scale);
      default: return this.buildDefaultMarker(pos, scale, label ?? type);
    }
  }

  // ── Object factories ──────────────────────────────────────────────────

  private buildMoonwell(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, roughness: 0.7 });
    const basinGeo = new THREE.CylinderGeometry(2 * scale, 2.2 * scale, 0.5 * scale, 12);
    const basin = new THREE.Mesh(basinGeo, stoneMat);
    basin.position.y = 0.25 * scale;
    basin.castShadow = true;
    basin.receiveShadow = true;
    basin.userData.isCollider = true;
    g.add(basin);

    const waterGeo = new THREE.CylinderGeometry(1.7 * scale, 1.7 * scale, 0.1 * scale, 12);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2244aa,
      emissive: new THREE.Color(0x0033cc),
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.75,
      roughness: 0.2,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 0.5 * scale;
    water.userData.noCollision = true;
    g.add(water);

    const pillarGeo = new THREE.CylinderGeometry(0.15 * scale, 0.15 * scale, 3 * scale, 6);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      pillar.position.set(Math.cos(angle) * 2.5 * scale, 1.5 * scale, Math.sin(angle) * 2.5 * scale);
      pillar.castShadow = true;
      pillar.userData.isCollider = true;
      g.add(pillar);
    }

    const orbGeo = new THREE.SphereGeometry(0.3 * scale, 8, 8);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0x88bbff,
      emissive: new THREE.Color(0x3366ff),
      emissiveIntensity: 1.2,
    });
    const orb = new THREE.Mesh(orbGeo, orbMat);
    orb.position.y = 3.5 * scale;
    orb.userData.noCollision = true;
    g.add(orb);

    return g;
  }

  private buildTower(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.85 });
    const bodyGeo = new THREE.CylinderGeometry(1.2 * scale, 1.5 * scale, 8 * scale, 8);
    const body = new THREE.Mesh(bodyGeo, stoneMat);
    body.position.y = 4 * scale;
    body.castShadow = true;
    body.receiveShadow = true;
    body.userData.isCollider = true;
    g.add(body);

    const capGeo = new THREE.ConeGeometry(1.5 * scale, 2.5 * scale, 8);
    const capMat = new THREE.MeshStandardMaterial({ color: 0x2a0845, roughness: 0.7 });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 9.25 * scale;
    cap.castShadow = true;
    cap.userData.noCollision = true;
    g.add(cap);

    const winGeo = new THREE.BoxGeometry(0.4 * scale, 0.6 * scale, 0.1 * scale);
    const winMat = new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: new THREE.Color(0xffcc44),
      emissiveIntensity: 0.8,
    });
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(0, 5 * scale, 1.21 * scale);
    win.userData.noCollision = true;
    g.add(win);

    return g;
  }

  private buildRuins(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a7a88, roughness: 0.9 });

    const wallDefs = [
      { x: 0, z: 0, h: 1.8, rx: 0 },
      { x: 3, z: 1, h: 1.2, rx: 0.1 },
      { x: -2, z: 2, h: 2.2, rx: -0.05 },
      { x: 1, z: -3, h: 0.8, rx: 0.08 },
    ];
    for (const p of wallDefs) {
      const geo = new THREE.BoxGeometry(1.2 * scale, p.h * scale, 0.4 * scale);
      const mesh = new THREE.Mesh(geo, stoneMat);
      mesh.position.set(p.x * scale, (p.h / 2) * scale, p.z * scale);
      mesh.rotation.x = p.rx;
      mesh.rotation.y = Math.random() * 0.3;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.isCollider = true;
      g.add(mesh);
    }

    for (let i = 0; i < 6; i++) {
      const size = (0.3 + Math.random() * 0.4) * scale;
      const geo = new THREE.BoxGeometry(size, size * 0.5, size);
      const mesh = new THREE.Mesh(geo, stoneMat);
      mesh.position.set(
        (Math.random() - 0.5) * 6 * scale,
        size * 0.25,
        (Math.random() - 0.5) * 6 * scale,
      );
      mesh.rotation.y = Math.random() * Math.PI;
      mesh.castShadow = true;
      mesh.userData.noCollision = true;
      g.add(mesh);
    }

    return g;
  }

  private buildCampfire(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const geo = new THREE.SphereGeometry(0.25 * scale, 5, 4);
      const mesh = new THREE.Mesh(geo, stoneMat);
      mesh.position.set(Math.cos(angle) * 0.6 * scale, 0.2 * scale, Math.sin(angle) * 0.6 * scale);
      mesh.userData.noCollision = true;
      g.add(mesh);
    }

    const logMat = new THREE.MeshStandardMaterial({ color: 0x4a2a10, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const geo = new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 1.2 * scale, 5);
      const log = new THREE.Mesh(geo, logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = angle;
      log.position.y = 0.1 * scale;
      log.userData.noCollision = true;
      g.add(log);
    }

    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: new THREE.Color(0xff2200),
      emissiveIntensity: 1.5,
    });
    for (let i = 0; i < 3; i++) {
      const size = (0.1 + Math.random() * 0.1) * scale;
      const geo = new THREE.SphereGeometry(size, 5, 4);
      const orb = new THREE.Mesh(geo, fireMat);
      orb.position.set(
        (Math.random() - 0.5) * 0.3 * scale,
        (0.4 + Math.random() * 0.4) * scale,
        (Math.random() - 0.5) * 0.3 * scale,
      );
      orb.userData.noCollision = true;
      g.add(orb);
    }

    return g;
  }

  private buildMushroomCluster(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const capMat = new THREE.MeshStandardMaterial({
      color: 0x2255aa,
      emissive: new THREE.Color(0x0033cc),
      emissiveIntensity: 0.6,
      roughness: 0.7,
    });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xddccaa, roughness: 0.85 });

    const count = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const h = (0.6 + Math.random() * 1.2) * scale;
      const r = (0.4 + Math.random() * 0.6) * scale;
      const ox = (Math.random() - 0.5) * 3 * scale;
      const oz = (Math.random() - 0.5) * 3 * scale;

      const stemGeo = new THREE.CylinderGeometry(0.1 * scale, 0.15 * scale, h, 6);
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set(ox, h / 2, oz);
      stem.userData.isCollider = true;
      g.add(stem);

      const capGeo = new THREE.CylinderGeometry(r, r * 0.3, 0.4 * scale, 8);
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(ox, h + 0.2 * scale, oz);
      cap.userData.noCollision = true;
      g.add(cap);
    }

    return g;
  }

  private buildCrystalCluster(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x44ffcc,
      emissive: new THREE.Color(0x00ffaa),
      emissiveIntensity: 0.8,
      roughness: 0.1,
      metalness: 0.3,
    });

    const count = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < count; i++) {
      const h = (0.8 + Math.random() * 2.5) * scale;
      const r = (0.15 + Math.random() * 0.2) * scale;
      const ox = (Math.random() - 0.5) * 2 * scale;
      const oz = (Math.random() - 0.5) * 2 * scale;

      const geo = new THREE.ConeGeometry(r, h, 5);
      const crystal = new THREE.Mesh(geo, crystalMat);
      crystal.position.set(ox, h / 2, oz);
      crystal.rotation.z = (Math.random() - 0.5) * 0.4;
      crystal.rotation.x = (Math.random() - 0.5) * 0.3;
      crystal.castShadow = true;
      crystal.userData.isCollider = true;
      g.add(crystal);
    }

    return g;
  }

  private buildAncientTree(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3a2510, roughness: 0.95 });
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0x2a5a2a, roughness: 0.85 });

    const trunkGeo = new THREE.CylinderGeometry(0.5 * scale, 0.8 * scale, 6 * scale, 8);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 3 * scale;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    trunk.userData.isCollider = true;
    g.add(trunk);

    const layers = [
      { y: 7, r: 3.5, h: 3 },
      { y: 9, r: 2.5, h: 2.5 },
      { y: 11, r: 1.5, h: 2 },
    ];
    for (const l of layers) {
      const geo = new THREE.ConeGeometry(l.r * scale, l.h * scale, 8);
      const mesh = new THREE.Mesh(geo, canopyMat);
      mesh.position.y = l.y * scale;
      mesh.castShadow = true;
      mesh.userData.noCollision = true;
      g.add(mesh);
    }

    return g;
  }

  private buildAltar(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.8 });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x8844ff,
      emissive: new THREE.Color(0x6633ff),
      emissiveIntensity: 0.9,
    });

    const baseGeo = new THREE.BoxGeometry(2.5 * scale, 0.4 * scale, 1.5 * scale);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 1.0 * scale;
    base.castShadow = true;
    base.receiveShadow = true;
    base.userData.isCollider = true;
    g.add(base);

    const legGeo = new THREE.BoxGeometry(0.3 * scale, 1.0 * scale, 0.3 * scale);
    for (const [lx, lz] of [[-1, -0.5], [1, -0.5], [-1, 0.5], [1, 0.5]] as [number, number][]) {
      const leg = new THREE.Mesh(legGeo, stoneMat);
      leg.position.set(lx * scale, 0.5 * scale, lz * scale);
      leg.castShadow = true;
      leg.userData.noCollision = true;
      g.add(leg);
    }

    const runeGeo = new THREE.SphereGeometry(0.25 * scale, 8, 8);
    const rune = new THREE.Mesh(runeGeo, runeMat);
    rune.position.y = 1.5 * scale;
    rune.userData.noCollision = true;
    g.add(rune);

    return g;
  }

  private buildRunicStone(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.88 });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x88ffcc,
      emissive: new THREE.Color(0x00ffaa),
      emissiveIntensity: 0.7,
    });

    const geo = new THREE.BoxGeometry(0.8 * scale, 2.5 * scale, 0.35 * scale);
    const stone = new THREE.Mesh(geo, stoneMat);
    stone.position.y = 1.25 * scale;
    stone.rotation.y = (Math.random() - 0.5) * 0.3;
    stone.castShadow = true;
    stone.receiveShadow = true;
    stone.userData.isCollider = true;
    g.add(stone);

    const runeGeo = new THREE.BoxGeometry(0.5 * scale, 1.5 * scale, 0.05 * scale);
    const runeFace = new THREE.Mesh(runeGeo, runeMat);
    runeFace.position.set(0, 1.25 * scale, 0.18 * scale);
    runeFace.rotation.y = stone.rotation.y;
    runeFace.userData.noCollision = true;
    g.add(runeFace);

    return g;
  }

  private buildLantern(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.4, metalness: 0.7 });
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: new THREE.Color(0xffcc44),
      emissiveIntensity: 1.0,
    });

    const postGeo = new THREE.CylinderGeometry(0.05 * scale, 0.07 * scale, 3 * scale, 6);
    const post = new THREE.Mesh(postGeo, metalMat);
    post.position.y = 1.5 * scale;
    post.castShadow = true;
    post.userData.isCollider = true;
    g.add(post);

    const houseGeo = new THREE.BoxGeometry(0.4 * scale, 0.5 * scale, 0.4 * scale);
    const house = new THREE.Mesh(houseGeo, metalMat);
    house.position.y = 3.25 * scale;
    house.userData.noCollision = true;
    g.add(house);

    const coreGeo = new THREE.SphereGeometry(0.15 * scale, 6, 6);
    const core = new THREE.Mesh(coreGeo, lightMat);
    core.position.y = 3.25 * scale;
    core.userData.noCollision = true;
    g.add(core);

    return g;
  }

  private buildWoodenFence(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });

    for (let i = 0; i < 3; i++) {
      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08 * scale, 0.1 * scale, 1.5 * scale, 5),
        woodMat,
      );
      post.position.set((i * 1.2 - 1.2) * scale, 0.75 * scale, 0);
      post.castShadow = true;
      post.userData.isCollider = true;
      g.add(post);
    }

    const rail1 = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 * scale, 0.12 * scale, 0.1 * scale),
      woodMat,
    );
    rail1.position.y = 1.2 * scale;
    rail1.userData.noCollision = true;
    g.add(rail1);

    const rail2 = new THREE.Mesh(
      new THREE.BoxGeometry(3.6 * scale, 0.12 * scale, 0.1 * scale),
      woodMat,
    );
    rail2.position.y = 0.6 * scale;
    rail2.userData.noCollision = true;
    g.add(rail2);

    return g;
  }

  private buildPavilion(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x2a0845, roughness: 0.7 });

    for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]] as [number, number][]) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 4 * scale, 8),
        woodMat,
      );
      pillar.position.set(px * scale, 2 * scale, pz * scale);
      pillar.castShadow = true;
      pillar.userData.isCollider = true;
      g.add(pillar);
    }

    const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5 * scale, 2 * scale, 4), roofMat);
    roof.position.y = 5 * scale;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    roof.userData.noCollision = true;
    g.add(roof);

    const floor = new THREE.Mesh(new THREE.BoxGeometry(5 * scale, 0.1 * scale, 5 * scale), woodMat);
    floor.position.y = 0.05 * scale;
    floor.receiveShadow = true;
    floor.userData.noCollision = true;
    g.add(floor);

    return g;
  }

  private buildBonfire(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const logMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.9 });
    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: new THREE.Color(0xff3300),
      emissiveIntensity: 2.0,
    });

    for (let i = 0; i < 2; i++) {
      const logGeo = new THREE.CylinderGeometry(0.15 * scale, 0.2 * scale, 2.5 * scale, 6);
      const log = new THREE.Mesh(logGeo, logMat);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = i * (Math.PI / 2);
      log.castShadow = true;
      log.userData.noCollision = true;
      g.add(log);
    }

    const flameGeo = new THREE.ConeGeometry(0.6 * scale, 2.0 * scale, 6);
    const flame = new THREE.Mesh(flameGeo, fireMat);
    flame.position.y = 1.5 * scale;
    flame.userData.noCollision = true;
    g.add(flame);

    return g;
  }

  private buildPortalArch(pos: THREE.Vector3, scale: number): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.75 });
    const portalMat = new THREE.MeshStandardMaterial({
      color: 0x8844ff,
      emissive: new THREE.Color(0x6622ff),
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.6,
    });

    for (const side of [-1, 1] as const) {
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25 * scale, 0.3 * scale, 5 * scale, 8),
        stoneMat,
      );
      pillar.position.set(side * 1.5 * scale, 2.5 * scale, 0);
      pillar.castShadow = true;
      pillar.userData.isCollider = true;
      g.add(pillar);

      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(0.6 * scale, 0.4 * scale, 0.6 * scale),
        stoneMat,
      );
      cap.position.set(side * 1.5 * scale, 5.2 * scale, 0);
      cap.userData.noCollision = true;
      g.add(cap);
    }

    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(3.4 * scale, 0.5 * scale, 0.4 * scale),
      stoneMat,
    );
    lintel.position.y = 5.5 * scale;
    lintel.userData.noCollision = true;
    g.add(lintel);

    const portalGeo = new THREE.PlaneGeometry(2.6 * scale, 4.8 * scale);
    const portal = new THREE.Mesh(portalGeo, portalMat);
    portal.position.y = 2.9 * scale;
    portal.userData.noCollision = true;
    g.add(portal);

    return g;
  }

  private buildDefaultMarker(pos: THREE.Vector3, scale: number, _label: string): THREE.Group {
    const g = new THREE.Group();
    g.position.copy(pos);

    const geo = new THREE.SphereGeometry(0.4 * scale, 8, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffaa00,
      emissive: new THREE.Color(0xff6600),
      emissiveIntensity: 0.8,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.position.y = 0.4 * scale;
    sphere.userData.noCollision = true;
    g.add(sphere);

    return g;
  }
}
