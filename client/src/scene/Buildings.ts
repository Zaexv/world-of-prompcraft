import * as THREE from 'three';
import type { Terrain } from './Terrain';

/**
 * Teldrassil-themed Night Elf buildings: Moonwell, Tree-house dwelling,
 * Sentinel tower, and Market pavilion.
 */
export class Buildings {
  /** World-space footprints so Vegetation can avoid them. */
  public readonly footprints: { x: number; z: number; radius: number }[] = [];

  /** Building groups added to the scene, exposed for mesh-based collision. */
  public readonly groups: THREE.Group[] = [];

  // Shared palette
  private static readonly BARK_COLOR = 0x3b2a1a;
  private static readonly PURPLE_FABRIC = 0x6a2fa0;
  private static readonly TEAL_FABRIC = 0x1a8a7a;
  private static readonly MOONSTONE = 0xd0d8e8;
  private static readonly RUNE_PURPLE = 0xaa44ff;
  private static readonly TEAL_GLOW = 0x00ffcc;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    // Place buildings at roughly the same positions as the originals,
    // snapped to terrain height so they sit correctly on the infinite terrain.
    this.createMoonwell(scene, 30, 10, terrain.getHeightAt(30, 10));
    this.createTreeHouse(scene, -40, -25, terrain.getHeightAt(-40, -25));
    this.createSentinelTower(scene, 15, -35, terrain.getHeightAt(15, -35));
    this.createMarketPavilion(scene, -20, 20, terrain.getHeightAt(-20, 20));
  }

  // ----------------------------------------------------------------
  // Helper: create an emissive rune strip
  // ----------------------------------------------------------------
  private makeRune(
    width: number,
    height: number,
    depth: number,
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({
      color: Buildings.RUNE_PURPLE,
      emissive: Buildings.RUNE_PURPLE,
      emissiveIntensity: 1.5,
      roughness: 0.3,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    return mesh;
  }

  // ----------------------------------------------------------------
  // Moonwell: iconic Teldrassil glowing pool at village center
  // ----------------------------------------------------------------
  private createMoonwell(scene: THREE.Scene, x: number, z: number, y: number = 0): void {
    const group = new THREE.Group();

    // Stone basin (outer ring)
    const basinGeo = new THREE.CylinderGeometry(5, 5.5, 2, 24);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: Buildings.MOONSTONE,
      roughness: 0.6,
      metalness: 0.1,
    });
    const basin = new THREE.Mesh(basinGeo, stoneMat);
    basin.position.y = 1;
    basin.castShadow = true;
    basin.receiveShadow = true;
    group.add(basin);

    // Inner water surface (glowing teal)
    const waterGeo = new THREE.CylinderGeometry(4.2, 4.2, 0.15, 24);
    const waterMat = new THREE.MeshStandardMaterial({
      color: Buildings.TEAL_GLOW,
      emissive: Buildings.TEAL_GLOW,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
    });
    const water = new THREE.Mesh(waterGeo, waterMat);
    water.position.y = 1.8;
    group.add(water);

    // Stone pillars around the moonwell (6 pillars)
    const pillarGeo = new THREE.CylinderGeometry(0.35, 0.4, 5, 8);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      pillar.position.set(
        Math.cos(angle) * 6.2,
        2.5,
        Math.sin(angle) * 6.2,
      );
      pillar.castShadow = true;
      group.add(pillar);

      // Rune strip on each pillar
      const rune = this.makeRune(0.08, 2.5, 0.08);
      rune.position.set(
        Math.cos(angle) * 6.2,
        3.0,
        Math.sin(angle) * 6.2,
      );
      group.add(rune);
    }

    // Curved stone arches between pillars (simplified as torus arcs)
    const archMat = new THREE.MeshStandardMaterial({
      color: Buildings.MOONSTONE,
      roughness: 0.5,
    });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
      const archGeo = new THREE.TorusGeometry(1.8, 0.15, 6, 8, Math.PI);
      const arch = new THREE.Mesh(archGeo, archMat);
      arch.position.set(
        Math.cos(angle) * 6.2,
        5.0,
        Math.sin(angle) * 6.2,
      );
      arch.rotation.set(0, -angle + Math.PI / 2, 0);
      arch.castShadow = true;
      group.add(arch);
    }

    // Subtle point light for the glow
    const glowLight = new THREE.PointLight(0x00ffcc, 3, 20);
    glowLight.position.set(0, 3, 0);
    group.add(glowLight);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);

    this.footprints.push({ x, z, radius: 10 });
  }

  // ----------------------------------------------------------------
  // Tree-house dwelling: massive trunk with a built-in platform
  // ----------------------------------------------------------------
  private createTreeHouse(scene: THREE.Scene, x: number, z: number, y: number = 0): void {
    const group = new THREE.Group();

    const barkMat = new THREE.MeshStandardMaterial({
      color: Buildings.BARK_COLOR,
      roughness: 0.95,
    });

    // Massive trunk
    const trunkGeo = new THREE.CylinderGeometry(3, 4, 22, 12);
    const trunk = new THREE.Mesh(trunkGeo, barkMat);
    trunk.position.y = 11;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    group.add(trunk);

    // Thick roots flaring out at the base
    const rootGeo = new THREE.CylinderGeometry(4, 5.5, 4, 12);
    const roots = new THREE.Mesh(rootGeo, barkMat);
    roots.position.y = 2;
    roots.castShadow = true;
    group.add(roots);

    // Platform at mid-height
    const platformGeo = new THREE.CylinderGeometry(6, 6, 0.5, 16);
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x4a3520,
      roughness: 0.8,
    });
    const platform = new THREE.Mesh(platformGeo, platformMat);
    platform.position.y = 10;
    platform.castShadow = true;
    platform.receiveShadow = true;
    group.add(platform);

    // Curved walls around the platform (partial cylinders using LatheGeometry)
    const wallProfile = [
      new THREE.Vector2(5.5, 0),
      new THREE.Vector2(5.5, 5),
      new THREE.Vector2(5.2, 5.5),
      new THREE.Vector2(4.8, 5.5),
    ];
    const wallGeo = new THREE.LatheGeometry(wallProfile, 16, 0, Math.PI * 1.4);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x4a3520,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.y = 10.25;
    wall.castShadow = true;
    group.add(wall);

    // Purple fabric roof (cone)
    const roofGeo = new THREE.ConeGeometry(7, 4, 12);
    const roofMat = new THREE.MeshStandardMaterial({
      color: Buildings.PURPLE_FABRIC,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 17.5;
    roof.castShadow = true;
    group.add(roof);

    // Arched doorway (torus segment as frame)
    const doorFrameGeo = new THREE.TorusGeometry(1.5, 0.2, 6, 8, Math.PI);
    const doorFrame = new THREE.Mesh(doorFrameGeo, barkMat);
    doorFrame.position.set(0, 11.5, 5.5);
    doorFrame.rotation.set(0, 0, 0);
    doorFrame.castShadow = true;
    group.add(doorFrame);

    // Window arches (2 windows on sides)
    for (const angle of [Math.PI * 0.5, Math.PI * 1.5]) {
      const windowGeo = new THREE.TorusGeometry(0.8, 0.12, 6, 8, Math.PI);
      const windowFrame = new THREE.Mesh(windowGeo, barkMat);
      windowFrame.position.set(
        Math.cos(angle) * 5.5,
        13,
        Math.sin(angle) * 5.5,
      );
      windowFrame.rotation.set(0, -angle + Math.PI / 2, 0);
      group.add(windowFrame);
    }

    // Rune lines spiraling around the trunk
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const rune = this.makeRune(0.1, 3, 0.1);
      rune.position.set(
        Math.cos(angle) * 3.2,
        5 + i * 1.5,
        Math.sin(angle) * 3.2,
      );
      rune.rotation.set(0, -angle, 0.3);
      group.add(rune);
    }

    // Large canopy above
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x1a4a2a,
      roughness: 0.9,
    });
    for (let i = 0; i < 5; i++) {
      const canopyGeo = new THREE.SphereGeometry(4 + Math.random() * 2, 8, 6);
      const canopy = new THREE.Mesh(canopyGeo, canopyMat);
      const a = (i / 5) * Math.PI * 2;
      canopy.position.set(
        Math.cos(a) * 3,
        20 + Math.random() * 3,
        Math.sin(a) * 3,
      );
      canopy.castShadow = true;
      group.add(canopy);
    }

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);

    this.footprints.push({ x, z, radius: 10 });
  }

  // ----------------------------------------------------------------
  // Sentinel Tower: elegant narrow tower with spiral suggestion
  // ----------------------------------------------------------------
  private createSentinelTower(scene: THREE.Scene, x: number, z: number, y: number = 0): void {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshStandardMaterial({
      color: Buildings.MOONSTONE,
      roughness: 0.5,
      metalness: 0.15,
    });

    // Base: narrow at bottom, flares at top
    const towerGeo = new THREE.CylinderGeometry(3.5, 2, 24, 12);
    const tower = new THREE.Mesh(towerGeo, stoneMat);
    tower.position.y = 12;
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    // Flared crown at top
    const crownGeo = new THREE.CylinderGeometry(5, 3.5, 3, 12);
    const crown = new THREE.Mesh(crownGeo, stoneMat);
    crown.position.y = 25.5;
    crown.castShadow = true;
    group.add(crown);

    // Pointed spire
    const spireGeo = new THREE.ConeGeometry(2, 8, 8);
    const spireMat = new THREE.MeshStandardMaterial({
      color: Buildings.PURPLE_FABRIC,
      roughness: 0.5,
    });
    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.y = 31;
    spire.castShadow = true;
    group.add(spire);

    // Spiral staircase suggestion: small boxes spiraling around
    const stepMat = new THREE.MeshStandardMaterial({
      color: 0xc0c8d8,
      roughness: 0.6,
    });
    const stepGeo = new THREE.BoxGeometry(1.5, 0.3, 0.8);
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 6; // 3 full spirals
      const height = 1 + (i / 20) * 22;
      const step = new THREE.Mesh(stepGeo, stepMat);
      step.position.set(
        Math.cos(angle) * 2.8,
        height,
        Math.sin(angle) * 2.8,
      );
      step.rotation.set(0, -angle, 0);
      step.castShadow = true;
      group.add(step);
    }

    // Purple glow rune lines running up the tower
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const rune = this.makeRune(0.12, 20, 0.12);
      rune.position.set(
        Math.cos(angle) * 2.3,
        12,
        Math.sin(angle) * 2.3,
      );
      group.add(rune);
    }

    // Crown rune ring
    const runeRingGeo = new THREE.TorusGeometry(4.2, 0.1, 4, 24);
    const runeRingMat = new THREE.MeshStandardMaterial({
      color: Buildings.RUNE_PURPLE,
      emissive: Buildings.RUNE_PURPLE,
      emissiveIntensity: 1.5,
    });
    const runeRing = new THREE.Mesh(runeRingGeo, runeRingMat);
    runeRing.position.y = 27;
    runeRing.rotation.x = Math.PI / 2;
    group.add(runeRing);

    // Subtle glow at the top
    const topLight = new THREE.PointLight(0xaa44ff, 2, 15);
    topLight.position.set(0, 30, 0);
    group.add(topLight);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);

    this.footprints.push({ x, z, radius: 7 });
  }

  // ----------------------------------------------------------------
  // Market Pavilion: open structure with curved pillars and fabric canopy
  // ----------------------------------------------------------------
  private createMarketPavilion(scene: THREE.Scene, x: number, z: number, y: number = 0): void {
    const group = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({
      color: Buildings.BARK_COLOR,
      roughness: 0.85,
    });

    // 8 curved wooden pillars in a circle
    const pillarRadius = 7;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;

      // Each pillar is a slightly curved cylinder
      const pillarGeo = new THREE.CylinderGeometry(0.3, 0.4, 6, 8);
      const pillar = new THREE.Mesh(pillarGeo, woodMat);
      pillar.position.set(
        Math.cos(angle) * pillarRadius,
        3,
        Math.sin(angle) * pillarRadius,
      );
      // Slight lean outward for organic feel
      pillar.rotation.set(
        Math.sin(angle) * 0.08,
        0,
        -Math.cos(angle) * 0.08,
      );
      pillar.castShadow = true;
      group.add(pillar);

      // Small rune on each pillar
      const rune = this.makeRune(0.06, 1.5, 0.06);
      rune.position.copy(pillar.position);
      rune.position.y = 4;
      group.add(rune);
    }

    // Fabric canopy: a disc with slight vertex displacement for droop
    const canopyGeo = new THREE.CircleGeometry(8, 24);
    // Displace vertices for a drooping effect
    const posAttr = canopyGeo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vy = posAttr.getY(i);
      const dist = Math.sqrt(vx * vx + vy * vy);
      // Droop: edges hang lower
      const droop = -(dist / 8) * (dist / 8) * 1.5;
      posAttr.setZ(i, droop);
    }
    posAttr.needsUpdate = true;
    canopyGeo.computeVertexNormals();

    // Purple/teal gradient: use base purple
    const canopyMat = new THREE.MeshStandardMaterial({
      color: Buildings.PURPLE_FABRIC,
      roughness: 0.6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 6;
    canopy.rotation.x = -Math.PI / 2;
    canopy.castShadow = true;
    canopy.receiveShadow = true;
    group.add(canopy);

    // Second inner canopy layer in teal for color variety
    const innerCanopyGeo = new THREE.CircleGeometry(5, 18);
    const innerPosAttr = innerCanopyGeo.getAttribute('position');
    for (let i = 0; i < innerPosAttr.count; i++) {
      const vx = innerPosAttr.getX(i);
      const vy = innerPosAttr.getY(i);
      const dist = Math.sqrt(vx * vx + vy * vy);
      const droop = -(dist / 5) * (dist / 5) * 0.8;
      innerPosAttr.setZ(i, droop);
    }
    innerPosAttr.needsUpdate = true;
    innerCanopyGeo.computeVertexNormals();

    const innerCanopyMat = new THREE.MeshStandardMaterial({
      color: Buildings.TEAL_FABRIC,
      roughness: 0.5,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    const innerCanopy = new THREE.Mesh(innerCanopyGeo, innerCanopyMat);
    innerCanopy.position.y = 6.2;
    innerCanopy.rotation.x = -Math.PI / 2;
    group.add(innerCanopy);

    // Central display table (stone slab)
    const tableGeo = new THREE.CylinderGeometry(2, 2.2, 1, 12);
    const tableMat = new THREE.MeshStandardMaterial({
      color: Buildings.MOONSTONE,
      roughness: 0.6,
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.y = 0.5;
    table.castShadow = true;
    table.receiveShadow = true;
    group.add(table);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);

    this.footprints.push({ x, z, radius: 10 });
  }
}
