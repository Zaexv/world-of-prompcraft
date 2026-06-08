import * as THREE from 'three';
import { Mesh, BuildContext } from '../../core/Mesh';
import { registerMesh, buildMesh } from '../../core/MeshRegistry';
import { getMaterials, withLOD } from './MalakaKit';
import { boxCollider } from '../../../systems/worldbuilder/colliderProxy';
import { createEmberParticles } from '../../props/fireParticles';
import { applyWorldTiling } from '../worldTiled';

export class MalakaChiringuito extends Mesh {
  static readonly type = 'malaka_chiringuito';
  static readonly category = 'building' as const;

  build(ctx: BuildContext): THREE.LOD {
    const { position: pos, scale } = ctx;
    const g = new THREE.Group();
    g.position.copy(pos);
    const mats = getMaterials();

    // Floor is flat ground, no wooden deck plank.
    const groundY = 0;

    // Main bar structure
    const barW = 6 * scale;
    const barD = 3 * scale;
    const barH = 1.2 * scale;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(barW, barH, barD), mats.stone);
    bar.position.set(-2 * scale, groundY + barH / 2, -2 * scale);
    bar.castShadow = true;
    bar.receiveShadow = true;
    g.add(bar);

    const barCounter = new THREE.Mesh(new THREE.BoxGeometry(barW + 0.4 * scale, 0.1 * scale, barD + 0.4 * scale), mats.wood);
    barCounter.position.set(-2 * scale, groundY + barH + 0.05 * scale, -2 * scale);
    g.add(barCounter);

    const barProxy = boxCollider(barW, barH, barD);
    barProxy.position.copy(bar.position);
    g.add(barProxy);

    // Pillars and Roof
    const roofH = 3.5 * scale;
    const pillarGeo = new THREE.BoxGeometry(0.3 * scale, roofH, 0.3 * scale);
    const roofW = 8 * scale;
    const roofD = 6 * scale;
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
    }

    const roofPlane = new THREE.Mesh(new THREE.BoxGeometry(roofW + 1 * scale, 0.2 * scale, roofD + 1 * scale), mats.roof);
    roofPlane.position.set(-2 * scale, groundY + roofH + 0.1 * scale, -2 * scale);
    roofPlane.castShadow = true;
    roofPlane.receiveShadow = true;
    g.add(roofPlane);

    // White chiringuito tables & seats
    const tableMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.1 });
    const dishGeo = new THREE.CylinderGeometry(0.2 * scale, 0.15 * scale, 0.05 * scale, 16);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaccff, transparent: true, opacity: 0.6, roughness: 0.1 });
    const glassGeo = new THREE.CylinderGeometry(0.08 * scale, 0.06 * scale, 0.2 * scale, 8);

    for (let i = 0; i < 3; i++) {
      const tx = 3 * scale;
      const tz = -3 * scale + i * 3 * scale;
      // Table
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.8 * scale, 0.8 * scale, 0.8 * scale, 12), tableMat);
      t.position.set(tx, groundY + 0.4 * scale, tz);
      t.castShadow = true;
      t.receiveShadow = true;
      g.add(t);

      // Dishes & glasses on table
      for (let d = 0; d < 2; d++) {
        const dish = new THREE.Mesh(dishGeo, dishMat);
        const dx = (d === 0 ? 0.3 : -0.3) * scale;
        dish.position.set(tx + dx, groundY + 0.8 * scale + 0.025 * scale, tz);
        g.add(dish);

        const glass = new THREE.Mesh(glassGeo, glassMat);
        glass.position.set(tx + dx, groundY + 0.8 * scale + 0.1 * scale, tz + 0.2 * scale);
        g.add(glass);
      }

      // Seats
      for (let j = 0; j < 4; j++) {
        const a = (j * Math.PI) / 2;
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.3 * scale, 0.4 * scale, 8), tableMat);
        s.position.set(tx + Math.cos(a) * 1.3 * scale, groundY + 0.2 * scale, tz + Math.sin(a) * 1.3 * scale);
        s.castShadow = true;
        s.receiveShadow = true;
        g.add(s);
      }
    }

    // Bar stools
    for (let i = 0; i < 4; i++) {
      const sx = -4 * scale + i * 1.3 * scale;
      const sz = -0.2 * scale;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.3 * scale, 0.6 * scale, 8), tableMat);
      s.position.set(sx, groundY + 0.3 * scale, sz);
      s.castShadow = true;
      g.add(s);
    }

    // Espetero Boat
    const boatGroup = new THREE.Group();
    boatGroup.position.set(-4 * scale, groundY, 3 * scale);
    boatGroup.rotation.y = Math.PI / 6;

    const boatW = 1.5 * scale;
    const boatD = 4 * scale;
    const boatH = 0.8 * scale;
    
    // Detailed boat hull
    const hullMat = mats.wood;
    
    // Bottom
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(boatW - 0.2*scale, 0.1*scale, boatD - 0.4*scale), hullMat);
    bottom.position.y = 0.05 * scale;
    boatGroup.add(bottom);
    
    // Sides
    const sideW = 0.1 * scale;
    const sideGeo = new THREE.BoxGeometry(sideW, boatH, boatD);
    const leftSide = new THREE.Mesh(sideGeo, hullMat);
    leftSide.position.set(-boatW/2 + sideW/2, boatH/2, 0);
    leftSide.rotation.z = -0.2; // flare out
    boatGroup.add(leftSide);
    
    const rightSide = new THREE.Mesh(sideGeo, hullMat);
    rightSide.position.set(boatW/2 - sideW/2, boatH/2, 0);
    rightSide.rotation.z = 0.2; // flare out
    boatGroup.add(rightSide);
    
    // Bow and stern (angled)
    const endGeo = new THREE.BoxGeometry(boatW, boatH, 0.1*scale);
    const bow = new THREE.Mesh(endGeo, hullMat);
    bow.position.set(0, boatH/2, -boatD/2 + 0.05*scale);
    bow.rotation.x = -0.3; // point outward
    boatGroup.add(bow);
    
    const stern = new THREE.Mesh(endGeo, hullMat);
    stern.position.set(0, boatH/2, boatD/2 - 0.05*scale);
    stern.rotation.x = 0.3;
    boatGroup.add(stern);

    // Sand inside boat
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xe3cda4, roughness: 1.0 });
    const sand = new THREE.Mesh(new THREE.BoxGeometry(boatW - 0.3 * scale, 0.2 * scale, boatD - 0.6 * scale), sandMat);
    sand.position.y = boatH - 0.2 * scale; // elevated sand bed
    boatGroup.add(sand);

    // Fire in sand
    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xff4400,
      emissive: new THREE.Color(0xff2200),
      emissiveIntensity: 1.5,
    });
    for (let i = 0; i < 5; i++) {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.15 * scale, 5, 4), fireMat);
      orb.position.set(
        (Math.random() - 0.5) * 0.5 * scale,
        boatH - 0.05 * scale,
        (Math.random() - 0.5) * 1.5 * scale
      );
      orb.userData.noCollision = true;
      boatGroup.add(orb);
    }

    boatGroup.add(createEmberParticles({ scale, count: 20, radius: 0.3, baseY: boatH + 0.1 * scale, rise: 1.5, speed: 1.2, size: 0.1 }));

    // Espetos (skewers with sardines)
    const skewerMat = mats.wood;
    const fishMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8, roughness: 0.4 });
    for (let i = 0; i < 6; i++) {
      const skewer = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * scale, 0.02 * scale, 1.2 * scale), skewerMat);
      stick.rotation.x = Math.PI / 4;
      skewer.add(stick);

      for (let f = 0; f < 3; f++) {
        const fish = new THREE.Mesh(new THREE.SphereGeometry(0.08 * scale, 8, 4), fishMat);
        fish.scale.set(1, 2.5, 0.3);
        fish.rotation.x = Math.PI / 4;
        fish.position.set(0, 0.2 * scale + f * 0.2 * scale, 0.2 * scale + f * 0.2 * scale);
        skewer.add(fish);
      }

      // Stick into sand on alternating sides
      const side = i % 2 === 0 ? 1 : -1;
      skewer.position.set(side * 0.4 * scale, boatH - 0.1 * scale, -1 * scale + i * 0.4 * scale);
      skewer.rotation.z = side * -Math.PI / 6;
      boatGroup.add(skewer);
    }
    
    g.add(boatGroup);
    
    const boatProxy = boxCollider(boatW, boatH + 1 * scale, boatD);
    boatProxy.position.copy(boatGroup.position);
    boatProxy.position.y += boatH / 2;
    boatProxy.rotation.copy(boatGroup.rotation);
    g.add(boatProxy);

    // Palm trees (now separated into MalakaPalmTree)
    const palm1 = buildMesh('malaka_palmtree', { position: new THREE.Vector3(6 * scale, groundY, 4 * scale), scale });
    if (palm1) g.add(palm1);
    
    const palm2 = buildMesh('malaka_palmtree', { position: new THREE.Vector3(-6 * scale, groundY, -4 * scale), scale });
    if (palm2) g.add(palm2);

    applyWorldTiling(g, mats.stone);

    return withLOD(g);
  }
}

registerMesh(MalakaChiringuito);
