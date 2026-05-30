import * as THREE from 'three';
import type { NPCMotionProfile } from './NPCMotion';

/**
 * Animation controller for an NPC.
 * Runs procedural bone-free animations.
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
  private mood = 0; // -10 to 10 (or similar)

  constructor(group: THREE.Group, profile: NPCMotionProfile) {
    this.group = group;
    this.profile = profile;
    this.baseY = group.position.y;

    this.rebind();
  }

  /**
   * Re-resolve limb references from the current mesh. Must be called after the
   * mesh is rebuilt (e.g. setSkin), otherwise the animator keeps driving the
   * old, detached limbs and the NPC freezes.
   */
  rebind(): void {
    this.head = this.group.getObjectByName('head') ?? null;
    this.leftLeg = this.group.getObjectByName('leftLeg') ?? null;
    this.rightLeg = this.group.getObjectByName('rightLeg') ?? null;
    this.leftArm = this.group.getObjectByName('leftArm') ?? null;
    this.rightArm = this.group.getObjectByName('rightArm') ?? null;
    this.cloak = this.group.getObjectByName('cloak') ?? null;
  }

  /** GLTF support removed. Procedural only. */
  setMixer(): void {}

  setProfile(profile: NPCMotionProfile): void {
    this.profile = profile;
  }

  /** Update the base Y position (e.g. after the NPC moves to new terrain height). */
  setBaseY(y: number): void {
    this.baseY = y;
  }

  setStill(value: boolean): void {
    this.still = value;
  }

  /**
   * Set the NPC's mood. Accepts either a numeric valence (-10..10) or a mood
   * word from the agent (e.g. "happy", "angry") which is mapped to a valence.
   * The server sends mood as a word, so without this mapping the mood-driven
   * idle animation never triggered.
   */
  setMood(value: number | string): void {
    this.mood = typeof value === 'number' ? value : moodToValence(value);
  }

  play(animationName: string): void {
    if (animationName === this.currentAnim) return;
    this.currentAnim = animationName;
    this.phase = 0;
    this.attackTimer = 0;
    this.emoteTimer = 0;
    
    // Auto-return to idle for emotes after a few seconds
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
  }

  update(delta: number): void {
    this.phase += delta * this.profile.walkCycleSpeed;
    if (this.phase > 628) this.phase -= 628;

    const anim = this.currentAnim.toLowerCase();

    if (anim === 'walk') {
      this.animateWalk(delta);
    } else if (anim === 'attack') {
      this.animateAttack(delta);
    } else if (anim.includes('wave')) {
      this.animateWave(delta);
    } else if (anim.includes('nod')) {
      this.animateNod(delta);
    } else if (anim.includes('dance')) {
      this.animateDance(delta);
    } else if (anim.includes('cheer') || anim.includes('hooray')) {
      this.animateCheer(delta);
    } else if (anim.includes('bow')) {
      this.animateBow(delta);
    } else if (anim.includes('laugh')) {
      this.animateLaugh(delta);
    } else if (anim.includes('cry') || anim.includes('weep') || anim.includes('sob')) {
      this.animateCry(delta);
    } else if (anim.includes('threaten') || anim.includes('menace')) {
      this.animateThreaten(delta);
    } else if (anim === 'idle') {
      this.animateIdle(delta);
    } else {
      // Fallback for any other emote: original scale pulse + idle base
      this.animateIdle(delta);
      this.animateEmote(delta);
    }
  }

  // --- Idle: gentle vertical bob ---
  private animateIdle(delta: number): void {
    if (!this.still) {
      // Mood modifiers: happy (mood > 5) = faster/higher bob, angry (mood < -5) = shivering
      const moodBobSpeed = this.mood > 5 ? 1.5 : 1.0;
      const moodBobAmp = this.mood > 5 ? 1.4 : 1.0;
      const jitter = this.mood < -5 ? (Math.random() - 0.5) * 0.04 : 0;

      this.group.position.y = this.baseY + 
        Math.sin(this.phase * this.profile.idleBobSpeed * moodBobSpeed) * 
        this.profile.idleBobAmplitude * moodBobAmp;
      
      this.group.rotation.z = Math.sin(this.phase * this.profile.swaySpeed) * this.profile.swayAmplitude + jitter;
      this.group.position.x += jitter;
    }
    // Decay any forward lean left over from emotes (bow/threaten).
    this.group.rotation.x = lerp(this.group.rotation.x, 0, Math.min(1, delta * 6));
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
    if (this.head) {
      this.head.rotation.x *= 0.9;
      this.head.rotation.y *= 0.9;
    }
    // Cloak settles to rest
    this.cloakLean = lerp(this.cloakLean, 0, Math.min(1, delta * 3));
    if (this.cloak) this.cloak.rotation.x = this.cloakLean;
    // Reset scale
    this.group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);

    // Wings flap gently if present
    const lWing = this.group.getObjectByName('leftWing');
    const rWing = this.group.getObjectByName('rightWing');
    if (lWing && rWing) {
      const flap = Math.sin(this.phase * 0.8) * 0.15;
      lWing.rotation.y = lerp(lWing.rotation.y, 0.25 + flap, delta * 4);
      rWing.rotation.y = lerp(rWing.rotation.y, -0.25 - flap, delta * 4);
    }
  }

  // --- Walk: leg + arm oscillation ---
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

    // Wings flap if present
    const lWing = this.group.getObjectByName('leftWing');
    const rWing = this.group.getObjectByName('rightWing');
    if (lWing && rWing) {
      const flap = Math.sin(this.phase * 1.5) * 0.3;
      lWing.rotation.y = lerp(lWing.rotation.y, 0.4 + flap, delta * 6);
      rWing.rotation.y = lerp(rWing.rotation.y, -0.4 - flap, delta * 6);
    }
  }

  // --- Wave: right arm waves back and forth ---
  private animateWave(delta: number): void {
    this.animateIdle(delta);
    if (this.rightArm) {
      const wave = Math.sin(this.phase * 2.5) * 0.8;
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, 2.4 + wave, delta * 10);
      this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -0.2, delta * 10);
      
      // Secondary: move staff if attached to right arm
      const staff = this.group.getObjectByName('staff');
      if (staff && staff.parent === this.rightArm) {
        staff.rotation.x = lerp(staff.rotation.x, wave * 0.2, delta * 10);
      }
    }
  }

  // --- Nod: head tilts down and up ---
  private animateNod(delta: number): void {
    this.animateIdle(delta);
    if (this.head) {
      const nod = 0.4 + Math.sin(this.phase * 3.5) * 0.4;
      this.head.rotation.x = lerp(this.head.rotation.x, nod, delta * 12);
    }
  }

  // --- Cheer: both arms raised and waving ---
  private animateCheer(delta: number): void {
    this.animateIdle(delta);
    const wave = Math.sin(this.phase * 3.0) * 0.5;
    if (this.leftArm) {
      this.leftArm.rotation.z = lerp(this.leftArm.rotation.z, -2.6 - wave, delta * 10);
    }
    if (this.rightArm) {
      this.rightArm.rotation.z = lerp(this.rightArm.rotation.z, 2.6 + wave, delta * 10);
    }
    if (this.head) {
      this.head.rotation.x = lerp(this.head.rotation.x, -0.3, delta * 10); // Look up
    }
  }

  // --- Dance: swaying and arm swinging ---
  private animateDance(delta: number): void {
    const dancePhase = this.phase * 1.5;
    this.group.position.y = lerp(this.group.position.y, this.baseY + Math.abs(Math.sin(dancePhase)) * 0.25, delta * 8);
    this.group.rotation.z = lerp(this.group.rotation.z, Math.sin(dancePhase * 0.8) * 0.5, delta * 8);
    
    const swing = Math.sin(dancePhase * 1.2) * 1.4;
    if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, swing, delta * 8);
    if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -swing, delta * 8);
    if (this.leftLeg) this.leftLeg.rotation.x = lerp(this.leftLeg.rotation.x, -swing * 0.4, delta * 8);
    if (this.rightLeg) this.rightLeg.rotation.x = lerp(this.rightLeg.rotation.x, swing * 0.4, delta * 8);
    
    // Wings flap if dragon
    const lWing = this.group.getObjectByName('leftWing');
    const rWing = this.group.getObjectByName('rightWing');
    if (lWing && rWing) {
      const flap = Math.sin(dancePhase * 2) * 0.6;
      lWing.rotation.y = lerp(lWing.rotation.y, 0.5 + flap, delta * 8);
      rWing.rotation.y = lerp(rWing.rotation.y, -0.5 - flap, delta * 8);
    }
  }

  // --- Bow: bend forward at the waist, head dips ---
  private animateBow(delta: number): void {
    this.animateIdle(delta);
    const bow = 0.55 + Math.sin(this.phase * 1.5) * 0.04;
    this.group.rotation.x = lerp(this.group.rotation.x, bow, delta * 7);
    if (this.head) this.head.rotation.x = lerp(this.head.rotation.x, 0.3, delta * 7);
    if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, 0.25, delta * 7);
    if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, 0.25, delta * 7);
  }

  // --- Laugh: head tilts back, shoulders shake, body bounces ---
  private animateLaugh(delta: number): void {
    this.animateIdle(delta);
    const shake = Math.sin(this.phase * 8) * 0.12;
    this.group.position.y = this.baseY + Math.abs(Math.sin(this.phase * 8)) * 0.07;
    if (this.head) this.head.rotation.x = lerp(this.head.rotation.x, -0.35 + shake, delta * 10);
    if (this.leftArm) this.leftArm.rotation.x = lerp(this.leftArm.rotation.x, -0.6 + shake, delta * 8);
    if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -0.6 - shake, delta * 8);
  }

  // --- Cry: head hangs, arms come up to the face, faint tremble ---
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

  // --- Threaten: lean in, fist jabs forward, head lowered ---
  private animateThreaten(delta: number): void {
    this.animateIdle(delta);
    const jab = Math.sin(this.phase * 6) * 0.3;
    this.group.rotation.x = lerp(this.group.rotation.x, 0.18, delta * 8);
    if (this.rightArm) this.rightArm.rotation.x = lerp(this.rightArm.rotation.x, -1.6 + jab, delta * 12);
    if (this.head) this.head.rotation.x = lerp(this.head.rotation.x, -0.15, delta * 8);
  }

  // --- Attack: lunge forward briefly then return ---
  private animateAttack(delta: number): void {
    this.attackTimer += delta;
    const duration = 0.4;
    const t = Math.min(this.attackTimer / duration, 1);

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

const POSITIVE_MOODS = [
  'happy', 'joy', 'cheer', 'excited', 'friendly', 'pleased', 'delight',
  'content', 'grateful', 'playful', 'amused', 'proud', 'hopeful',
];
const NEGATIVE_MOODS = [
  'angry', 'fury', 'furious', 'hostile', 'enraged', 'rage', 'scared',
  'afraid', 'fear', 'terrified', 'sad', 'annoyed', 'irritated', 'suspicious',
  'anxious', 'nervous', 'grief', 'distress',
];

/** Map an agent mood word to a numeric valence used by the idle animation. */
function moodToValence(mood: string): number {
  const m = mood.trim().toLowerCase();
  if (POSITIVE_MOODS.some((x) => m.includes(x))) return 8;
  if (NEGATIVE_MOODS.some((x) => m.includes(x))) return -8;
  return 0;
}
