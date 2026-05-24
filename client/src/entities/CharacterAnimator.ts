import * as THREE from 'three';

export type CharacterAnimationState = 'idle' | 'walk' | 'run' | 'swim' | 'swim_idle';

const STATE_FALLBACKS: Record<CharacterAnimationState, CharacterAnimationState[]> = {
  idle: ['idle'],
  walk: ['walk', 'idle'],
  run: ['run', 'walk', 'idle'],
  swim: ['swim', 'swim_idle', 'idle'],
  swim_idle: ['swim_idle', 'swim', 'idle'],
};

/**
 * Lightweight animation controller for rigged GLTF characters.
 */
export class CharacterAnimator {
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions: Partial<Record<CharacterAnimationState, THREE.AnimationAction>> = {};
  private currentAction: THREE.AnimationAction | null = null;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);

    for (const clip of clips) {
      const lower = clip.name.toLowerCase();
      const action = this.mixer.clipAction(clip);

      if (lower.includes('swim')) {
        if (lower.includes('idle') || lower.includes('rest') || lower.includes('stand')) {
          this.actions.swim_idle ??= action;
        } else {
          this.actions.swim ??= action;
        }
        continue;
      }

      if (lower.includes('run') || lower.includes('sprint')) {
        this.actions.run ??= action;
        continue;
      }

      if (lower.includes('walk') || lower.includes('move') || lower.includes('locomotion')) {
        this.actions.walk ??= action;
        continue;
      }

      if (lower.includes('idle') || lower.includes('stand') || lower.includes('rest')) {
        this.actions.idle ??= action;
      }
    }
  }

  hasAnimations(): boolean {
    return Object.values(this.actions).some((action) => action !== undefined);
  }

  setState(state: CharacterAnimationState): void {
    const next = this.resolveAction(state);
    if (!next || this.currentAction === next) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(0.15);
    }
    next.reset();
    next.fadeIn(this.currentAction ? 0.15 : 0.05);
    next.play();
    this.currentAction = next;
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }

  private resolveAction(state: CharacterAnimationState): THREE.AnimationAction | null {
    for (const fallback of STATE_FALLBACKS[state]) {
      const action = this.actions[fallback];
      if (action) return action;
    }
    return null;
  }
}
