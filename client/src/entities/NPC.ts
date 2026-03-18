import * as THREE from 'three';
import { NPCAnimator } from './NPCAnimator';
import { Nameplate } from '../ui/Nameplate';
import { ActionIcon } from '../ui/ActionIcon';

export interface NPCConfig {
  id: string;
  name: string;
  position: THREE.Vector3;
  color?: number;
}

/**
 * An NPC entity with a detailed model, role-based accessories,
 * hover highlight support, and a procedural animator.
 */
export class NPC {
  public readonly id: string;
  public readonly name: string;
  public readonly position: THREE.Vector3;
  public readonly mesh: THREE.Group;
  public readonly animator: NPCAnimator;
  public readonly nameplate: Nameplate;
  public readonly actionIcon: ActionIcon;

  /** Home position — the NPC wanders around this point. */
  public homePosition: THREE.Vector3;
  /** How far from home the NPC will wander. */
  public wanderRadius = 8;

  private wanderTarget: THREE.Vector3 = new THREE.Vector3();
  private hasWanderTarget = false;
  private wanderTimer = 0;
  private wanderCooldown: number;
  private isWandering = false;

  /** Stores original emissive colours so highlights can be toggled. */
  private materials: THREE.MeshStandardMaterial[] = [];

  constructor(config: NPCConfig) {
    this.id = config.id;
    this.name = config.name;
    this.position = config.position.clone();
    this.homePosition = config.position.clone();
    this.wanderCooldown = 3 + Math.random() * 5; // initial random cooldown 3-8s
    this.mesh = new THREE.Group();

    const color = config.color ?? 0xcc6633;

    // ----- Body (taller cylinder to match improved player) -----
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.4, 10);
    const bodyMat = new THREE.MeshStandardMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.5;
    body.castShadow = true;
    this.mesh.add(body);
    this.materials.push(bodyMat);

    // ----- Shoulders (small spheres on each side) -----
    const shoulderGeo = new THREE.SphereGeometry(0.14, 8, 6);
    const shoulderMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.15) });
    const leftShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    leftShoulder.position.set(-0.34, 2.05, 0);
    leftShoulder.castShadow = true;
    this.mesh.add(leftShoulder);

    const rightShoulder = new THREE.Mesh(shoulderGeo, shoulderMat);
    rightShoulder.position.set(0.34, 2.05, 0);
    rightShoulder.castShadow = true;
    this.mesh.add(rightShoulder);
    this.materials.push(shoulderMat);

    // ----- Belt (thin torus around waist) -----
    const beltGeo = new THREE.TorusGeometry(0.33, 0.04, 6, 16);
    const beltMat = new THREE.MeshStandardMaterial({ color: 0x8b6914 });
    const belt = new THREE.Mesh(beltGeo, beltMat);
    belt.position.y = 1.1;
    belt.rotation.x = Math.PI / 2;
    this.mesh.add(belt);

    // ----- Head -----
    const headGeo = new THREE.SphereGeometry(0.25, 12, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf5cba7 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.42;
    head.castShadow = true;
    this.mesh.add(head);
    this.materials.push(headMat);

    // ----- Legs (slightly longer) -----
    const legGeo = new THREE.BoxGeometry(0.16, 0.65, 0.16);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });

    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.13, 0.42, 0);
    leftLeg.name = 'leftLeg';
    leftLeg.castShadow = true;
    this.mesh.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.13, 0.42, 0);
    rightLeg.name = 'rightLeg';
    rightLeg.castShadow = true;
    this.mesh.add(rightLeg);

    this.materials.push(legMat);

    // ----- Hat / cone -----
    const hatGeo = new THREE.ConeGeometry(0.18, 0.35, 8);
    const hatMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.4) });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 2.78;
    hat.castShadow = true;
    this.mesh.add(hat);

    // ----- Role-based accessories -----
    this.addRoleAccessory(color);

    // ----- Floating nameplate -----
    this.nameplate = new Nameplate(this.name);
    this.mesh.add(this.nameplate.sprite);

    // ----- Action status icon (above nameplate) -----
    this.actionIcon = new ActionIcon();
    this.mesh.add(this.actionIcon.sprite);

    // Tag every child mesh so the raycaster can identify this NPC
    this.mesh.traverse((child) => {
      child.userData.npcId = this.id;
      child.userData.npcName = this.name;
    });

    // Position the group
    this.mesh.position.copy(this.position);

    // Animator
    this.animator = new NPCAnimator(this.mesh);
  }

  /** Call every frame. */
  update(delta: number): void {
    this.animator.update(delta);
    this.actionIcon.update(delta);
  }

  /** Trigger an emote/animation on this NPC. */
  playEmote(emote: string): void {
    const mapped = emote === 'attack' ? 'attack' : 'emote';
    this.animator.play(mapped);
    this.actionIcon.show(emote, 2.5);
  }

  /** Show an action icon above this NPC (e.g. when performing a tool action). */
  showAction(actionKind: string, duration = 3.0): void {
    this.actionIcon.show(actionKind, duration);
  }

  /** Toggle hover/highlight by adding emissive colour. */
  setHighlight(on: boolean): void {
    const emissive = on ? 0x444444 : 0x000000;
    for (const mat of this.materials) {
      mat.emissive.setHex(emissive);
    }
  }

  /**
   * Update wandering AI — call every frame with delta and a terrain height callback.
   */
  updateWander(delta: number, getHeightAt: (x: number, z: number) => number): void {
    // Decrement cooldown
    if (!this.isWandering) {
      this.wanderCooldown -= delta;
      if (this.wanderCooldown <= 0) {
        // Pick a random point within wanderRadius of homePosition
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.random() * this.wanderRadius;
        const tx = this.homePosition.x + Math.cos(angle) * dist;
        const tz = this.homePosition.z + Math.sin(angle) * dist;
        this.wanderTarget.set(tx, getHeightAt(tx, tz), tz);
        this.hasWanderTarget = true;
        this.isWandering = true;
        this.animator.play('walk');
      }
      return;
    }

    // Move toward wander target
    if (this.hasWanderTarget) {
      const dx = this.wanderTarget.x - this.mesh.position.x;
      const dz = this.wanderTarget.z - this.mesh.position.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < 0.25) {
        // Reached target
        this.isWandering = false;
        this.hasWanderTarget = false;
        this.wanderCooldown = 3 + Math.random() * 5;
        this.animator.play('idle');
        return;
      }

      const dist = Math.sqrt(distSq);
      const speed = 2; // units per second
      const step = Math.min(speed * delta, dist);
      const nx = dx / dist;
      const nz = dz / dist;

      this.mesh.position.x += nx * step;
      this.mesh.position.z += nz * step;
      this.mesh.position.y = getHeightAt(this.mesh.position.x, this.mesh.position.z);

      // Update logical position to match mesh
      this.position.copy(this.mesh.position);

      // Face walking direction (smooth rotation)
      const targetAngle = Math.atan2(nx, nz);
      let angleDiff = targetAngle - this.mesh.rotation.y;
      // Normalize angle difference to [-PI, PI] without while loops
      angleDiff = ((angleDiff + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      this.mesh.rotation.y += angleDiff * Math.min(1, 8 * delta);

      // Update animator baseY so idle bob works at new height
      this.animator['baseY'] = this.mesh.position.y;
    }
  }

  /**
   * Add role-specific accessories based on the NPC colour.
   */
  private addRoleAccessory(color: number): void {
    const r = (color >> 16) & 0xff;
    const g = (color >> 8) & 0xff;
    const b = color & 0xff;

    if (r > 180 && g < 80 && b < 80) {
      // --- Red NPC (dragon): small wing-like shapes on back ---
      const wingGeo = new THREE.PlaneGeometry(0.5, 0.6, 1, 1);
      const wingMat = new THREE.MeshStandardMaterial({
        color: 0x881111,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.8,
      });

      const leftWing = new THREE.Mesh(wingGeo, wingMat);
      leftWing.position.set(-0.35, 1.9, -0.2);
      leftWing.rotation.y = -0.5;
      leftWing.rotation.z = 0.3;
      this.mesh.add(leftWing);

      const rightWing = new THREE.Mesh(wingGeo, wingMat);
      rightWing.position.set(0.35, 1.9, -0.2);
      rightWing.rotation.y = 0.5;
      rightWing.rotation.z = -0.3;
      this.mesh.add(rightWing);
    } else if (g > 140 && r < 120 && b < 120) {
      // --- Green NPC (merchant): backpack ---
      const packGeo = new THREE.BoxGeometry(0.3, 0.4, 0.25);
      const packMat = new THREE.MeshStandardMaterial({ color: 0x6b4226 });
      const pack = new THREE.Mesh(packGeo, packMat);
      pack.position.set(0, 1.65, -0.32);
      pack.castShadow = true;
      this.mesh.add(pack);
    } else if (r > 100 && b > 100 && g < 80) {
      // --- Purple NPC (sage): staff held to the side ---
      const staffGeo = new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6);
      const staffMat = new THREE.MeshStandardMaterial({ color: 0x8b7355 });
      const staff = new THREE.Mesh(staffGeo, staffMat);
      staff.position.set(0.5, 1.3, 0);
      this.mesh.add(staff);

      // Staff orb on top
      const orbGeo = new THREE.SphereGeometry(0.08, 8, 6);
      const orbMat = new THREE.MeshStandardMaterial({
        color: 0xaa66ff,
        emissive: 0x6633aa,
        emissiveIntensity: 0.8,
      });
      const orb = new THREE.Mesh(orbGeo, orbMat);
      orb.position.set(0.5, 2.45, 0);
      this.mesh.add(orb);
    } else if (r < 140 && g < 140 && b < 140 && Math.abs(r - g) < 30 && Math.abs(g - b) < 30) {
      // --- Gray NPC (guard): shield on one arm ---
      const shieldGeo = new THREE.CircleGeometry(0.25, 8);
      const shieldMat = new THREE.MeshStandardMaterial({
        color: 0x888899,
        side: THREE.DoubleSide,
        metalness: 0.6,
        roughness: 0.3,
      });
      const shield = new THREE.Mesh(shieldGeo, shieldMat);
      shield.position.set(-0.45, 1.4, 0.1);
      shield.rotation.y = Math.PI / 2;
      this.mesh.add(shield);
    } else if (r > 180 && g > 180 && b < 100) {
      // --- Yellow NPC (healer): halo above head ---
      const haloGeo = new THREE.TorusGeometry(0.22, 0.03, 6, 24);
      const haloMat = new THREE.MeshStandardMaterial({
        color: 0xffdd44,
        emissive: 0xffdd44,
        emissiveIntensity: 1.0,
      });
      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = 2.85;
      halo.rotation.x = Math.PI / 2;
      this.mesh.add(halo);
    }
  }
}

/** Darken a hex colour by a factor (0-1). */
function darken(hex: number, amount: number): number {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return c.getHex();
}
