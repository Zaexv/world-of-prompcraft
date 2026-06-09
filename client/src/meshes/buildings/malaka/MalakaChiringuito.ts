import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh } from '../../core/MeshRegistry';
import { getMaterials, MedMaterials } from './MalakaKit';
import { withLOD } from './MalakaKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { createEmberParticles } from '../../props/fireParticles';
import { applyWorldTiling } from '../worldTiled';

// ─── Helper: Andalusian wicker-style chair ─────────────────────────────────────
function createAndalusianChair(scale: number, _mats: MedMaterials): THREE.Group {
  const chair = new THREE.Group();
  const wickerMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.95 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.4 });

  const seatW = 0.4 * scale;
  const seatD = 0.4 * scale;
  const seatH = 0.04 * scale;
  const legH = 0.45 * scale;
  const backH = 0.5 * scale;

  // Wicker seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, seatH, seatD), wickerMat);
  seat.position.y = legH + seatH / 2;
  seat.castShadow = true;
  seat.receiveShadow = true;
  chair.add(seat);

  // 4 iron legs
  const legGeo = new THREE.CylinderGeometry(0.02 * scale, 0.02 * scale, legH, 6);
  const legPositions = [
    [-seatW / 2 + 0.04 * scale, -seatD / 2 + 0.04 * scale],
    [seatW / 2 - 0.04 * scale, -seatD / 2 + 0.04 * scale],
    [-seatW / 2 + 0.04 * scale, seatD / 2 - 0.04 * scale],
    [seatW / 2 - 0.04 * scale, seatD / 2 - 0.04 * scale],
  ];
  for (const [lx, lz] of legPositions) {
    const leg = new THREE.Mesh(legGeo, ironMat);
    leg.position.set(lx, legH / 2, lz);
    chair.add(leg);
  }

  // Backrest — two vertical wicker slats + top rail
  const backSlat = new THREE.Mesh(new THREE.BoxGeometry(0.03 * scale, backH, 0.03 * scale), wickerMat);
  const bs1 = backSlat.clone();
  bs1.position.set(-seatW / 2 + 0.06 * scale, legH + seatH + backH / 2, -seatD / 2 + 0.03 * scale);
  chair.add(bs1);
  const bs2 = backSlat.clone();
  bs2.position.set(seatW / 2 - 0.06 * scale, legH + seatH + backH / 2, -seatD / 2 + 0.03 * scale);
  chair.add(bs2);

  // Top rail
  const topRail = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.04 * scale, 0.04 * scale, 0.03 * scale), wickerMat);
  topRail.position.set(0, legH + seatH + backH, -seatD / 2 + 0.03 * scale);
  chair.add(topRail);

  // Mid-back horizontal wicker strip
  const midStrip = new THREE.Mesh(new THREE.BoxGeometry(seatW - 0.08 * scale, 0.03 * scale, 0.02 * scale), wickerMat);
  midStrip.position.set(0, legH + seatH + backH * 0.5, -seatD / 2 + 0.03 * scale);
  chair.add(midStrip);

  return chair;
}

// ─── Helper: Andalusian wooden table ──────────────────────────────────────────
function createAndalusianTable(scale: number, mats: MedMaterials): THREE.Group {
  const table = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.4 });

  const topW = 0.9 * scale;
  const topD = 0.9 * scale;
  const topH = 0.05 * scale;
  const legH = 0.72 * scale;

  // Wooden tabletop
  const top = new THREE.Mesh(new THREE.BoxGeometry(topW, topH, topD), mats.wood);
  top.position.y = legH + topH / 2;
  top.castShadow = true;
  top.receiveShadow = true;
  table.add(top);

  // Central iron pedestal (single-leg bistro style)
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.04 * scale, 0.04 * scale, legH, 8), ironMat);
  pedestal.position.y = legH / 2;
  table.add(pedestal);

  // Iron cross-base feet (4 spokes)
  const footGeo = new THREE.BoxGeometry(0.5 * scale, 0.03 * scale, 0.04 * scale);
  for (let i = 0; i < 4; i++) {
    const foot = new THREE.Mesh(footGeo, ironMat);
    foot.rotation.y = (i * Math.PI) / 2;
    foot.position.y = 0.015 * scale;
    table.add(foot);
  }

  return table;
}

// ─── Helper: Bar stool (tall, with footrest) ──────────────────────────────────
function createBarStool(scale: number, _mats: MedMaterials): THREE.Group {
  const stool = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.4 });
  const wickerMat = new THREE.MeshStandardMaterial({ color: 0x8b6914, roughness: 0.95 });

  const seatR = 0.18 * scale;
  const seatH = 0.04 * scale;
  const legH = 0.75 * scale;

  // Round wicker seat
  const seat = new THREE.Mesh(new THREE.CylinderGeometry(seatR, seatR, seatH, 12), wickerMat);
  seat.position.y = legH + seatH / 2;
  seat.castShadow = true;
  stool.add(seat);

  // 4 iron legs (slightly angled outward)
  const legGeo = new THREE.CylinderGeometry(0.015 * scale, 0.02 * scale, legH, 6);
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const leg = new THREE.Mesh(legGeo, ironMat);
    const spread = 0.12 * scale;
    leg.position.set(Math.cos(angle) * spread, legH / 2, Math.sin(angle) * spread);
    leg.rotation.set(Math.sin(angle) * 0.08, 0, -Math.cos(angle) * 0.08);
    stool.add(leg);
  }

  // Footrest ring
  const footrest = new THREE.Mesh(
    new THREE.TorusGeometry(0.14 * scale, 0.012 * scale, 6, 16),
    ironMat
  );
  footrest.position.y = legH * 0.35;
  footrest.rotation.x = Math.PI / 2;
  stool.add(footrest);

  return stool;
}

// ─── Helper: Tabletop objects ───────────────────────────────────────────────────
function addTableObjects(parent: THREE.Group, tableX: number, tableZ: number, tableTopY: number, scale: number): void {
  const plateMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.3 });
  const oliveOilMat = new THREE.MeshStandardMaterial({ color: 0x9aab3d, transparent: true, opacity: 0.7, roughness: 0.1 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaccff, transparent: true, opacity: 0.55, roughness: 0.05 });
  const breadMat = new THREE.MeshStandardMaterial({ color: 0xc4913e, roughness: 0.9 });
  const napkinMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 1.0 });
  const foodMat = new THREE.MeshStandardMaterial({ color: 0xb85c38, roughness: 0.8 });

  // Two plates
  for (let d = 0; d < 2; d++) {
    const dx = (d === 0 ? 0.22 : -0.22) * scale;
    const dz = (d === 0 ? 0.15 : -0.15) * scale;

    // Plate (flat disc)
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14 * scale, 0.13 * scale, 0.02 * scale, 16),
      plateMat
    );
    plate.position.set(tableX + dx, tableTopY + 0.01 * scale, tableZ + dz);
    parent.add(plate);

    // Food on plate (small irregular shapes)
    const food = new THREE.Mesh(
      new THREE.SphereGeometry(0.06 * scale, 6, 4),
      foodMat
    );
    food.scale.set(1.5, 0.4, 1.2);
    food.position.set(tableX + dx, tableTopY + 0.03 * scale, tableZ + dz);
    parent.add(food);

    // Glass next to plate
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04 * scale, 0.035 * scale, 0.14 * scale, 8),
      glassMat
    );
    glass.position.set(tableX + dx + 0.12 * scale, tableTopY + 0.07 * scale, tableZ + dz);
    parent.add(glass);
  }

  // Olive oil bottle (center)
  const bottleBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035 * scale, 0.04 * scale, 0.16 * scale, 8),
    oliveOilMat
  );
  bottleBody.position.set(tableX, tableTopY + 0.08 * scale, tableZ);
  parent.add(bottleBody);

  const bottleNeck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015 * scale, 0.02 * scale, 0.06 * scale, 6),
    oliveOilMat
  );
  bottleNeck.position.set(tableX, tableTopY + 0.19 * scale, tableZ);
  parent.add(bottleNeck);

  // Napkin holder (small box)
  const napkinHolder = new THREE.Mesh(
    new THREE.BoxGeometry(0.06 * scale, 0.1 * scale, 0.03 * scale),
    napkinMat
  );
  napkinHolder.position.set(tableX - 0.05 * scale, tableTopY + 0.05 * scale, tableZ + 0.25 * scale);
  parent.add(napkinHolder);

  // Bread basket
  const basket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08 * scale, 0.06 * scale, 0.05 * scale, 10),
    new THREE.MeshStandardMaterial({ color: 0xa57b4a, roughness: 1.0 })
  );
  basket.position.set(tableX + 0.05 * scale, tableTopY + 0.025 * scale, tableZ - 0.25 * scale);
  parent.add(basket);

  // Bread pieces in basket
  for (let b = 0; b < 3; b++) {
    const bread = new THREE.Mesh(
      new THREE.SphereGeometry(0.03 * scale, 5, 4),
      breadMat
    );
    bread.scale.set(1.3, 0.5, 1.0);
    bread.position.set(
      tableX + 0.05 * scale + (Math.random() - 0.5) * 0.06 * scale,
      tableTopY + 0.06 * scale,
      tableZ - 0.25 * scale + (Math.random() - 0.5) * 0.04 * scale
    );
    parent.add(bread);
  }
}

// ─── Helper: Andalusian jábega boat (espetero) ─────────────────────────────────
function createJabegaBoat(scale: number, mats: MedMaterials): THREE.Group {
  const boatGroup = new THREE.Group();

  const boatLength = 4.5 * scale;
  const boatWidth = 1.6 * scale;
  const boatDepth = 0.7 * scale; // slightly shallower
  
  // A simple stretched hemisphere for the hull
  const hullGeo = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  hullGeo.scale(boatWidth / 2, boatDepth, boatLength / 2);
  
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x4a2818, roughness: 0.9, side: THREE.DoubleSide });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  // The sphere is centered at 0, goes from y=0 to y=boatDepth.
  // Rotate 180 degrees on X to make it a bowl (y=0 to y=-boatDepth).
  hull.rotation.x = Math.PI; 
  hull.position.y = boatDepth; // bring it up so bottom is at ground level
  hull.castShadow = true;
  boatGroup.add(hull);


  // Sand bed for espetos
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xe3cda4, roughness: 1.0 });
  const sand = new THREE.Mesh(
    new THREE.BoxGeometry(boatWidth * 0.7, 0.2 * scale, boatLength * 0.6),
    sandMat
  );
  sand.position.set(0, boatDepth - 0.1 * scale, 0); // At the top of the boat
  boatGroup.add(sand);

  // Fire / charcoal embers
  const fireMat = new THREE.MeshStandardMaterial({
    color: 0xff4400,
    emissive: new THREE.Color(0xff2200),
    emissiveIntensity: 1.5,
  });
  const charcoalMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    emissive: new THREE.Color(0x551100),
    emissiveIntensity: 0.3,
    roughness: 1.0,
  });

  // Charcoal bed
  for (let i = 0; i < 12; i++) {
    const coal = new THREE.Mesh(
      new THREE.SphereGeometry(0.1 * scale, 5, 4),
      i % 3 === 0 ? fireMat : charcoalMat
    );
    coal.scale.set(1.2, 0.5, 1.0);
    coal.position.set(
      (Math.random() - 0.5) * 0.8 * scale,
      boatDepth,
      (Math.random() - 0.5) * 1.5 * scale
    );
    coal.userData.noCollision = true;
    boatGroup.add(coal);
  }

  // Ember particles
  boatGroup.add(createEmberParticles({
    scale, count: 20, radius: 0.4,
    baseY: boatDepth + 0.1 * scale, rise: 1.5, speed: 1.2, size: 0.1,
  }));

  // Espetos (skewers with sardines)
  const skewerMat = mats.wood;
  const fishMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.4 });
  const fishGrilledMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, metalness: 0.3, roughness: 0.7 });
  
  for (let i = 0; i < 6; i++) {
    const skewer = new THREE.Group();
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015 * scale, 0.01 * scale, 1.6 * scale),
      skewerMat
    );
    // Skewer center is at 0, goes from -0.8 to 0.8 on Y axis
    stick.position.y = 0.8 * scale; 
    skewer.add(stick);

    // Add fishes along the stick
    for (let f = 0; f < 4; f++) {
      const fish = new THREE.Mesh(
        new THREE.SphereGeometry(0.08 * scale, 8, 4),
        f < 2 ? fishGrilledMat : fishMat
      );
      fish.scale.set(1, 2.5, 0.3); // elongated fish
      // Position along the stick (Y axis)
      fish.position.set(0, 0.4 * scale + f * 0.2 * scale, 0);
      skewer.add(fish);
    }

    const side = i % 2 === 0 ? 1 : -1;
    // Position the skewer base in the sand
    skewer.position.set(
      side * 0.3 * scale,
      boatDepth - 0.2 * scale, // base inside sand
      -0.6 * scale + i * 0.4 * scale
    );
    // Tilt the skewer outward and backward
    skewer.rotation.z = side * Math.PI / 6; // tilt outwards
    skewer.rotation.x = Math.PI / 8; // tilt back slightly
    boatGroup.add(skewer);
  }

  return boatGroup;
}

// =============================================================================
export class MalakaChiringuito extends Mesh {
  static readonly type = 'malaka_chiringuito';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    const groundY = 0;

    // ═══════════════════════════════════════════════════════════════════════════
    // BAR COUNTER (stone base + wooden counter top)
    // ═══════════════════════════════════════════════════════════════════════════
    const barW = 6 * scale;
    const barD = 3 * scale;
    const barH = 1.2 * scale;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(barW, barH, barD), mats.stone);
    bar.position.set(-2 * scale, groundY + barH / 2, -2 * scale);
    bar.castShadow = true;
    bar.receiveShadow = true;
    g.add(bar);

    const barCounter = new THREE.Mesh(
      new THREE.BoxGeometry(barW + 0.4 * scale, 0.1 * scale, barD + 0.4 * scale),
      mats.wood
    );
    barCounter.position.set(-2 * scale, groundY + barH + 0.05 * scale, -2 * scale);
    g.add(barCounter);


    const barProxy = boxCollider(barW, barH, barD);
    barProxy.position.copy(bar.position);
    g.add(barProxy);

    // ═══════════════════════════════════════════════════════════════════════════
    // PILLARS & ROOF (Simple flat roof with dry palm material)
    // ═══════════════════════════════════════════════════════════════════════════
    const roofH = 3.5 * scale;
    const roofW = 8 * scale;
    const roofD = 6 * scale;

    // Wooden pillars
    const pillarGeo = new THREE.BoxGeometry(0.35 * scale, roofH, 0.35 * scale);
    const pillarPos = [
      [-5 * scale, -4 * scale],
      [1 * scale, -4 * scale],
      [-5 * scale, 0],
      [1 * scale, 0],
    ];
    for (const [x, z] of pillarPos) {
      const p = new THREE.Mesh(pillarGeo, mats.wood);
      p.position.set(x, groundY + roofH / 2, z);
      p.castShadow = true;
      p.receiveShadow = true;
      g.add(p);

      const pCol = boxCollider(0.4 * scale, roofH, 0.4 * scale);
      pCol.position.copy(p.position);
      g.add(pCol);
    }

    // Pergola beams (main supports)
    const beamW_mesh = new THREE.Mesh(new THREE.BoxGeometry(roofW, 0.2 * scale, 0.2 * scale), mats.wood);
    beamW_mesh.position.set(-2 * scale, groundY + roofH, -4 * scale);
    g.add(beamW_mesh);
    const beamW2 = beamW_mesh.clone();
    beamW2.position.set(-2 * scale, groundY + roofH, 0);
    g.add(beamW2);

    const beamD_mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2 * scale, 0.2 * scale, roofD), mats.wood);
    beamD_mesh.position.set(-5 * scale, groundY + roofH, -2 * scale);
    g.add(beamD_mesh);
    const beamD2 = beamD_mesh.clone();
    beamD2.position.set(1 * scale, groundY + roofH, -2 * scale);
    g.add(beamD2);

    // Beautiful wooden slatted pergola roof
    const slatCount = 24;
    for (let i = 0; i < slatCount; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(roofW + 1 * scale, 0.05 * scale, 0.12 * scale),
        mats.wood
      );
      const zPos = -2 * scale - roofD / 2 + i * (roofD / (slatCount - 1));
      slat.position.set(-2 * scale, groundY + roofH + 0.15 * scale, zPos);
      slat.castShadow = true;
      slat.receiveShadow = true;
      g.add(slat);
    }

    // Roof collision
    const roofCol = boxCollider(roofW + 1 * scale, 0.4 * scale, roofD + 1 * scale);
    roofCol.position.set(-2 * scale, groundY + roofH + 0.1 * scale, -2 * scale);
    g.add(roofCol);

    // ═══════════════════════════════════════════════════════════════════════════
    // ANDALUSIAN TABLES & CHAIRS (realistic furniture)
    // ═══════════════════════════════════════════════════════════════════════════
    {
      const tx = 3 * scale;
      const tz = 0; // Just one table

      // Andalusian wooden table
      const tableGroup = createAndalusianTable(scale, mats);
      tableGroup.position.set(tx, groundY, tz);
      g.add(tableGroup);

      // Table collision
      const tableCollider = boxCollider(1.0 * scale, 0.8 * scale, 1.0 * scale);
      tableCollider.position.set(tx, groundY + 0.4 * scale, tz);
      g.add(tableCollider);

      const tableTopY = groundY + 0.72 * scale + 0.05 * scale; // legH + topH

      // Objects on the table
      addTableObjects(g, tx, tz, tableTopY, scale);

      // 4 wicker chairs around table
      const chairOffsets = [
        { x: 0, z: -1.0, rot: 0 },
        { x: 0, z: 1.0, rot: Math.PI },
        { x: -1.0, z: 0, rot: Math.PI / 2 },
        { x: 1.0, z: 0, rot: -Math.PI / 2 },
      ];
      for (const off of chairOffsets) {
        const chairGroup = createAndalusianChair(scale, mats);
        const cx = tx + off.x * scale;
        const cz = tz + off.z * scale;
        chairGroup.position.set(cx, groundY, cz);
        chairGroup.rotation.y = off.rot;
        g.add(chairGroup);

        const chairCol = boxCollider(0.5 * scale, 1.0 * scale, 0.5 * scale);
        chairCol.position.set(cx, groundY + 0.5 * scale, cz);
        chairCol.rotation.y = off.rot;
        g.add(chairCol);
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // BAR STOOLS (in front of bar counter)
    // ═══════════════════════════════════════════════════════════════════════════
    for (let i = 0; i < 4; i++) {
      const stool = createBarStool(scale, mats);
      const sx = -4 * scale + i * 1.3 * scale;
      const sz = -0.2 * scale;
      stool.position.set(sx, groundY, sz);
      g.add(stool);

      const stoolCol = boxCollider(0.4 * scale, 0.8 * scale, 0.4 * scale);
      stoolCol.position.set(sx, groundY + 0.4 * scale, sz);
      g.add(stoolCol);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ESPETERO BOAT (ancient Andalusian jábega)
    // ═══════════════════════════════════════════════════════════════════════════
    const boatGroup = createJabegaBoat(scale, mats);
    boatGroup.position.set(-4 * scale, groundY, 3 * scale);
    boatGroup.rotation.y = Math.PI / 6;
    g.add(boatGroup);

    const boatProxy = boxCollider(1.6 * scale, 0.8 * scale, 4.5 * scale);
    boatProxy.position.copy(boatGroup.position);
    boatProxy.position.y += 0.4 * scale;
    boatProxy.rotation.copy(boatGroup.rotation);
    g.add(boatProxy);


    applyWorldTiling(g, mats.stone);

    return withLOD(g);
  }
}

registerMesh(MalakaChiringuito);
