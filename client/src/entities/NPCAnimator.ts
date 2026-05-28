import * as THREE from 'three';
import { GLTF_CLIP_MAP } from './NPCModels';
import type { NPCMotionProfile } from './NPCMotion';

export type AnimationName = 'idle' | 'walk' | 'attack' | 'emote';

/**
 * Animation controller for an NPC.
 * Runs procedural bone-free animations by default.
 * Call setMixer() after GLTF load to switch to skeletal AnimationMixer mode.
 */
export class NPCAnimator {
  private group: THREE.Group;
  private profile: NPCMotionProfile;
  private leftLeg: THREE.Object3D | null = null;
  private rightLeg: THREE.Object3D | null = null;
  private leftArm: THREE.Object3D | null = null;
  private rightArm: THREE.Object3D | null = null;
  private cloak: THREE.Object3D | null = null;
  private cloakLean = 0;
  private baseY: number;
  private phase = 0;
  private currentAnim: AnimationName = 'idle';
  private attackTimer = 0;
  private emoteTimer = 0;
  private attackOrigin: THREE.Vector3 = new THREE.Vector3();
  private attackDirection: THREE.Vector3 = new THREE.Vector3(0, 0, 1);

  // GLTF mode — set via setMixer()
  private mixer: THREE.AnimationMixer | null = null;
  private clips: Map<string, THREE.AnimationClip> = new Map();

  constructor(group: THREE.Group, profile: NPCMotionProfile) {
    this.group = group;
    this.profile = profile;
    this.baseY = group.position.y;

    this.leftLeg = group.getObjectByName('leftLeg') ?? null;
    this.rightLeg = group.getObjectByName('rightLeg') ?? null;
    this.leftArm = group.getObjectByName('leftArm') ?? null;
    this.rightArm = group.getObjectByName('rightArm') ?? null;
    this.cloak = group.getObjectByName('cloak') ?? null;
  }

  /**
   * Switch to GLTF skeletal animation mode.
   * Plays the idle clip immediately if one is found.
   */
  setMixer(mixer: THREE.AnimationMixer, animations: THREE.AnimationClip[]): void {
    this.mixer = mixer;
    this.clips.clear();
    for (const clip of animations) {
      this.clips.set(clip.name, clip);
    }
    this.mixer.timeScale = this.profile.animationRate;
    this.playGLTFClip('idle');
  }

  setProfile(profile: NPCMotionProfile): void {
    this.profile = profile;
    if (this.mixer) {
      this.mixer.timeScale = this.profile.animationRate;
    }
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
    if (name === 'attack') {
      this.attackOrigin.copy(this.group.position);
      this.attackDirection.set(0, 0, 1).applyQuaternion(this.group.quaternion).normalize();
    }
    if (this.mixer) {
      this.playGLTFClip(name);
    }
  }

  update(delta: number): void {
    if (this.mixer) {
      this.mixer.timeScale = this.profile.animationRate;
      this.mixer.update(delta);
      return;
    }

    this.phase += delta * this.profile.walkCycleSpeed;
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

  private playGLTFClip(name: AnimationName): void {
    if (!this.mixer) return;
    const clipName = GLTF_CLIP_MAP[name] ?? name;
    const clip = this.clips.get(clipName) ?? this.clips.values().next().value;
    if (!clip) return;
    this.mixer.stopAllAction();
    this.mixer.clipAction(clip).reset().fadeIn(0.2).play();
  }

  // --- Idle: gentle vertical bob ---
  private animateIdle(delta: number): void {
    this.group.position.y = this.baseY + Math.sin(this.phase * this.profile.idleBobSpeed) * this.profile.idleBobAmplitude;
    this.group.rotation.z = Math.sin(this.phase * this.profile.swaySpeed) * this.profile.swayAmplitude;
    // Return limbs to rest
    if (this.leftLeg) this.leftLeg.rotation.x *= 0.9;
    if (this.rightLeg) this.rightLeg.rotation.x *= 0.9;
    if (this.leftArm) {
      this.leftArm.rotation.x *= 0.9;
      this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, -0.04, Math.min(1, delta * 4));
    }
    if (this.rightArm) {
      this.rightArm.rotation.x *= 0.9;
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, 0.04, Math.min(1, delta * 4));
    }
    // Cloak settles to rest
    this.cloakLean = lerp(this.cloakLean, 0, Math.min(1, delta * 3));
    if (this.cloak) this.cloak.rotation.x = this.cloakLean;
    // Reset scale
    this.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
  }

  // --- Walk: leg + arm oscillation, cloak trails behind ---
  private animateWalk(delta: number): void {
    const swing = Math.sin(this.phase) * 0.5;
    if (this.leftLeg) this.leftLeg.rotation.x = swing;
    if (this.rightLeg) this.rightLeg.rotation.x = -swing;
    if (this.leftArm) {
      this.leftArm.rotation.x = -swing * 0.55;
      this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, -0.08, Math.min(1, delta * 4));
    }
    if (this.rightArm) {
      this.rightArm.rotation.x = swing * 0.55;
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, 0.08, Math.min(1, delta * 4));
    }
    this.cloakLean = lerp(this.cloakLean, 0.30, Math.min(1, delta * 3.5));
    if (this.cloak) {
      const flutter = Math.sin(this.phase * 1.3) * 0.06;
      this.cloak.rotation.x = this.cloakLean + flutter;
    }
    this.group.position.y = this.baseY;
    this.group.rotation.z = Math.sin(this.phase * 0.35) * (this.profile.swayAmplitude * 0.6);
  }

  // --- Attack: lunge forward briefly then return ---
  private animateAttack(delta: number): void {
    this.attackTimer += delta;
    const duration = 0.4;
    const t = Math.min(this.attackTimer / duration, 1);

    // Quick forward lunge using a sine curve
    const offset = Math.sin(t * Math.PI) * (0.35 + this.profile.moveSpeed * 0.12);
    this.group.position.copy(this.attackOrigin);
    this.group.position.addScaledVector(this.attackDirection, offset);

    if (t >= 1) {
      this.play('idle');
    }
  }

  // --- Emote: scale pulse ---
  private animateEmote(delta: number): void {
    this.emoteTimer += delta;
    const pulse = 1 + Math.sin(this.emoteTimer * 6) * (0.1 + this.profile.swayAmplitude * 1.8);
    this.group.scale.set(pulse, pulse, pulse);

    if (this.emoteTimer > 1.5) {
      this.group.scale.set(1, 1, 1);
      this.play('idle');
    }
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}
