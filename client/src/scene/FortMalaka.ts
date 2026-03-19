import * as THREE from 'three';
import type { Terrain } from './Terrain';

/**
 * Fort Malaka — Málaga-inspired coastal city with the Blasted Suarezlands
 * mage district at its heart.
 *
 * Mage district: Grand Mage Tower, Arcane Pylons, Runic Circle, Mage Houses, Gateway.
 * Málaga features: La Alcazaba fortress, chiringuito beach bar, palm trees,
 * white Mediterranean houses, La Farola lighthouse, espeto stands, promenade.
 *
 * Performance-optimised: only 2 PointLights (tower top + lighthouse),
 * reduced geometry segments, minimal shadow casters, consolidated promenade.
 */
export class FortMalaka {
  /** World-space footprints so Vegetation can avoid them. */
  public readonly footprints: { x: number; z: number; radius: number }[] = [];

  /** Building groups for collision registration. */
  public readonly groups: THREE.Group[] = [];

  // Arcane palette
  private static readonly ARCANE_BLUE = 0x3366ff;
  private static readonly ARCANE_PURPLE = 0x8833dd;
  private static readonly DARK_STONE = 0x2a2a3a;
  private static readonly LIGHT_STONE = 0x888899;
  private static readonly RUNE_GLOW = 0x6644ff;
  private static readonly FROST_BLUE = 0x88ccff;
  private static readonly FIRE_ORANGE = 0xff6622;

  // Málaga / Mediterranean palette
  private static readonly WHITE_WALL = 0xf0ece0;
  private static readonly TERRACOTTA = 0xb85c38;
  private static readonly WARM_STONE = 0xc9a96e;
  private static readonly PALM_TRUNK = 0x6b4226;
  private static readonly PALM_GREEN = 0x2d7a2d;
  private static readonly SAND_COLOR = 0xd4b896;
  private static readonly WOOD_BROWN = 0x5c3a1e;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    // ── Mage District (Blasted Suarezlands) ──────────────────────────────
    this.createGrandMageTower(scene, 0, -120, terrain.getHeightAt(0, -120));
    this.createArcaneGateway(scene, 0, -88, terrain.getHeightAt(0, -88));
    this.createRunicCircle(scene, 0, -120, terrain.getHeightAt(0, -120));

    const pylonPositions = [
      [-20, -110], [20, -110], [-20, -135], [20, -135], [-8, -100], [8, -145],
    ];
    for (const [px, pz] of pylonPositions) {
      this.createArcanePylon(scene, px, pz, terrain.getHeightAt(px, pz));
    }

    // Mage houses (arcane-themed)
    this.createMageHouse(scene, -22, -125, terrain.getHeightAt(-22, -125), 0xff6622);
    this.createMageHouse(scene, 18, -108, terrain.getHeightAt(18, -108), 0x88ccff);
    this.createMageHouse(scene, -25, -105, terrain.getHeightAt(-25, -105), 0x8833dd);
    this.createMageHouse(scene, 22, -140, terrain.getHeightAt(22, -140), 0x6644ff);

    // ── Málaga Mediterranean structures ──────────────────────────────────

    // La Alcazaba — Moorish fortress overlooking the beach
    this.createAlcazaba(scene, 30, -152, terrain.getHeightAt(30, -152));

    // White Mediterranean houses (casitas blancas) — between district and beach
    const casitaPositions: [number, number][] = [
      [-35, -148], [-38, -138], [35, -135], [38, -145],
      [-30, -158], [28, -160], [-15, -152], [15, -155],
    ];
    for (const [cx, cz] of casitaPositions) {
      this.createCasitaBlanca(scene, cx, cz, terrain.getHeightAt(cx, cz));
    }

    // Paseo Marítimo — stone promenade along the beach edge
    this.createPromenade(scene, terrain);

    // Palm trees — along promenade and beach
    const palmPositions: [number, number][] = [
      [-25, -160], [-15, -162], [-5, -161], [5, -163],
      [15, -161], [25, -160], [35, -158], [-35, -157],
      [-20, -170], [0, -172], [20, -170], [10, -175],
      [-10, -174],
    ];
    for (const [px, pz] of palmPositions) {
      this.createPalmTree(scene, px, pz, terrain.getHeightAt(px, pz));
    }

    // La Farola — lighthouse at the east end of the beach
    this.createLighthouse(scene, 40, -175, terrain.getHeightAt(40, -175));

    // Chiringuito — beach bar
    this.createChiringuito(scene, -15, -172, terrain.getHeightAt(-15, -172));

    // Espeto stands — sardine grills on the beach
    this.createEspetoStand(scene, -5, -178, terrain.getHeightAt(-5, -178));
    this.createEspetoStand(scene, 10, -176, terrain.getHeightAt(10, -176));
  }

  // ----------------------------------------------------------------
  // Helper: emissive rune strip
  // ----------------------------------------------------------------
  private makeRune(
    width: number,
    height: number,
    depth: number,
    color: number = FortMalaka.RUNE_GLOW,
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = false;
    return mesh;
  }

  // ----------------------------------------------------------------
  // Grand Mage Tower: massive arcane spire at the district center
  // ----------------------------------------------------------------
  private createGrandMageTower(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    const darkStoneMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.DARK_STONE,
      roughness: 0.4,
      metalness: 0.2,
    });

    const lightStoneMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.LIGHT_STONE,
      roughness: 0.5,
      metalness: 0.1,
    });

    // Broad base
    const baseGeo = new THREE.CylinderGeometry(5, 6, 6, 8);
    const base = new THREE.Mesh(baseGeo, darkStoneMat);
    base.position.y = 3;
    base.receiveShadow = true;
    group.add(base);

    // Main tower shaft — keep castShadow
    const shaftGeo = new THREE.CylinderGeometry(3.5, 5, 28, 8);
    const shaft = new THREE.Mesh(shaftGeo, darkStoneMat);
    shaft.position.y = 20;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    group.add(shaft);

    // Upper observation deck
    const deckGeo = new THREE.CylinderGeometry(6, 3.5, 4, 8);
    const deck = new THREE.Mesh(deckGeo, lightStoneMat);
    deck.position.y = 36;
    group.add(deck);

    // Arcane dome on top
    const domeGeo = new THREE.SphereGeometry(4.5, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const domeMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.ARCANE_PURPLE,
      emissive: FortMalaka.ARCANE_PURPLE,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.8,
      roughness: 0.1,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 38;
    group.add(dome);

    // Arcane spire on top of dome
    const spireGeo = new THREE.ConeGeometry(1.2, 10, 5);
    const spireMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.RUNE_GLOW,
      emissive: FortMalaka.RUNE_GLOW,
      emissiveIntensity: 2.0,
      roughness: 0.1,
    });
    const spire = new THREE.Mesh(spireGeo, spireMat);
    spire.position.y = 47;
    group.add(spire);

    // Glowing rune lines spiraling up the tower (4 lines × 3 segments = 12 meshes)
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      for (let j = 0; j < 3; j++) {
        const spiralAngle = angle + (j / 3) * Math.PI * 4;
        const h = 4 + j * 10;
        const radius = 5.2 - (j / 3) * 1.5;
        const rune = this.makeRune(0.15, 2.5, 0.15);
        rune.position.set(
          Math.cos(spiralAngle) * radius,
          h,
          Math.sin(spiralAngle) * radius,
        );
        rune.rotation.set(0, -spiralAngle, 0.2);
        group.add(rune);
      }
    }

    // Floating arcane rings around the upper section (2 rings)
    for (let i = 0; i < 2; i++) {
      const ringGeo = new THREE.TorusGeometry(5.5 + i * 0.8, 0.08, 4, 16);
      const ringMat = new THREE.MeshStandardMaterial({
        color: FortMalaka.ARCANE_BLUE,
        emissive: FortMalaka.ARCANE_BLUE,
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.7,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 32 + i * 3;
      ring.rotation.x = Math.PI / 2;
      ring.rotation.z = i * 0.3;
      group.add(ring);
    }

    // Bright arcane light at the top — KEPT (1 of 2 PointLights)
    const topLight = new THREE.PointLight(FortMalaka.ARCANE_BLUE, 2, 30);
    topLight.position.set(0, 45, 0);
    group.add(topLight);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x, z, radius: 12 });
  }

  // ----------------------------------------------------------------
  // Arcane Gateway: entrance arch to the Blasted Suarezlands
  // ----------------------------------------------------------------
  private createArcaneGateway(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.DARK_STONE,
      roughness: 0.4,
      metalness: 0.15,
    });

    // Two massive pillars
    for (const side of [-1, 1]) {
      const pillarGeo = new THREE.CylinderGeometry(1.2, 1.5, 14, 6);
      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      pillar.position.set(side * 5, 7, 0);
      pillar.receiveShadow = true;
      group.add(pillar);

      // Rune strips on pillars
      for (let j = 0; j < 3; j++) {
        const rune = this.makeRune(0.1, 2, 0.1);
        rune.position.set(side * 5, 3 + j * 4, side * 1.3);
        group.add(rune);
      }

      // Orb on top of each pillar
      const orbGeo = new THREE.SphereGeometry(0.8, 6, 4);
      const orbMat = new THREE.MeshStandardMaterial({
        color: FortMalaka.ARCANE_BLUE,
        emissive: FortMalaka.ARCANE_BLUE,
        emissiveIntensity: 2.0,
        roughness: 0.1,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(side * 5, 15, 0);
      group.add(orb);
    }

    // Arch connecting the pillars
    const archGeo = new THREE.TorusGeometry(5, 0.6, 4, 16, Math.PI);
    const arch = new THREE.Mesh(archGeo, stoneMat);
    arch.position.set(0, 14, 0);
    arch.rotation.set(0, 0, 0);
    group.add(arch);

    // Glowing arcane rune in the center of the arch
    const centerRuneGeo = new THREE.TorusGeometry(2, 0.12, 4, 16);
    const centerRuneMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.RUNE_GLOW,
      emissive: FortMalaka.RUNE_GLOW,
      emissiveIntensity: 2.5,
    });
    const centerRune = new THREE.Mesh(centerRuneGeo, centerRuneMat);
    centerRune.position.set(0, 14, 0);
    centerRune.rotation.x = Math.PI / 2;
    group.add(centerRune);

    // Inner star pattern in the gate
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const starLine = this.makeRune(0.06, 3.5, 0.06);
      starLine.position.set(0, 14, 0);
      starLine.rotation.set(0, 0, angle);
      group.add(starLine);
    }

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x, z, radius: 8 });
  }

  // ----------------------------------------------------------------
  // Arcane Pylon: glowing obelisk
  // ----------------------------------------------------------------
  private createArcanePylon(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.DARK_STONE,
      roughness: 0.35,
      metalness: 0.2,
    });

    // Stone base
    const baseGeo = new THREE.CylinderGeometry(1.2, 1.5, 1.5, 6);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 0.75;
    base.receiveShadow = true;
    group.add(base);

    // Obelisk shaft (hexagonal prism tapering upward)
    const obeliskGeo = new THREE.CylinderGeometry(0.6, 1.0, 8, 6);
    const obelisk = new THREE.Mesh(obeliskGeo, stoneMat);
    obelisk.position.y = 5.5;
    obelisk.receiveShadow = true;
    group.add(obelisk);

    // Pointed cap — emissive, no PointLight needed
    const capGeo = new THREE.ConeGeometry(0.7, 2, 5);
    const capMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.ARCANE_PURPLE,
      emissive: FortMalaka.ARCANE_PURPLE,
      emissiveIntensity: 1.2,
      roughness: 0.2,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = 10.5;
    group.add(cap);

    // Glowing rune strips on the obelisk faces
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const rune = this.makeRune(0.08, 5, 0.08);
      rune.position.set(
        Math.cos(angle) * 0.85,
        5.5,
        Math.sin(angle) * 0.85,
      );
      group.add(rune);
    }

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x, z, radius: 3 });
  }

  // ----------------------------------------------------------------
  // Mage House: small pointed structure with themed glow
  // ----------------------------------------------------------------
  private createMageHouse(
    scene: THREE.Scene,
    x: number,
    z: number,
    y: number,
    accentColor: number,
  ): void {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.DARK_STONE,
      roughness: 0.5,
      metalness: 0.1,
    });

    // Rectangular base (slightly wider than tall)
    const baseGeo = new THREE.BoxGeometry(5, 4, 5);
    const base = new THREE.Mesh(baseGeo, stoneMat);
    base.position.y = 2;
    base.receiveShadow = true;
    group.add(base);

    // Pointed roof
    const roofGeo = new THREE.ConeGeometry(4.5, 5, 4);
    const roofMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.3,
      roughness: 0.5,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 6.5;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    // Door frame (arch)
    const doorGeo = new THREE.TorusGeometry(1, 0.15, 4, 8, Math.PI);
    const doorFrame = new THREE.Mesh(doorGeo, stoneMat);
    doorFrame.position.set(0, 1.5, 2.6);
    group.add(doorFrame);

    // Glowing windows — emissive replaces interior PointLight
    const windowGeo = new THREE.PlaneGeometry(1, 1.2);
    const windowMat = new THREE.MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 2.0,
      side: THREE.DoubleSide,
    });
    const window1 = new THREE.Mesh(windowGeo, windowMat);
    window1.position.set(2.51, 2.5, 0);
    window1.rotation.y = Math.PI / 2;
    group.add(window1);

    const window2 = new THREE.Mesh(windowGeo, windowMat);
    window2.position.set(-2.51, 2.5, 0);
    window2.rotation.y = Math.PI / 2;
    group.add(window2);

    // Rune above the door
    const doorRune = this.makeRune(0.06, 0.8, 0.06, accentColor);
    doorRune.position.set(0, 3.5, 2.6);
    group.add(doorRune);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x, z, radius: 5 });
  }

  // ----------------------------------------------------------------
  // Runic Circle: glowing arcane circle on the ground
  // ----------------------------------------------------------------
  private createRunicCircle(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    const runeMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.RUNE_GLOW,
      emissive: FortMalaka.RUNE_GLOW,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });

    // Outer ring
    const outerRingGeo = new THREE.TorusGeometry(9, 0.15, 4, 16);
    const outerRing = new THREE.Mesh(outerRingGeo, runeMat);
    outerRing.position.y = 0.15;
    outerRing.rotation.x = Math.PI / 2;
    group.add(outerRing);

    // Inner ring
    const innerRingGeo = new THREE.TorusGeometry(6, 0.12, 4, 16);
    const innerRing = new THREE.Mesh(innerRingGeo, runeMat);
    innerRing.position.y = 0.15;
    innerRing.rotation.x = Math.PI / 2;
    group.add(innerRing);

    // Center ring
    const centerRingGeo = new THREE.TorusGeometry(2.5, 0.1, 4, 16);
    const centerRing = new THREE.Mesh(centerRingGeo, runeMat);
    centerRing.position.y = 0.15;
    centerRing.rotation.x = Math.PI / 2;
    group.add(centerRing);

    // Connecting lines (star pattern — 4 lines from center to outer)
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const lineGeo = new THREE.BoxGeometry(0.08, 0.08, 9);
      const line = new THREE.Mesh(lineGeo, runeMat);
      line.position.set(
        Math.cos(angle) * 4.5,
        0.15,
        Math.sin(angle) * 4.5,
      );
      line.rotation.y = -angle + Math.PI / 2;
      group.add(line);
    }

    // Rune symbols between inner and outer ring (6 glowing boxes)
    const symbolMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.ARCANE_BLUE,
      emissive: FortMalaka.ARCANE_BLUE,
      emissiveIntensity: 2.5,
    });
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const symbolGeo = new THREE.BoxGeometry(0.5, 0.1, 0.5);
      const symbol = new THREE.Mesh(symbolGeo, symbolMat);
      symbol.position.set(
        Math.cos(angle) * 7.5,
        0.2,
        Math.sin(angle) * 7.5,
      );
      symbol.rotation.y = angle;
      group.add(symbol);
    }

    group.position.set(x, y, z);
    scene.add(group);
  }

  // ================================================================
  // MÁLAGA-THEMED STRUCTURES
  // ================================================================

  // ----------------------------------------------------------------
  // La Alcazaba: Moorish fortress overlooking the beach
  // ----------------------------------------------------------------
  private createAlcazaba(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    const warmStoneMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.WARM_STONE,
      roughness: 0.7,
      metalness: 0.05,
    });

    // Main fortress wall — keep castShadow
    const wallGeo = new THREE.BoxGeometry(18, 8, 12);
    const wall = new THREE.Mesh(wallGeo, warmStoneMat);
    wall.position.y = 4;
    wall.castShadow = true;
    wall.receiveShadow = true;
    group.add(wall);

    // Crenellations (merlons) along the top — 5×2=10
    for (let i = 0; i < 5; i++) {
      for (const side of [-1, 1]) {
        const merlonGeo = new THREE.BoxGeometry(1, 1.5, 0.8);
        const merlon = new THREE.Mesh(merlonGeo, warmStoneMat);
        merlon.position.set(-6 + i * 3, 8.75, side * 6.2);
        group.add(merlon);
      }
    }

    // Two corner towers (cylindrical, taller)
    for (const sx of [-1, 1]) {
      const towerGeo = new THREE.CylinderGeometry(2.5, 2.8, 12, 6);
      const tower = new THREE.Mesh(towerGeo, warmStoneMat);
      tower.position.set(sx * 10, 6, 0);
      group.add(tower);

      // Conical tower cap (terracotta)
      const capGeo = new THREE.ConeGeometry(3, 3, 5);
      const capMat = new THREE.MeshStandardMaterial({
        color: FortMalaka.TERRACOTTA,
        roughness: 0.6,
      });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(sx * 10, 13, 0);
      group.add(cap);
    }

    // Moorish arched entrance
    const archGeo = new THREE.TorusGeometry(2, 0.4, 4, 16, Math.PI);
    const arch = new THREE.Mesh(archGeo, warmStoneMat);
    arch.position.set(0, 4, 6.1);
    group.add(arch);

    // Arcane rune above entrance (mages have claimed the Alcazaba)
    const runeRingGeo = new THREE.TorusGeometry(1.2, 0.08, 4, 16);
    const runeRingMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.RUNE_GLOW,
      emissive: FortMalaka.RUNE_GLOW,
      emissiveIntensity: 1.5,
    });
    const runeRing = new THREE.Mesh(runeRingGeo, runeRingMat);
    runeRing.position.set(0, 7, 6.2);
    runeRing.rotation.x = Math.PI / 2;
    group.add(runeRing);

    // Inner courtyard fountain (Moorish style)
    const fountainBaseGeo = new THREE.CylinderGeometry(1.5, 1.8, 0.6, 6);
    const fountain = new THREE.Mesh(fountainBaseGeo, warmStoneMat);
    fountain.position.y = 0.3;
    group.add(fountain);

    const fountainWaterGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.1, 6);
    const fountainWaterMat = new THREE.MeshStandardMaterial({
      color: 0x44aacc,
      emissive: 0x44aacc,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.7,
    });
    const fountainWater = new THREE.Mesh(fountainWaterGeo, fountainWaterMat);
    fountainWater.position.y = 0.65;
    group.add(fountainWater);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x, z, radius: 14 });
  }

  // ----------------------------------------------------------------
  // Casita Blanca: white Mediterranean house with terracotta roof
  // ----------------------------------------------------------------
  private createCasitaBlanca(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    const whiteMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.WHITE_WALL,
      roughness: 0.8,
      metalness: 0.0,
    });

    // White walls
    const wallGeo = new THREE.BoxGeometry(4, 3.5, 4);
    const wall = new THREE.Mesh(wallGeo, whiteMat);
    wall.position.y = 1.75;
    wall.receiveShadow = true;
    group.add(wall);

    // Terracotta roof (hip roof using a low cone)
    const roofGeo = new THREE.ConeGeometry(3.5, 2, 4);
    const roofMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.TERRACOTTA,
      roughness: 0.65,
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = 4.5;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    // Blue door (Málaga style)
    const doorGeo = new THREE.PlaneGeometry(0.8, 1.8);
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x2266aa,
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const door = new THREE.Mesh(doorGeo, doorMat);
    door.position.set(0, 1, 2.01);
    group.add(door);

    // Small window with blue shutters
    const windowGeo = new THREE.PlaneGeometry(0.7, 0.7);
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x88bbdd,
      emissive: 0x88bbdd,
      emissiveIntensity: 0.5,
      side: THREE.DoubleSide,
    });
    const win = new THREE.Mesh(windowGeo, windowMat);
    win.position.set(1.2, 2.5, 2.01);
    group.add(win);

    // Flower pot on windowsill (red geraniums — very Málaga!)
    const potGeo = new THREE.CylinderGeometry(0.15, 0.12, 0.25, 6);
    const potMat = new THREE.MeshStandardMaterial({ color: FortMalaka.TERRACOTTA, roughness: 0.7 });
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.set(1.2, 2.1, 2.15);
    group.add(pot);

    const flowerGeo = new THREE.SphereGeometry(0.2, 6, 4);
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xdd2244, roughness: 0.6 });
    const flower = new THREE.Mesh(flowerGeo, flowerMat);
    flower.position.set(1.2, 2.35, 2.15);
    group.add(flower);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x, z, radius: 4 });
  }

  // ----------------------------------------------------------------
  // Palm Tree: Mediterranean coastal palm
  // ----------------------------------------------------------------
  private createPalmTree(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    // Slightly curved trunk
    const trunkMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.PALM_TRUNK,
      roughness: 0.9,
    });

    // Trunk segments with slight curve
    const trunkHeight = 10 + Math.sin(x * 0.5) * 2;
    const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, trunkHeight, 6);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = trunkHeight / 2;
    trunk.rotation.z = Math.sin(z * 0.3) * 0.08; // slight lean
    group.add(trunk);

    // Trunk ring marks
    for (let i = 0; i < 6; i++) {
      const ringGeo = new THREE.TorusGeometry(0.35 - i * 0.015, 0.03, 4, 6);
      const ringMat = new THREE.MeshStandardMaterial({ color: 0x4a2e14, roughness: 0.9 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 2 + i * 1.5;
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    // Palm fronds (6-8 elongated cones radiating outward)
    const frondMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.PALM_GREEN,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });
    const frondCount = 7;
    for (let i = 0; i < frondCount; i++) {
      const angle = (i / frondCount) * Math.PI * 2;
      const frondGeo = new THREE.ConeGeometry(0.5, 5, 4);
      const frond = new THREE.Mesh(frondGeo, frondMat);
      frond.position.set(
        Math.cos(angle) * 1.5,
        trunkHeight - 0.5,
        Math.sin(angle) * 1.5,
      );
      // Droop outward and downward
      frond.rotation.set(
        Math.sin(angle) * 0.8,
        0,
        -Math.cos(angle) * 0.8,
      );
      group.add(frond);
    }

    // Crown cluster at top
    const crownGeo = new THREE.SphereGeometry(0.6, 6, 4);
    const crown = new THREE.Mesh(crownGeo, frondMat);
    crown.position.y = trunkHeight;
    group.add(crown);

    group.position.set(x, y, z);
    scene.add(group);
    this.footprints.push({ x, z, radius: 2 });
  }

  // ----------------------------------------------------------------
  // La Farola: lighthouse at the beach
  // ----------------------------------------------------------------
  private createLighthouse(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    const whiteMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.WHITE_WALL,
      roughness: 0.5,
      metalness: 0.05,
    });

    // Tapered cylindrical tower — keep castShadow
    const towerGeo = new THREE.CylinderGeometry(1.2, 1.8, 16, 6);
    const tower = new THREE.Mesh(towerGeo, whiteMat);
    tower.position.y = 8;
    tower.castShadow = true;
    tower.receiveShadow = true;
    group.add(tower);

    // Red band near top (Málaga's Farola has bands)
    const bandGeo = new THREE.CylinderGeometry(1.3, 1.3, 1, 6);
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xcc2222, roughness: 0.5 });
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = 14;
    group.add(band);

    // Lantern room (glass dome)
    const lanternGeo = new THREE.CylinderGeometry(1.5, 1.3, 2.5, 6);
    const lanternMat = new THREE.MeshStandardMaterial({
      color: 0xccddee,
      transparent: true,
      opacity: 0.6,
      roughness: 0.1,
    });
    const lantern = new THREE.Mesh(lanternGeo, lanternMat);
    lantern.position.y = 17.25;
    group.add(lantern);

    // Dome cap
    const domeGeo = new THREE.SphereGeometry(1.5, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, whiteMat);
    dome.position.y = 18.5;
    group.add(dome);

    // Bright light at top — KEPT (2 of 2 PointLights)
    const light = new THREE.PointLight(0xffeedd, 2, 30);
    light.position.set(0, 17.5, 0);
    group.add(light);

    // Arcane glow (mages enchanted the lighthouse)
    const arcaneRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.8, 0.06, 4, 16),
      new THREE.MeshStandardMaterial({
        color: FortMalaka.RUNE_GLOW,
        emissive: FortMalaka.RUNE_GLOW,
        emissiveIntensity: 1.5,
      }),
    );
    arcaneRing.position.y = 16;
    arcaneRing.rotation.x = Math.PI / 2;
    group.add(arcaneRing);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x, z, radius: 4 });
  }

  // ----------------------------------------------------------------
  // Chiringuito: Málaga beach bar with thatched roof
  // ----------------------------------------------------------------
  private createChiringuito(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.WOOD_BROWN,
      roughness: 0.85,
    });

    // 4 wooden posts
    const postGeo = new THREE.CylinderGeometry(0.15, 0.2, 3.5, 6);
    const postPositions = [[-3, -2], [3, -2], [-3, 2], [3, 2]];
    for (const [px, pz] of postPositions) {
      const post = new THREE.Mesh(postGeo, woodMat);
      post.position.set(px, 1.75, pz);
      group.add(post);
    }

    // Thatched roof (straw/cane — warm yellow-brown)
    const thatchMat = new THREE.MeshStandardMaterial({
      color: 0xc4a44a,
      roughness: 0.95,
      side: THREE.DoubleSide,
    });
    const roofGeo = new THREE.ConeGeometry(5, 2.5, 4);
    const roof = new THREE.Mesh(roofGeo, thatchMat);
    roof.position.y = 4.5;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);

    // Bar counter
    const counterGeo = new THREE.BoxGeometry(5, 0.8, 1);
    const counter = new THREE.Mesh(counterGeo, woodMat);
    counter.position.set(0, 1, -1.5);
    group.add(counter);

    // Bar stools (3)
    const stoolMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 });
    for (let i = 0; i < 3; i++) {
      const stoolGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.8, 6);
      const stool = new THREE.Mesh(stoolGeo, stoolMat);
      stool.position.set(-1.5 + i * 1.5, 0.4, -2.5);
      group.add(stool);

      const seatGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 6);
      const seat = new THREE.Mesh(seatGeo, stoolMat);
      seat.position.set(-1.5 + i * 1.5, 0.85, -2.5);
      group.add(seat);
    }

    // String lights — emissive material only, no PointLight
    const stringLightGeo = new THREE.SphereGeometry(0.15, 6, 4);
    const stringLightMat = new THREE.MeshStandardMaterial({
      color: 0xffdd88,
      emissive: 0xffdd88,
      emissiveIntensity: 2.0,
    });
    for (let i = 0; i < 5; i++) {
      const bulb = new THREE.Mesh(stringLightGeo, stringLightMat);
      bulb.position.set(-2 + i, 3.5, 0);
      group.add(bulb);
    }

    // Sign: "Chiringuito El Mago" (just a wooden plank)
    const signGeo = new THREE.BoxGeometry(2.5, 0.5, 0.08);
    const signMat = new THREE.MeshStandardMaterial({ color: 0x3a2010, roughness: 0.9 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 3.2, -2.1);
    group.add(sign);

    group.position.set(x, y, z);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x, z, radius: 6 });
  }

  // ----------------------------------------------------------------
  // Espeto Stand: sardine grills stuck in the sand (iconic Málaga)
  // ----------------------------------------------------------------
  private createEspetoStand(scene: THREE.Scene, x: number, z: number, y: number): void {
    const group = new THREE.Group();

    // Fire pit (sand ring with embers)
    const pitGeo = new THREE.CylinderGeometry(1, 1.2, 0.3, 6);
    const pitMat = new THREE.MeshStandardMaterial({
      color: FortMalaka.SAND_COLOR,
      roughness: 0.9,
    });
    const pit = new THREE.Mesh(pitGeo, pitMat);
    pit.position.y = 0.15;
    group.add(pit);

    // Glowing embers — emissive replaces PointLight
    const emberGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.1, 6);
    const emberMat = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: 0xff4400,
      emissiveIntensity: 2.0,
      roughness: 0.9,
    });
    const embers = new THREE.Mesh(emberGeo, emberMat);
    embers.position.y = 0.35;
    group.add(embers);

    // Sardine skewers (5 sticks angled into the sand around the pit)
    const stickMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.9 });
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI - Math.PI / 2;
      const stickGeo = new THREE.CylinderGeometry(0.03, 0.03, 2, 4);
      const stick = new THREE.Mesh(stickGeo, stickMat);
      stick.position.set(Math.cos(angle) * 0.8, 1.2, Math.sin(angle) * 0.5);
      stick.rotation.z = Math.cos(angle) * 0.4;
      stick.rotation.x = Math.sin(angle) * 0.2;
      group.add(stick);

      // Fish on the stick (small ellipsoids)
      const fishGeo = new THREE.SphereGeometry(0.1, 4, 3);
      fishGeo.scale(1, 0.6, 2);
      const fishMat = new THREE.MeshStandardMaterial({ color: 0x778899, roughness: 0.7 });
      for (let j = 0; j < 3; j++) {
        const fish = new THREE.Mesh(fishGeo, fishMat);
        fish.position.copy(stick.position);
        fish.position.y += 0.3 * (j - 1);
        group.add(fish);
      }
    }

    group.position.set(x, y, z);
    scene.add(group);
    this.footprints.push({ x, z, radius: 2 });
  }

  // ----------------------------------------------------------------
  // Paseo Marítimo: stone promenade between city and beach
  // Consolidated into single slabs + 3 lamp posts (emissive only)
  // ----------------------------------------------------------------
  private createPromenade(scene: THREE.Scene, terrain: Terrain): void {
    const pz = -160;
    const py = terrain.getHeightAt(0, pz);

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0xb8a890,
      roughness: 0.7,
      metalness: 0.05,
    });

    const group = new THREE.Group();

    // ONE long stone slab for the entire promenade (X: -35 to +35)
    const slabGeo = new THREE.BoxGeometry(70, 0.2, 3);
    const slab = new THREE.Mesh(slabGeo, stoneMat);
    slab.position.y = 0.1;
    slab.receiveShadow = true;
    group.add(slab);

    // ONE long railing on the beach side
    const railGeo = new THREE.BoxGeometry(70, 0.6, 0.3);
    const rail = new THREE.Mesh(railGeo, stoneMat);
    rail.position.set(0, 0.5, 1.5);
    group.add(rail);

    group.position.set(0, py, pz);
    scene.add(group);
    this.groups.push(group);
    this.footprints.push({ x: 0, z: pz, radius: 38 });

    // 3 lamp posts (emissive globes only, no PointLights)
    const postMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.4, metalness: 0.6 });
    for (const lx of [-20, 0, 20]) {
      const lpy = terrain.getHeightAt(lx, -159);
      const lampGroup = new THREE.Group();

      // Iron post
      const postGeo = new THREE.CylinderGeometry(0.08, 0.1, 4, 6);
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.y = 2;
      lampGroup.add(post);

      // Lamp arm
      const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.2, 4);
      const arm = new THREE.Mesh(armGeo, postMat);
      arm.position.set(0, 4, 0.4);
      arm.rotation.x = Math.PI / 3;
      lampGroup.add(arm);

      // Lamp globe — emissive only
      const globeGeo = new THREE.SphereGeometry(0.25, 6, 4);
      const globeMat = new THREE.MeshStandardMaterial({
        color: 0xffeedd,
        emissive: 0xffeedd,
        emissiveIntensity: 2.0,
        transparent: true,
        opacity: 0.8,
      });
      const globe = new THREE.Mesh(globeGeo, globeMat);
      globe.position.set(0, 4.2, 0.9);
      lampGroup.add(globe);

      lampGroup.position.set(lx, lpy, -159);
      scene.add(lampGroup);
    }
  }
}
