import * as THREE from 'three';
import { addOutlineShell } from './ModelStyling';
import type { NPCPlaceholderStyle } from './NPCModels';

export function addPlaceholderAccessory(mesh: THREE.Group, style: NPCPlaceholderStyle): void {
  switch (style) {
    case 'dragon': {
      const dragonGreen = 0x1f4520;
      const darkGreen   = 0x0e2010;
      const boneBlack   = 0x0a1808;

      const neckGeo = new THREE.CylinderGeometry(0.21, 0.3, 0.55, 8);
      const neckMat = new THREE.MeshStandardMaterial({ color: dragonGreen, flatShading: true });
      const neck = new THREE.Mesh(neckGeo, neckMat);
      neck.name = 'neck';
      neck.position.set(0, 2.48, 0.06);
      neck.rotation.x = -0.18;
      mesh.add(neck);

      const snoutGeo = new THREE.BoxGeometry(0.3, 0.2, 0.42);
      const snoutMat = new THREE.MeshStandardMaterial({ color: 0x2d5a24, flatShading: true });
      const snout = new THREE.Mesh(snoutGeo, snoutMat);
      snout.name = 'snout';
      snout.position.set(0, 2.64, 0.34);
      mesh.add(snout);

      const jawGeo = new THREE.BoxGeometry(0.26, 0.1, 0.3);
      const jaw = new THREE.Mesh(jawGeo, snoutMat);
      jaw.name = 'jaw';
      jaw.position.set(0, 2.52, 0.3);
      mesh.add(jaw);

      const eyeGeo = new THREE.SphereGeometry(0.055, 8, 6);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xff8800, emissive: 0xff4400, emissiveIntensity: 2.2, flatShading: true,
      });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.name = 'leftEye';
      leftEye.position.set(-0.1, 2.73, 0.24);
      mesh.add(leftEye);
      const rightEye = leftEye.clone();
      rightEye.name = 'rightEye';
      rightEye.position.set(0.1, 2.73, 0.24);
      mesh.add(rightEye);

      const hornGeo = new THREE.ConeGeometry(0.07, 0.5, 6);
      const hornMat = new THREE.MeshStandardMaterial({ color: boneBlack, flatShading: true });
      const leftHorn = new THREE.Mesh(hornGeo, hornMat);
      leftHorn.name = 'leftHorn';
      leftHorn.position.set(-0.13, 3.04, -0.06);
      leftHorn.rotation.z = -0.28;
      leftHorn.rotation.x = -0.12;
      mesh.add(leftHorn);
      const rightHorn = new THREE.Mesh(hornGeo, hornMat);
      rightHorn.name = 'rightHorn';
      rightHorn.position.set(0.13, 3.04, -0.06);
      rightHorn.rotation.z = 0.28;
      rightHorn.rotation.x = -0.12;
      mesh.add(rightHorn);

      const ridgeMat = new THREE.MeshStandardMaterial({ color: boneBlack, flatShading: true });
      const spineData = [
        { y: 2.55, z: -0.25, s: 0.22 },
        { y: 2.32, z: -0.26, s: 0.2  },
        { y: 2.08, z: -0.27, s: 0.18 },
        { y: 1.82, z: -0.27, s: 0.16 },
        { y: 1.55, z: -0.26, s: 0.13 },
      ];
      for (const [i, d] of spineData.entries()) {
        const sGeo = new THREE.ConeGeometry(0.038, d.s, 5);
        const spike = new THREE.Mesh(sGeo, ridgeMat);
        spike.name = `spineSpike${i}`;
        spike.position.set(0, d.y, d.z);
        spike.rotation.x = -0.38;
        mesh.add(spike);
      }

      const tailMat = new THREE.MeshStandardMaterial({ color: dragonGreen, flatShading: true });
      const tailData = [
        { rT: 0.17, rB: 0.22, h: 0.52, y: 0.92, z: -0.46, rx: 0.75 },
        { rT: 0.11, rB: 0.17, h: 0.5,  y: 0.5,  z: -0.9,  rx: 1.05 },
        { rT: 0.06, rB: 0.11, h: 0.44, y: 0.19, z: -1.22, rx: 0.65 },
        { rT: 0.02, rB: 0.06, h: 0.34, y: 0.06, z: -1.5,  rx: 0.22 },
      ];
      for (const [i, d] of tailData.entries()) {
        const tGeo = new THREE.CylinderGeometry(d.rT, d.rB, d.h, 8);
        const seg = new THREE.Mesh(tGeo, tailMat);
        seg.name = `tail${i}`;
        seg.position.set(0, d.y, d.z);
        seg.rotation.x = d.rx;
        mesh.add(seg);
      }
      const tailSpikeGeo = new THREE.ConeGeometry(0.04, 0.3, 4);
      const tailSpike = new THREE.Mesh(tailSpikeGeo, ridgeMat);
      tailSpike.name = 'tailSpike';
      tailSpike.position.set(0, 0.0, -1.65);
      tailSpike.rotation.x = Math.PI * 0.72;
      mesh.add(tailSpike);

      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x0c2a0e, side: THREE.DoubleSide, transparent: true, opacity: 0.9, flatShading: true,
      });
      const lwShape = new THREE.Shape();
      lwShape.moveTo(0, 0);
      lwShape.lineTo(-1.5, 0.75);
      lwShape.lineTo(-1.1, 0.08);
      lwShape.lineTo(-1.55, -0.38);
      lwShape.lineTo(-1.05, -0.58);
      lwShape.lineTo(-0.65, -0.82);
      lwShape.lineTo(-0.1, -0.52);
      lwShape.lineTo(0, 0);
      const lwGeo = new THREE.ShapeGeometry(lwShape);
      const leftWing = new THREE.Mesh(lwGeo, wingMat);
      leftWing.name = 'leftWing';
      leftWing.position.set(-0.42, 2.2, 0.0);
      leftWing.rotation.y = 0.25;
      leftWing.rotation.x = 0.12;
      mesh.add(leftWing);

      const rwShape = new THREE.Shape();
      rwShape.moveTo(0, 0);
      rwShape.lineTo(1.5, 0.75);
      rwShape.lineTo(1.1, 0.08);
      rwShape.lineTo(1.55, -0.38);
      rwShape.lineTo(1.05, -0.58);
      rwShape.lineTo(0.65, -0.82);
      rwShape.lineTo(0.1, -0.52);
      rwShape.lineTo(0, 0);
      const rwGeo = new THREE.ShapeGeometry(rwShape);
      const rightWing = new THREE.Mesh(rwGeo, wingMat);
      rightWing.name = 'rightWing';
      rightWing.position.set(0.42, 2.2, 0.0);
      rightWing.rotation.y = -0.25;
      rightWing.rotation.x = 0.12;
      mesh.add(rightWing);

      const wbMat = new THREE.MeshStandardMaterial({ color: boneBlack, flatShading: true });
      const wbData: Array<[number, number]> = [
        [2.65, 1.0], [3.0, 0.88], [3.35, 0.72],
      ];
      for (const [i, [angle, len]] of wbData.entries()) {
        const bGeo = new THREE.CylinderGeometry(0.018, 0.032, len, 5);
        const lb = new THREE.Mesh(bGeo, wbMat);
        lb.name = `leftWingBone${i}`;
        lb.position.set(-0.42 + Math.cos(angle) * len * 0.5, 2.2 + Math.sin(angle) * len * 0.5, 0.0);
        lb.rotation.z = -angle + Math.PI * 0.5;
        mesh.add(lb);
        const rb = new THREE.Mesh(bGeo, wbMat);
        rb.name = `rightWingBone${i}`;
        rb.position.set(0.42 - Math.cos(angle) * len * 0.5, 2.2 + Math.sin(angle) * len * 0.5, 0.0);
        rb.rotation.z = angle - Math.PI * 0.5;
        mesh.add(rb);
      }

      const bellyMat = new THREE.MeshStandardMaterial({ color: 0x3a6830, flatShading: true });
      for (let i = 0; i < 5; i++) {
        const bsGeo = new THREE.SphereGeometry(0.13, 6, 4);
        bsGeo.scale(1.1, 0.28, 1.0);
        const bs = new THREE.Mesh(bsGeo, bellyMat);
        bs.name = `bellyScale${i}`;
        bs.position.set(0, 1.1 + i * 0.28, 0.4);
        mesh.add(bs);
      }

      const clawMat = new THREE.MeshStandardMaterial({ color: boneBlack, flatShading: true });
      for (const side of [-1, 1]) {
        for (let c = 0; c < 3; c++) {
          const cGeo = new THREE.ConeGeometry(0.025, 0.12, 4);
          const claw = new THREE.Mesh(cGeo, clawMat);
          claw.name = `claw_${side > 0 ? 'r' : 'l'}${c}`;
          claw.position.set(side * (0.14 + c * 0.05), 0.1, 0.08 - c * 0.06);
          claw.rotation.x = -0.6;
          claw.rotation.z = side * c * 0.2;
          mesh.add(claw);
        }
      }

      void darkGreen;
      break;
    }
    case 'monster': {
      const spikeGeo = new THREE.ConeGeometry(0.08, 0.22, 5);
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x3a3a2d, flatShading: true });
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        spike.name = `spike${i}`;
        spike.position.set((i - 1.5) * 0.18, 2.02 + (i % 2) * 0.05, -0.1);
        spike.rotation.z = i % 2 === 0 ? 0.5 : -0.5;
        mesh.add(spike);
      }
      const clawGeo = new THREE.ConeGeometry(0.03, 0.16, 4);
      const clawMat = new THREE.MeshStandardMaterial({ color: 0x1e1e1e, flatShading: true });
      const leftClaw = new THREE.Mesh(clawGeo, clawMat);
      leftClaw.name = 'leftClaw';
      leftClaw.position.set(-0.12, 0.95, 0.18);
      leftClaw.rotation.z = Math.PI * 0.25;
      mesh.add(leftClaw);
      const rightClaw = leftClaw.clone();
      rightClaw.name = 'rightClaw';
      rightClaw.position.x = 0.12;
      rightClaw.rotation.z = -Math.PI * 0.25;
      mesh.add(rightClaw);
      const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: 0xff5533, emissive: 0xff2211, emissiveIntensity: 1.4, flatShading: true,
      });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.name = 'leftEye';
      leftEye.position.set(-0.08, 2.36, 0.16);
      mesh.add(leftEye);
      const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
      rightEye.name = 'rightEye';
      rightEye.position.set(0.08, 2.36, 0.16);
      mesh.add(rightEye);
      break;
    }
    case 'merchant': {
      const packGeo = new THREE.BoxGeometry(0.3, 0.4, 0.25);
      const packMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, flatShading: true });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.name = 'pack';
      pack.position.set(0, 1.65, -0.32);
      pack.castShadow = true;
      mesh.add(pack);
      break;
    }
    case 'guard': {
      const shieldGeo = new THREE.CircleGeometry(0.25, 8);
      const shieldMat = new THREE.MeshStandardMaterial({
        color: 0x888899, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.3, flatShading: true,
      });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.name = 'shield';
      shield.position.set(-0.45, 1.4, 0.1);
      shield.rotation.y = Math.PI / 2;
      mesh.add(shield);
      break;
    }
    case 'healer': {
      const haloGeo = new THREE.TorusGeometry(0.22, 0.03, 6, 24);
      const haloMat = new THREE.MeshStandardMaterial({
        color: 0xffdd44, emissive: 0xffdd44, emissiveIntensity: 1.0, flatShading: true,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.name = 'halo';
      halo.position.y = 2.85;
      halo.rotation.x = Math.PI / 2;
      mesh.add(halo);
      break;
    }
    case 'sage':
    case 'mage': {
      const staffGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6);
      const staffMat = new THREE.MeshStandardMaterial({ color: 0x8b7355, flatShading: true });
      const staff = new THREE.Mesh(staffGeo, staffMat);
      staff.name = 'staff';
      staff.position.set(0.5, 1.3, 0);
      mesh.add(staff);
      const orbGeo = new THREE.SphereGeometry(0.08, 8, 6);
      const orbMat = new THREE.MeshStandardMaterial({
        color: style === 'sage' ? 0xaa66ff : 0x66aaff,
        emissive: style === 'sage' ? 0x6633aa : 0x224477,
        emissiveIntensity: 0.8, flatShading: true,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.name = 'orb';
      orb.position.set(0.5, 2.45, 0);
      mesh.add(orb);
      break;
    }
    case 'pyromancer': {
      const staffGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6);
      const staffMat = new THREE.MeshStandardMaterial({ color: 0x5a3020, flatShading: true });
      const staff = new THREE.Mesh(staffGeo, staffMat);
      staff.name = 'staff';
      staff.position.set(0.5, 1.3, 0);
      mesh.add(staff);
      const orbGeo = new THREE.SphereGeometry(0.1, 8, 6);
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0xff6600, emissive: 0xff3300, emissiveIntensity: 1.6, flatShading: true,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.name = 'orb';
      orb.position.set(0.5, 2.45, 0);
      mesh.add(orb);
      const sparkGeo = new THREE.TetrahedronGeometry(0.05, 0);
      const sparkMat = new THREE.MeshStandardMaterial({
        color: 0xffaa00, emissive: 0xff6600, emissiveIntensity: 1.2, flatShading: true,
      });
      for (let i = 0; i < 3; i++) {
        const spark = new THREE.Mesh(sparkGeo, sparkMat);
        spark.name = `spark${i}`;
        const angle = (i / 3) * Math.PI * 2;
        spark.position.set(0.5 + Math.cos(angle) * 0.12, 2.45 + Math.sin(angle) * 0.1, Math.sin(angle) * 0.12);
        mesh.add(spark);
      }
      break;
    }
    case 'cryomancer': {
      const staffGeo = new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6);
      const staffMat = new THREE.MeshStandardMaterial({ color: 0x88aacc, flatShading: true, metalness: 0.4, roughness: 0.3 });
      const staff = new THREE.Mesh(staffGeo, staffMat);
      staff.name = 'staff';
      staff.position.set(0.5, 1.3, 0);
      mesh.add(staff);
      const orbGeo = new THREE.OctahedronGeometry(0.1, 0);
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0xaaddff, emissive: 0x5599cc, emissiveIntensity: 1.4,
        flatShading: true, metalness: 0.3, roughness: 0.2,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.name = 'orb';
      orb.position.set(0.5, 2.45, 0);
      mesh.add(orb);
      const spikeGeo = new THREE.ConeGeometry(0.04, 0.2, 4);
      const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xcceeff, emissive: 0x3366aa, emissiveIntensity: 0.6,
        flatShading: true, transparent: true, opacity: 0.85,
      });
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(spikeGeo, spikeMat);
        spike.name = `iceSpike${i}`;
        const angle = (i / 5) * Math.PI * 2;
        spike.position.set(Math.cos(angle) * 0.15, 2.55, Math.sin(angle) * 0.15);
        spike.rotation.z = Math.PI * 0.1;
        mesh.add(spike);
      }
      break;
    }
    case 'orc': {
      const tuskGeo = new THREE.ConeGeometry(0.03, 0.14, 4);
      const tuskMat = new THREE.MeshStandardMaterial({ color: 0xe8d2b0, flatShading: true });
      const leftTusk = new THREE.Mesh(tuskGeo, tuskMat);
      leftTusk.name = 'leftTusk';
      leftTusk.position.set(-0.09, 2.08, 0.16);
      leftTusk.rotation.z = Math.PI * 0.3;
      mesh.add(leftTusk);
      const rightTusk = leftTusk.clone();
      rightTusk.name = 'rightTusk';
      rightTusk.position.x = 0.09;
      rightTusk.rotation.z = -Math.PI * 0.3;
      mesh.add(rightTusk);
      break;
    }
    case 'undead': {
      const bonePale  = 0xc8d0b8;
      const boneWhite = 0xdde4cc;
      const soulGreen = 0x44ffaa;

      const domeGeo = new THREE.CylinderGeometry(0.22, 0.24, 0.08, 10);
      const domeMat = new THREE.MeshStandardMaterial({ color: bonePale, flatShading: true });
      const dome = new THREE.Mesh(domeGeo, domeMat);
      dome.name = 'skullDome';
      dome.position.set(0, 2.72, 0);
      mesh.add(dome);

      const jawGeo = new THREE.BoxGeometry(0.3, 0.12, 0.28);
      const jaw = new THREE.Mesh(jawGeo, domeMat);
      jaw.name = 'jaw';
      jaw.position.set(0, 2.3, 0.1);
      mesh.add(jaw);

      const toothMat = new THREE.MeshStandardMaterial({ color: boneWhite, flatShading: true });
      for (let i = 0; i < 4; i++) {
        const tGeo = new THREE.BoxGeometry(0.05, 0.07, 0.04);
        const tooth = new THREE.Mesh(tGeo, toothMat);
        tooth.name = `tooth${i}`;
        tooth.position.set(-0.09 + i * 0.06, 2.25, 0.23);
        mesh.add(tooth);
      }

      const eyeGeo = new THREE.SphereGeometry(0.055, 8, 6);
      const eyeMat = new THREE.MeshStandardMaterial({
        color: soulGreen, emissive: soulGreen, emissiveIntensity: 2.2, flatShading: true,
      });
      const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
      leftEye.name = 'leftEye';
      leftEye.position.set(-0.08, 2.5, 0.18);
      mesh.add(leftEye);
      const rightEye = leftEye.clone();
      rightEye.name = 'rightEye';
      rightEye.position.set(0.08, 2.5, 0.18);
      mesh.add(rightEye);

      const ribMat = new THREE.MeshStandardMaterial({ color: bonePale, flatShading: true });
      for (let r = 0; r < 4; r++) {
        const ribY = 1.9 + r * 0.17;
        for (const side of [-1, 1]) {
          const rGeo = new THREE.BoxGeometry(0.26, 0.04, 0.06);
          const rib = new THREE.Mesh(rGeo, ribMat);
          rib.name = `rib${r}${side > 0 ? 'r' : 'l'}`;
          rib.position.set(side * 0.15, ribY, 0.1);
          rib.rotation.z = side * -0.5;
          rib.rotation.y = side * 0.35;
          mesh.add(rib);
        }
      }

      const knobMat = new THREE.MeshStandardMaterial({ color: 0xb8c0a8, flatShading: true });
      for (let k = 0; k < 5; k++) {
        const kGeo = new THREE.SphereGeometry(0.04, 6, 4);
        const knob = new THREE.Mesh(kGeo, knobMat);
        knob.name = `spineKnob${k}`;
        knob.position.set(0, 1.1 + k * 0.25, -0.22);
        mesh.add(knob);
      }

      const soulGeo = new THREE.SphereGeometry(0.1, 8, 6);
      const soulMat = new THREE.MeshStandardMaterial({
        color: soulGreen, emissive: 0x22cc88, emissiveIntensity: 2.0, transparent: true, opacity: 0.7,
      });
      const soul = new THREE.Mesh(soulGeo, soulMat);
      soul.name = 'soulFire';
      soul.position.set(0, 1.82, 0);
      mesh.add(soul);

      const wispMat = new THREE.MeshStandardMaterial({
        color: 0x88ffcc, emissive: 0x44ffaa, emissiveIntensity: 2.0, transparent: true, opacity: 0.65,
      });
      const wispPositions: Array<[number, number, number]> = [
        [ 0.38, 2.7,  0.18], [-0.32, 2.1,  0.12], [ 0.2,  1.4, -0.28],
      ];
      for (const [i, [wx, wy, wz]] of wispPositions.entries()) {
        const wGeo = new THREE.SphereGeometry(0.05, 6, 4);
        const wisp = new THREE.Mesh(wGeo, wispMat);
        wisp.name = `wisp${i}`;
        wisp.position.set(wx, wy, wz);
        mesh.add(wisp);
      }

      const cloakMat = new THREE.MeshStandardMaterial({
        color: 0x1a1e1a, side: THREE.DoubleSide, transparent: true, opacity: 0.82, flatShading: true,
      });
      const cloakGeo = new THREE.PlaneGeometry(0.64, 1.45, 1, 5);
      const cloak = new THREE.Mesh(cloakGeo, cloakMat);
      cloak.name = 'cloak';
      cloak.position.set(0, 1.45, -0.25);
      mesh.add(cloak);

      const cloakInnerMat = new THREE.MeshStandardMaterial({
        color: 0x2a3a2a, side: THREE.DoubleSide, transparent: true, opacity: 0.6, flatShading: true,
      });
      const cloakInnerGeo = new THREE.PlaneGeometry(0.44, 1.2, 1, 4);
      const cloakInner = new THREE.Mesh(cloakInnerGeo, cloakInnerMat);
      cloakInner.name = 'cloakInner';
      cloakInner.position.set(0, 1.5, -0.22);
      cloakInner.rotation.y = 0.05;
      mesh.add(cloakInner);
      break;
    }
    case 'civilian':
    default: {
      const satchelGeo = new THREE.BoxGeometry(0.25, 0.3, 0.18);
      const satchelMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, flatShading: true });
      const satchel = new THREE.Mesh(satchelGeo, satchelMat);
      satchel.name = 'satchel';
      satchel.position.set(0.18, 1.3, -0.26);
      mesh.add(satchel);
      break;
    }
  }
}

export function addNPCVisualOutline(mesh: THREE.Group, style: NPCPlaceholderStyle): void {
  const outlineNames: readonly string[] = [
    'body', 'head', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm',
    'belt', 'hat', 'cloak', 'cloakInner',
    'leftShoulder', 'rightShoulder',
    'neck', 'snout', 'jaw', 'leftWing', 'rightWing',
    'skullDome', 'soulFire',
    'shield', 'halo', 'staff', 'orb',
    'leftTusk', 'rightTusk',
    'leftEye', 'rightEye',
    'pack', 'satchel',
  ];
  const scale = style === 'dragon' || style === 'monster' ? 1.06 : 1.045;
  addOutlineShell(mesh, {
    includeNames: outlineNames,
    scale,
    opacity: style === 'undead' ? 0.98 : 1,
  });
}

export function applyFlatShading(mesh: THREE.Group): void {
  mesh.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.flatShading = true;
          material.needsUpdate = true;
        }
      }
    }
  });
}
