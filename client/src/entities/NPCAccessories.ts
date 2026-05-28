import * as THREE from 'three';
import { addOutlineShell } from './ModelStyling';
import type { NPCPlaceholderStyle } from './NPCModels';
import {
  NPC_Y_LEG, NPC_Y_TORSO, NPC_Y_ARM, NPC_Y_HEAD,
  NPC_TORSO_TOP, NPC_HEAD_TOP,
} from './NPCAppearance';

// ── Shared reference constants ───────────────────────────────────────────────
// NPC_Y_HEAD  = 1.99   head center
// NPC_HEAD_TOP = 2.25  top of head box
// NPC_TORSO_TOP = 1.73 top of torso box (= bottom of head box)
// NPC_Y_ARM   = 1.40   arm pivot center
// NPC_Y_TORSO = 1.29   torso center

export function addPlaceholderAccessory(mesh: THREE.Group, style: NPCPlaceholderStyle): void {
  switch (style) {

    // ── Dragon ────────────────────────────────────────────────────────────────
    case 'dragon': {
      const dragonGreen = 0x1f4520;
      const boneBlack   = 0x0a1808;

      // Neck connecting head to snout
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.21, 0.30, 0.50, 8),
        npcMat(dragonGreen),
      );
      neck.name = 'neck';
      neck.position.set(0, NPC_HEAD_TOP + 0.05, 0.08);
      neck.rotation.x = -0.18;
      mesh.add(neck);

      const snout = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.20, 0.42), npcMat(0x2d5a24));
      snout.name = 'snout';
      snout.position.set(0, NPC_Y_HEAD + 0.10, 0.38);
      mesh.add(snout);

      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.10, 0.30), npcMat(0x2d5a24));
      jaw.name = 'jaw';
      jaw.position.set(0, NPC_Y_HEAD - 0.08, 0.33);
      mesh.add(jaw);

      // Fire eyes
      const eyeMat = npcMat(0xff8800, 0.1, 0, 0xff4400, 2.2);
      const eyeGeo = new THREE.SphereGeometry(0.055, 8, 6);
      const lEye = new THREE.Mesh(eyeGeo, eyeMat);
      lEye.name = 'leftEye';
      lEye.position.set(-0.12, NPC_Y_HEAD + 0.08, 0.32);
      mesh.add(lEye);
      const rEye = lEye.clone();
      rEye.name = 'rightEye';
      rEye.position.x = 0.12;
      mesh.add(rEye);

      // Horns
      const hornGeo = new THREE.ConeGeometry(0.07, 0.50, 6);
      const hornMat = npcMat(boneBlack);
      const lHorn = new THREE.Mesh(hornGeo, hornMat);
      lHorn.name = 'leftHorn';
      lHorn.position.set(-0.14, NPC_HEAD_TOP + 0.30, -0.05);
      lHorn.rotation.z = -0.28;
      lHorn.rotation.x = -0.12;
      mesh.add(lHorn);
      const rHorn = new THREE.Mesh(hornGeo, hornMat);
      rHorn.name = 'rightHorn';
      rHorn.position.set(0.14, NPC_HEAD_TOP + 0.30, -0.05);
      rHorn.rotation.z = 0.28;
      rHorn.rotation.x = -0.12;
      mesh.add(rHorn);

      // Spine spikes down the back
      const ridgeMat = npcMat(boneBlack);
      const spineData = [
        { y: NPC_HEAD_TOP + 0.02, z: -0.26, s: 0.22 },
        { y: NPC_Y_HEAD - 0.06,  z: -0.27, s: 0.20 },
        { y: NPC_TORSO_TOP - 0.04, z: -0.27, s: 0.18 },
        { y: NPC_Y_TORSO + 0.10, z: -0.26, s: 0.16 },
        { y: NPC_Y_TORSO - 0.20, z: -0.26, s: 0.13 },
      ];
      for (const [i, d] of spineData.entries()) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.038, d.s, 5), ridgeMat);
        spike.name = `spineSpike${i}`;
        spike.position.set(0, d.y, d.z);
        spike.rotation.x = -0.38;
        mesh.add(spike);
      }

      // Tail
      const tailMat = npcMat(dragonGreen);
      const tailData = [
        { rT: 0.17, rB: 0.22, h: 0.52, y: 0.88, z: -0.46, rx: 0.75 },
        { rT: 0.11, rB: 0.17, h: 0.50, y: 0.48, z: -0.90, rx: 1.05 },
        { rT: 0.06, rB: 0.11, h: 0.44, y: 0.18, z: -1.22, rx: 0.65 },
        { rT: 0.02, rB: 0.06, h: 0.34, y: 0.05, z: -1.50, rx: 0.22 },
      ];
      for (const [i, d] of tailData.entries()) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(d.rT, d.rB, d.h, 8), tailMat);
        seg.name = `tail${i}`;
        seg.position.set(0, d.y, d.z);
        seg.rotation.x = d.rx;
        mesh.add(seg);
      }
      const tailSpike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.30, 4), ridgeMat);
      tailSpike.name = 'tailSpike';
      tailSpike.position.set(0, 0.0, -1.65);
      tailSpike.rotation.x = Math.PI * 0.72;
      mesh.add(tailSpike);

      // Wings
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x0c2a0e, side: THREE.DoubleSide, transparent: true, opacity: 0.90, flatShading: true,
      });
      const lwShape = new THREE.Shape();
      lwShape.moveTo(0,0); lwShape.lineTo(-1.5,0.75); lwShape.lineTo(-1.1,0.08);
      lwShape.lineTo(-1.55,-0.38); lwShape.lineTo(-1.05,-0.58);
      lwShape.lineTo(-0.65,-0.82); lwShape.lineTo(-0.1,-0.52); lwShape.lineTo(0,0);
      const lWing = new THREE.Mesh(new THREE.ShapeGeometry(lwShape), wingMat);
      lWing.name = 'leftWing';
      lWing.position.set(-0.50, 1.82, 0);
      lWing.rotation.y = 0.25;
      lWing.rotation.x = 0.12;
      mesh.add(lWing);
      const rwShape = new THREE.Shape();
      rwShape.moveTo(0,0); rwShape.lineTo(1.5,0.75); rwShape.lineTo(1.1,0.08);
      rwShape.lineTo(1.55,-0.38); rwShape.lineTo(1.05,-0.58);
      rwShape.lineTo(0.65,-0.82); rwShape.lineTo(0.1,-0.52); rwShape.lineTo(0,0);
      const rWing = new THREE.Mesh(new THREE.ShapeGeometry(rwShape), wingMat);
      rWing.name = 'rightWing';
      rWing.position.set(0.50, 1.82, 0);
      rWing.rotation.y = -0.25;
      rWing.rotation.x = 0.12;
      mesh.add(rWing);

      // Wing bones
      const wbMat = npcMat(boneBlack);
      const wbData: Array<[number, number]> = [[2.65,1.0],[3.0,0.88],[3.35,0.72]];
      for (const [i, [angle, len]] of wbData.entries()) {
        const bGeo = new THREE.CylinderGeometry(0.018, 0.032, len, 5);
        const lb = new THREE.Mesh(bGeo, wbMat);
        lb.name = `leftWingBone${i}`;
        lb.position.set(-0.50 + Math.cos(angle)*len*0.5, 1.82 + Math.sin(angle)*len*0.5, 0);
        lb.rotation.z = -angle + Math.PI * 0.5;
        mesh.add(lb);
        const rb = new THREE.Mesh(bGeo, wbMat);
        rb.name = `rightWingBone${i}`;
        rb.position.set(0.50 - Math.cos(angle)*len*0.5, 1.82 + Math.sin(angle)*len*0.5, 0);
        rb.rotation.z = angle - Math.PI * 0.5;
        mesh.add(rb);
      }

      // Belly scales
      const bellyMat = npcMat(0x3a6830);
      for (let i = 0; i < 5; i++) {
        const bsGeo = new THREE.SphereGeometry(0.13, 6, 4);
        bsGeo.scale(1.1, 0.28, 1.0);
        const bs = new THREE.Mesh(bsGeo, bellyMat);
        bs.name = `bellyScale${i}`;
        bs.position.set(0, 0.92 + i * 0.20, 0.28);
        mesh.add(bs);
      }

      // Claws
      const clawMat = npcMat(boneBlack);
      for (const side of [-1, 1]) {
        for (let c = 0; c < 3; c++) {
          const claw = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 4), clawMat);
          claw.name = `claw_${side > 0 ? 'r' : 'l'}${c}`;
          claw.position.set(side * (0.14 + c * 0.05), 0.10, 0.08 - c * 0.06);
          claw.rotation.x = -0.6;
          claw.rotation.z = side * c * 0.2;
          mesh.add(claw);
        }
      }
      break;
    }

    // ── Monster ───────────────────────────────────────────────────────────────
    case 'monster': {
      // Head spikes along top of head box
      const spikeMat = npcMat(0x3a3a2d);
      for (let i = 0; i < 4; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 5), spikeMat);
        spike.name = `spike${i}`;
        spike.position.set((i - 1.5) * 0.18, NPC_HEAD_TOP + 0.11 + (i % 2) * 0.05, -0.04);
        spike.rotation.z = i % 2 === 0 ? 0.4 : -0.4;
        mesh.add(spike);
      }
      // Arm claws
      const clawMat = npcMat(0x1e1e1e);
      const lClaw = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.16, 4), clawMat);
      lClaw.name = 'leftClaw';
      lClaw.position.set(-0.16, 0.82, 0.20);
      lClaw.rotation.z = Math.PI * 0.25;
      mesh.add(lClaw);
      const rClaw = lClaw.clone();
      rClaw.name = 'rightClaw';
      rClaw.position.x = 0.16;
      rClaw.rotation.z = -Math.PI * 0.25;
      mesh.add(rClaw);
      // Glowing red eyes
      const eyeMat = npcMat(0xff5533, 0.1, 0, 0xff2211, 1.4);
      const eyeGeo = new THREE.SphereGeometry(0.05, 8, 6);
      const lEye = new THREE.Mesh(eyeGeo, eyeMat);
      lEye.name = 'leftEye';
      lEye.position.set(-0.10, NPC_Y_HEAD + 0.04, 0.28);
      mesh.add(lEye);
      const rEye = lEye.clone();
      rEye.name = 'rightEye';
      rEye.position.x = 0.10;
      mesh.add(rEye);
      break;
    }

    // ── Merchant ──────────────────────────────────────────────────────────────
    case 'merchant': {
      const pack = new THREE.Mesh(
        new THREE.BoxGeometry(0.30, 0.40, 0.25),
        npcMat(0x6b4226),
      );
      pack.name = 'pack';
      pack.position.set(0, NPC_Y_TORSO + 0.06, -0.26);
      pack.castShadow = true;
      mesh.add(pack);
      break;
    }

    // ── Guard ─────────────────────────────────────────────────────────────────
    case 'guard': {
      const shield = new THREE.Mesh(
        new THREE.CircleGeometry(0.25, 8),
        new THREE.MeshStandardMaterial({
          color: 0x888899, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.3, flatShading: true,
        }),
      );
      shield.name = 'shield';
      shield.position.set(-0.52, NPC_Y_ARM, 0.10);
      shield.rotation.y = Math.PI / 2;
      mesh.add(shield);
      break;
    }

    // ── Healer ────────────────────────────────────────────────────────────────
    case 'healer': {
      const halo = new THREE.Mesh(
        new THREE.TorusGeometry(0.22, 0.03, 6, 24),
        npcMat(0xffdd44, 0.3, 0, 0xffdd44, 1.0),
      );
      halo.name = 'halo';
      halo.position.y = NPC_HEAD_TOP + 0.18;
      halo.rotation.x = Math.PI / 2;
      mesh.add(halo);
      break;
    }

    // ── Sage / Mage ───────────────────────────────────────────────────────────
    case 'sage':
    case 'mage': {
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6),
        npcMat(0x8b7355),
      );
      staff.name = 'staff';
      staff.position.set(0.58, NPC_Y_TORSO, 0);
      mesh.add(staff);
      const orbColor = style === 'sage' ? 0xaa66ff : 0x66aaff;
      const orbEmissive = style === 'sage' ? 0x6633aa : 0x224477;
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        npcMat(orbColor, 0.2, 0, orbEmissive, 0.8),
      );
      orb.name = 'orb';
      orb.position.set(0.58, NPC_HEAD_TOP + 0.12, 0);
      mesh.add(orb);
      break;
    }

    // ── Pyromancer ────────────────────────────────────────────────────────────
    case 'pyromancer': {
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6),
        npcMat(0x5a3020),
      );
      staff.name = 'staff';
      staff.position.set(0.56, NPC_Y_TORSO, 0);
      mesh.add(staff);
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, 8, 6),
        npcMat(0xff6600, 0.2, 0, 0xff3300, 1.6),
      );
      orb.name = 'orb';
      orb.position.set(0.56, NPC_HEAD_TOP + 0.12, 0);
      mesh.add(orb);
      break;
    }

    // ── Cryomancer ────────────────────────────────────────────────────────────
    case 'cryomancer': {
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6),
        new THREE.MeshStandardMaterial({ color: 0x88aacc, metalness: 0.4, roughness: 0.3, flatShading: true }),
      );
      staff.name = 'staff';
      staff.position.set(0.56, NPC_Y_TORSO, 0);
      mesh.add(staff);
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.10, 0),
        new THREE.MeshStandardMaterial({
          color: 0xaaddff, emissive: new THREE.Color(0x5599cc), emissiveIntensity: 1.4,
          flatShading: true, metalness: 0.3, roughness: 0.2,
        }),
      );
      orb.name = 'orb';
      orb.position.set(0.56, NPC_HEAD_TOP + 0.12, 0);
      mesh.add(orb);
      const spikeMat = new THREE.MeshStandardMaterial({
        color: 0xcceeff, emissive: new THREE.Color(0x3366aa), emissiveIntensity: 0.6,
        flatShading: true, transparent: true, opacity: 0.85,
      });
      for (let i = 0; i < 5; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.20, 4), spikeMat);
        spike.name = `iceSpike${i}`;
        const angle = (i / 5) * Math.PI * 2;
        spike.position.set(0.56 + Math.cos(angle) * 0.15, NPC_HEAD_TOP + 0.19, Math.sin(angle) * 0.15);
        spike.rotation.z = Math.PI * 0.1;
        mesh.add(spike);
      }
      break;
    }

    // ── Orc ───────────────────────────────────────────────────────────────────
    case 'orc': {
      const tuskMat = npcMat(0xe8d2b0);
      const tuskGeo = new THREE.ConeGeometry(0.03, 0.14, 4);
      const lTusk = new THREE.Mesh(tuskGeo, tuskMat);
      lTusk.name = 'leftTusk';
      lTusk.position.set(-0.09, NPC_Y_HEAD - 0.18, 0.28);
      lTusk.rotation.z = Math.PI * 0.3;
      mesh.add(lTusk);
      const rTusk = lTusk.clone();
      rTusk.name = 'rightTusk';
      rTusk.position.x = 0.09;
      rTusk.rotation.z = -Math.PI * 0.3;
      mesh.add(rTusk);
      break;
    }

    // ── Undead ────────────────────────────────────────────────────────────────
    case 'undead': {
      const bonePale  = 0xc8d0b8;
      const soulGreen = 0x44ffaa;

      // Skull dome sits just above head top
      const dome = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.24, 0.08, 10),
        npcMat(bonePale),
      );
      dome.name = 'skullDome';
      dome.position.set(0, NPC_HEAD_TOP + 0.04, 0);
      mesh.add(dome);

      // Jaw: lower-front of head box
      const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.28), npcMat(bonePale));
      jaw.name = 'jaw';
      jaw.position.set(0, NPC_Y_HEAD - 0.18, 0.26);
      mesh.add(jaw);

      // Teeth
      const toothMat = npcMat(0xdde4cc);
      for (let i = 0; i < 4; i++) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.04), toothMat);
        tooth.name = `tooth${i}`;
        tooth.position.set(-0.09 + i * 0.06, NPC_Y_HEAD - 0.22, 0.30);
        mesh.add(tooth);
      }

      // Green glowing eyes
      const eyeMat = npcMat(soulGreen, 0.05, 0, soulGreen, 2.2);
      const eyeGeo = new THREE.SphereGeometry(0.052, 8, 6);
      const lEye = new THREE.Mesh(eyeGeo, eyeMat);
      lEye.name = 'leftEye';
      lEye.position.set(-0.09, NPC_Y_HEAD + 0.03, 0.25);
      mesh.add(lEye);
      const rEye = lEye.clone();
      rEye.name = 'rightEye';
      rEye.position.x = 0.09;
      mesh.add(rEye);

      // Ribs within torso
      const ribMat = npcMat(bonePale);
      for (let r = 0; r < 4; r++) {
        const ribY = 1.16 + r * 0.12;
        for (const side of [-1, 1]) {
          const rib = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.06), ribMat);
          rib.name = `rib${r}${side > 0 ? 'r' : 'l'}`;
          rib.position.set(side * 0.14, ribY, 0.10);
          rib.rotation.z = side * -0.5;
          rib.rotation.y = side * 0.35;
          mesh.add(rib);
        }
      }

      // Spine knobs down the back
      const knobMat = npcMat(0xb8c0a8);
      for (let k = 0; k < 5; k++) {
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), knobMat);
        knob.name = `spineKnob${k}`;
        knob.position.set(0, 0.94 + k * 0.16, -0.18);
        mesh.add(knob);
      }

      // Soul fire at torso center
      const soul = new THREE.Mesh(
        new THREE.SphereGeometry(0.10, 8, 6),
        npcMat(soulGreen, 0.1, 0, 0x22cc88, 2.0),
      );
      soul.name = 'soulFire';
      soul.position.set(0, NPC_Y_TORSO, 0);
      mesh.add(soul);

      // Wisps orbiting
      const wispMat = new THREE.MeshStandardMaterial({
        color: 0x88ffcc, emissive: new THREE.Color(0x44ffaa), emissiveIntensity: 2.0,
        transparent: true, opacity: 0.65,
      });
      for (const [i, [wx, wy, wz]] of ([[0.36, NPC_HEAD_TOP + 0.02, 0.18], [-0.30, NPC_Y_TORSO + 0.36, 0.12], [0.18, NPC_Y_LEG + 0.44, -0.26]] as [number,number,number][]).entries()) {
        const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), wispMat);
        wisp.name = `wisp${i}`;
        wisp.position.set(wx, wy, wz);
        mesh.add(wisp);
      }

      // Tattered cloak
      const cloakMat = new THREE.MeshStandardMaterial({
        color: 0x1a1e1a, side: THREE.DoubleSide, transparent: true, opacity: 0.82, flatShading: true,
      });
      const cloak = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.95, 1, 5), cloakMat);
      cloak.name = 'cloak';
      cloak.position.set(0, NPC_Y_TORSO, -0.20);
      mesh.add(cloak);
      break;
    }

    // ── Civilian (default) ────────────────────────────────────────────────────
    case 'civilian':
    default: {
      const satchel = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.30, 0.18),
        npcMat(0x6b4a2b),
      );
      satchel.name = 'satchel';
      satchel.position.set(0.18, NPC_Y_TORSO - 0.16, -0.24);
      mesh.add(satchel);
      break;
    }
  }
}

export function addNPCVisualOutline(mesh: THREE.Group, style: NPCPlaceholderStyle): void {
  const outlineNames: readonly string[] = [
    'body', 'head', 'leftLeg', 'rightLeg', 'leftArm', 'rightArm',
    'belt', 'hat', 'cloak',
    'neck', 'snout', 'jaw', 'leftWing', 'rightWing',
    'skullDome', 'soulFire',
    'shield', 'halo', 'staff', 'orb',
    'leftTusk', 'rightTusk',
    'leftEye', 'rightEye',
    'pack', 'satchel',
  ];
  const scale = style === 'dragon' || style === 'monster' ? 1.06 : 1.048;
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

// ── Internal helper ───────────────────────────────────────────────────────────
function npcMat(
  color: number,
  roughness = 0.78,
  metalness = 0,
  emissive?: number,
  emissiveIntensity?: number,
): THREE.MeshStandardMaterial {
  const params: THREE.MeshStandardMaterialParameters = {
    color,
    roughness,
    metalness,
    flatShading: true,
  };
  if (emissive !== undefined && emissive !== 0) {
    params.emissive = new THREE.Color(emissive);
    if (emissiveIntensity !== undefined) params.emissiveIntensity = emissiveIntensity;
  }
  return new THREE.MeshStandardMaterial(params);
}

