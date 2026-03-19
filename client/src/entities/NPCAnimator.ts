import * as THREE from 'three';

export type AnimationName = 'idle' | 'walk' | 'attack' | 'emote';

/**
 * Simple procedural animation controller for an NPC mesh group.
 * Drives bob, leg oscillation, lunge, and scale-pulse without skeletal data.
 */
export class NPCAnimator {
  private group: THREE.Group;
  private leftLeg: THREE.Object3D | null = null;
  private rightLeg: THREE.Object3D | null = null;
  private baseY: number;
  private phase = 0;
  private currentAnim: AnimationName = 'idle';
  private attackTimer = 0;
  private emoteTimer = 0;

  constructor(group: THREE.Group) {
    this.group = group;
    this.baseY = group.position.y;

    // Try to find leg meshes by name (set during NPC construction)
    this.leftLeg = group.getObjectByName('leftLeg') ?? null;
    this.rightLeg = group.getObjectByName('rightLeg') ?? null;
  }

  /** Update the base Y position (e.g. after the NPC moves to new terrain height). */
  setBaseY(y: number): void {
    this.baseY = y;
  }

  play(animationName: string): void {
    const name = animationName as AnimationName;
    if (name === this.currentAnim) return;
    this.currentAnim = name;
    this.phase = 0;
    this.attackTimer = 0;
    this.emoteTimer = 0;
  }

  update(delta: number): void {
    this.phase += delta;
    if (this.phase > 628) this.phase -= 628;

    switch (this.currentAnim) {
      case 'idle':
        this.animateIdle(delta);
        break;
      case 'walk':
        this.animateWalk(delta);
        break;
      case 'attack':
        this.animateAttack(delta);
        break;
      case 'emote':
        this.animateEmote(delta);
        break;
    }
  }

  // --- Idle: gentle vertical bob ---
  private animateIdle(_delta: number): void {
    this.group.position.y = this.baseY + Math.sin(this.phase * 2) * 0.08;
    // Return legs to rest
    if (this.leftLeg) this.leftLeg.rotation.x *= 0.9;
    if (this.rightLeg) this.rightLeg.rotation.x *= 0.9;
    // Reset scale
    this.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
  }

  // --- Walk: leg oscillation ---
  private animateWalk(_delta: number): void {
    const swing = Math.sin(this.phase * 8) * 0.5;
    if (this.leftLeg) this.leftLeg.rotation.x = swing;
    if (this.rightLeg) this.rightLeg.rotation.x = -swing;
    this.group.position.y = this.baseY;
  }

  // --- Attack: lunge forward briefly then return ---
  private animateAttack(delta: number): void {
    this.attackTimer += delta;
    const duration = 0.4;
    const t = Math.min(this.attackTimer / duration, 1);

    // Quick forward lunge using a sine curve
    const offset = Math.sin(t * Math.PI) * 0.8;
    // Move along the group's forward direction (local Z)
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.group.quaternion);
    this.group.position.x += dir.x * offset * delta * 4;
    this.group.position.z += dir.z * offset * delta * 4;

    if (t >= 1) {
      this.play('idle');
    }
  }

  // --- Emote: scale pulse ---
  private animateEmote(delta: number): void {
    this.emoteTimer += delta;
    const pulse = 1 + Math.sin(this.emoteTimer * 6) * 0.15;
    this.group.scale.set(pulse, pulse, pulse);

    if (this.emoteTimer > 1.5) {
      this.group.scale.set(1, 1, 1);
      this.play('idle');
    }
  }
}
