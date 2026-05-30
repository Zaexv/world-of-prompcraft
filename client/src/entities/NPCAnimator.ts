import * as THREE from 'three';
import { GLTF_CLIP_MAP } from './NPCModels';
import type { NPCMotionProfile } from './NPCMotion';

export type AnimationName = 'idle' | 'walk' | 'attack' | 'emote';

/**
 * Animation controller for an NPC.
 * Runs procedural bone-free animations by default.
 */
export class NPCAnimator {
  private group: THREE.Group;
  private profile: NPCMotionProfile;
  private head: THREE.Object3D | null = null;
  private leftLeg: THREE.Object3D | null = null;
  private rightLeg: THREE.Object3D | null = null;
  private leftArm: THREE.Object3D | null = null;
  private rightArm: THREE.Object3D | null = null;
  private cloak: THREE.Object3D | null = null;
  private cloakLean = 0;
  private baseY: number;
  private phase = 0;
  private currentAnim: string = 'idle';
  private attackTimer = 0;
  private emoteTimer = 0;
  private attackOrigin: THREE.Vector3 = new THREE.Vector3();
  private attackDirection: THREE.Vector3 = new THREE.Vector3(0, 0, 1);
  private still = false;
  private mood = 0; // -10 to 10

  // Animation throttling
  private updateAccumulator = 0;
  public throttleFactor = 1;

  // GLTF mode
  private mixer: THREE.AnimationMixer | null = null;
  private clips: Map<string, THREE.AnimationClip> = new Map();

  constructor(group: THREE.Group, profile: NPCMotionProfile) {
    this.group = group;
    this.profile = profile;
    this.baseY = group.position.y;

    this.rebind();
  }

  rebind(): void {
    this.head = this.group.getObjectByName('head') ?? null;
    this.leftLeg = this.group.getObjectByName('leftLeg') ?? null;
    this.rightLeg = this.group.getObjectByName('rightLeg') ?? null;
    this.leftArm = this.group.getObjectByName('leftArm') ?? null;
    this.rightArm = this.group.getObjectByName('rightArm') ?? null;
    this.cloak = this.group.getObjectByName('cloak') ?? null;
  }

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

  setBaseY(y: number): void {
    this.baseY = y;
  }

  setStill(value: boolean): void {
    this.still = value;
  }

  setMood(value: number | string): void {
    this.mood = typeof value === 'number' ? value : moodToValence(value);
  }

  play(animationName: string): void {
    if (animationName === this.currentAnim) return;
    this.currentAnim = animationName;
    this.phase = 0;
    this.attackTimer = 0;
    this.emoteTimer = 0;
    
    if (animationName !== 'idle' && animationName !== 'walk') {
      setTimeout(() => {
        if (this.currentAnim === animationName) {
          this.play('idle');
        }
      }, 3000);
    }

    if (animationName === 'attack') {
      this.attackOrigin.copy(this.group.position);
      this.attackDirection.set(0, 0, 1).applyQuaternion(this.group.quaternion).normalize();
    }
    if (this.mixer) {
      this.playGLTFClip(animationName);
    }
  }

  update(delta: number): void {
    this.updateAccumulator += delta;
    const threshold = (1 / 60) * (this.throttleFactor - 0.1);
    if (this.updateAccumulator < threshold) return;
    
    const throttledDelta = this.updateAccumulator;
    this.updateAccumulator = 0;

    if (this.mixer) {
      this.mixer.timeScale = this.profile.animationRate;
      this.mixer.update(throttledDelta);
      return;
    }

    this.phase += throttledDelta * this.profile.walkCycleSpeed;
    if (this.phase > 628) this.phase -= 628;

    const anim = this.currentAnim.toLowerCase();

    if (anim === 'walk') {
      this.animateWalk(throttledDelta);
    } else if (anim === 'attack') {
      this.animateAttack(throttledDelta);
    } else if (anim.includes('wave')) {
      this.animateWave(throttledDelta);
    } else if (anim.includes('nod')) {
      this.animateNod(throttledDelta);
    } else if (anim.includes('dance')) {
      this.animateDance(throttledDelta);
    } else if (anim.includes('cheer')) {
      this.animateCheer(throttledDelta);
    } else if (anim.includes('bow')) {
      this.animateBow(throttledDelta);
    } else if (anim.includes('laugh')) {
      this.animateLaugh(throttledDelta);
    } else if (anim.includes('cry')) {
      this.animateCry(throttledDelta);
    } else if (anim.includes('threaten')) {
      this.animateThreaten(throttledDelta);
    } else if (anim === 'idle') {
      this.animateIdle(throttledDelta);
    } else {
      this.animateIdle(throttledDelta);
      this.animateEmote(throttledDelta);
    }
  }

  private playGLTFClip(name: string): void {
    if (!this.mixer) return;
    const clipName = GLTF_CLIP_MAP[name] ?? name;
    const clip = this.clips.get(clipName) ?? this.clips.values().next().value;
    if (!clip) return;
    this.mixer.stopAllAction();
    this.mixer.clipAction(clip).reset().fadeIn(0.2).play();
  }

  private animateIdle(delta: number): void {
    if (!this.still) {
      const moodBobSpeed = this.mood > 5 ? 1.5 : 1.0;
      const moodBobAmp = this.mood > 5 ? 1.4 : 1.0;
      const jitter = this.mood < -5 ? (Math.random() - 0.5) * 0.04 : 0;

      this.group.position.y = this.baseY + 
        Math.sin(this.phase * this.profile.idleBobSpeed * moodBobSpeed) * 
        this.profile.idleBobAmplitude * moodBobAmp;
      
      this.group.rotation.z = Math.sin(this.phase * this.profile.swaySpeed) * this.profile.swayAmplitude + jitter;
      this.group.position.x += jitter;
    }
    this.group.rotation.x = lerp(this.group.rotation.x, 0, Math.min(1, delta * 6));
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
    if (this.head) {
      this.head.rotation.x *= 0.9;
      this.head.rotation.y *= 0.9;
    }
    this.cloakLean = lerp(this.cloakLean, 0, Math.min(1, delta * 3));
    if (this.cloak) this.cloak.rotation.x = this.cloakLean;
    this.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
  }

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

  private animateWave(delta: number): void {
    this.animateIdle(delta);
    if (this.rightArm) {
      const wave = Math.sin(this.phase * 2.5) * 0.8;
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, 2.4 + wave, delta * 10);
      this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -0.2, delta * 10);
    }
  }

  private animateNod(delta: number): void {
    this.animateIdle(delta);
    if (this.head) {
      const nod = 0.4 + Math.sin(this.phase * 3.5) * 0.4;
      this.head.rotation.x = lerp(this.head.rotation.x, nod, delta * 12);
    }
  }

  private animateCheer(delta: number): void {
    this.animateIdle(delta);
    const wave = Math.sin(this.phase * 3.0) * 0.5;
    if (this.leftArm) this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, -2.6 - wave, delta * 10);
    if (this.rightArm) this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, 2.6 + wave, delta * 10);
    if (this.head) this.head.rotation.x = lerp(this.head.rotation.x, -0.3, delta * 10);
  }

  private animateDance(delta: number): void {
    const dancePhase = this.phase * 1.5;
    this.group.position.y = lerp(this.group.position.y, this.baseY + Math.abs(Math.sin(dancePhase)) * 0.25, delta * 8);
    this.group.rotation.z = lerp(this.group.rotation.z, Math.sin(dancePhase * 0.8) * 0.5, delta * 8);
    const swing = Math.sin(dancePhase * 1.2) * 1.4;
    if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, swing, delta * 8);
    if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -swing, delta * 8);
    if (this.leftLeg) this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, -swing * 0.4, delta * 8);
    if (this.rightLeg) this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, swing * 0.4, delta * 8);
  }

  private animateBow(delta: number): void {
    this.animateIdle(delta);
    const bow = 0.55 + Math.sin(this.phase * 1.5) * 0.04;
    this.group.rotation.x = lerp(this.group.rotation.x, bow, delta * 7);
    if (this.head) this.head.rotation.x = lerp(this.head.rotation.x, 0.3, delta * 7);
  }

  private animateLaugh(delta: number): void {
    this.animateIdle(delta);
    const shake = Math.sin(this.phase * 8) * 0.12;
    this.group.position.y = this.baseY + Math.abs(Math.sin(this.phase * 8)) * 0.07;
    if (this.head) this.head.rotation.x = lerp(this.head.rotation.x, -0.35 + shake, delta * 10);
    if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, -0.6 + shake, delta * 8);
    if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -0.6 - shake, delta * 8);
  }

  private animateCry(delta: number): void {
    this.animateIdle(delta);
    const tremble = (Math.random() - 0.5) * 0.03;
    if (this.head) this.head.rotation.x = lerp(this.head.rotation.x, 0.35 + tremble, delta * 8);
    if (this.leftArm) {
      this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, -1.5, delta * 8);
      this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, 0.35, delta * 8);
    }
    if (this.rightArm) {
      this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -1.5, delta * 8);
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, -0.35, delta * 8);
    }
  }

  private animateThreaten(delta: number): void {
    this.animateIdle(delta);
    const jab = Math.sin(this.phase * 6) * 0.3;
    this.group.rotation.x = lerp(this.group.rotation.x, 0.18, delta * 8);
    if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -1.6 + jab, delta * 12);
  }

  private animateAttack(delta: number): void {
    this.attackTimer += delta;
    const duration = 0.4;
    const t = Math.min(this.attackTimer / duration, 1);
    const offset = Math.sin(t * Math.PI) * (0.35 + this.profile.moveSpeed * 0.12);
    this.group.position.copy(this.attackOrigin);
    this.group.position.addScaledVector(this.attackDirection, offset);
    if (t >= 1) this.play('idle');
  }

  private animateEmote(delta: number): void {
    this.emoteTimer += delta;
    if (this.emoteTimer > 1.5) this.play('idle');
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

const POSITIVE_MOODS = ['happy', 'joy', 'cheer', 'friendly', 'excited'];
const NEGATIVE_MOODS = ['angry', 'fear', 'sad', 'hostile', 'terrified'];

function moodToValence(mood: string): number {
  const m = mood.toLowerCase();
  if (POSITIVE_MOODS.some(x => m.includes(x))) return 8;
  if (NEGATIVE_MOODS.some(x => m.includes(x))) return -8;
  return 0;
}
