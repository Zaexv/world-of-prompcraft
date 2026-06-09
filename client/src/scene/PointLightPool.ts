import * as THREE from 'three';

export interface LightEmitterParams {
  color: number;
  intensity: number;
  /** Light falloff range in world units. */
  distance: number;
  /** Physical falloff exponent (THREE default 2). */
  decay?: number;
}

interface LightEmitter extends LightEmitterParams {
  decay: number;
}

// Markers that want a real point light. A mesh registers a cheap Object3D here
// (via addLightEmitter) instead of adding its own THREE.PointLight; the pool
// reassigns a FIXED set of lights to the nearest active markers every frame.
//
// Keeping the light COUNT constant is the whole point: three.js bakes
// numPointLights into every material's program cache key, so streaming lanterns
// / houses / churches in and out of view used to flip the global count
// (0→3→2…) and force a full-scene shader recompile — the 100-600ms frametime
// stalls. With a fixed pool the count never changes after boot, so warmUpShaders
// compiles the right variant once and nothing recompiles mid-game.
const emitters = new Set<THREE.Object3D>();

/**
 * Add a light-emitter marker to `parent` at `localPos`. The marker carries the
 * desired light parameters; PointLightPool.update lights it with a pooled
 * PointLight when it's among the nearest emitters to the player. The marker
 * unregisters itself once it's detached from the scene graph (chunk unload).
 */
export function addLightEmitter(
  parent: THREE.Object3D,
  localPos: THREE.Vector3,
  params: LightEmitterParams,
): THREE.Object3D {
  const marker = new THREE.Object3D();
  marker.position.copy(localPos);
  const emitter: LightEmitter = {
    color: params.color,
    intensity: params.intensity,
    distance: params.distance,
    decay: params.decay ?? 2,
  };
  marker.userData.lightEmitter = emitter;
  parent.add(marker);
  emitters.add(marker);
  return marker;
}

/** Walk parents to decide whether `obj` is still attached under `scene`. */
function reachesScene(obj: THREE.Object3D, scene: THREE.Scene): boolean {
  let o: THREE.Object3D | null = obj;
  while (o) {
    if (o === scene) return true;
    o = o.parent;
  }
  return false;
}

interface LiveEntry {
  emitter: LightEmitter;
  distSq: number;
  x: number;
  y: number;
  z: number;
}

export class PointLightPool {
  private readonly lights: THREE.PointLight[] = [];
  private readonly scene: THREE.Scene;
  private readonly _wp = new THREE.Vector3();
  // Reused each frame to avoid per-frame allocation.
  private _live: LiveEntry[] = [];

  constructor(scene: THREE.Scene, size = 10) {
    this.scene = scene;
    for (let i = 0; i < size; i++) {
      // intensity 0 contributes nothing, but the light still counts toward
      // numPointLights so the program cache key stays stable. NEVER set
      // visible = false — that drops it from the count and triggers exactly the
      // recompile this pool exists to prevent.
      const light = new THREE.PointLight(0xffffff, 0, 1, 2);
      light.castShadow = false; // point-light shadow maps are costly; emitters never cast
      scene.add(light);
      this.lights.push(light);
    }
  }

  /** Reassign pooled lights to the nearest active emitters. Call once per frame. */
  update(playerX: number, playerZ: number): void {
    this._live.length = 0;
    for (const marker of emitters) {
      if (!reachesScene(marker, this.scene)) {
        emitters.delete(marker); // chunk unloaded — drop the dead emitter
        continue;
      }
      marker.getWorldPosition(this._wp);
      const dx = this._wp.x - playerX;
      const dz = this._wp.z - playerZ;
      this._live.push({
        emitter: marker.userData.lightEmitter as LightEmitter,
        distSq: dx * dx + dz * dz,
        x: this._wp.x,
        y: this._wp.y,
        z: this._wp.z,
      });
    }

    this._live.sort((a, b) => a.distSq - b.distSq);

    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i]!;
      const entry = this._live[i];
      if (!entry) {
        light.intensity = 0; // unused this frame
        continue;
      }
      light.position.set(entry.x, entry.y, entry.z);
      light.color.set(entry.emitter.color);
      light.intensity = entry.emitter.intensity;
      light.distance = entry.emitter.distance;
      light.decay = entry.emitter.decay;
    }
  }
}
