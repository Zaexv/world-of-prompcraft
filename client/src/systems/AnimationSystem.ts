/**
 * A simple system that ticks all registered animatable objects each frame.
 */

export interface Animatable {
  update(delta: number): void;
}

export class AnimationSystem {
  private objects: Animatable[] = [];

  /** Register an object to be updated every frame. */
  register(obj: Animatable): void {
    this.objects.push(obj);
  }

  /** Unregister an object. */
  unregister(obj: Animatable): void {
    const idx = this.objects.indexOf(obj);
    if (idx !== -1) {
      this.objects.splice(idx, 1);
    }
  }

  /** Tick all registered objects. Call once per frame. */
  tick(delta: number): void {
    for (const obj of this.objects) {
      obj.update(delta);
    }
  }
}
