import * as THREE from 'three';
import type { PlayerController } from '../entities/PlayerController';
import { Water } from '../scene/Water';
import { buildMesh } from '../meshes';
import { AudioSystem } from '../audio/AudioSystem';

/**
 * BoatSystem — when the player enters water they board a boat instead of
 * swimming; when they reach land they hop back out. Self-contained and modular:
 * it watches `PlayerController.isSwimming`, drives `controller.inBoat` (which
 * switches the controller to surface-sailing physics), and owns the boat mesh +
 * its bob/rock and the board/leave hop animation.
 *
 * Call `update(controller, playerGroup, delta)` once per frame, after the
 * controller has moved and the player group position has been synced.
 */
const BOAT_SCALE = 2.2;   // boat is much bigger than the character
const BOAT_OFFSET = 2.6;  // shift the hull forward so the player sits aft at the helm
const BOARD_TIME = 0.6;   // seconds for the jump-in / jump-out animation
const HOP_HEIGHT = 1.4;   // peak of the boarding leap arc (world units)
const LUNGE = 1.8;        // how far back the leap starts (eases forward into the seat)
const BOB_AMP = 0.14;     // vertical bob amplitude
const ROCK_AMP = 0.05;    // side-to-side rock (radians)
const SPARK_N = 50;       // magic-poof particle count
const SPARK_RADIUS = 4.5; // how far sparkles fly out as the boat vanishes

let _sparkSprite: THREE.Texture | null = null;
function sparkSprite(): THREE.Texture {
  if (_sparkSprite) return _sparkSprite;
  const s = 32;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grd = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(200,230,255,0.7)');
    grd.addColorStop(1, 'rgba(180,160,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);
  }
  _sparkSprite = new THREE.CanvasTexture(canvas);
  return _sparkSprite;
}

export class BoatSystem {
  private readonly boat: THREE.Group;
  private readonly rig: THREE.Object3D | null;   // boom + sail, pivots at the mast
  private readonly sail: THREE.Object3D | null;  // mainsail billow animates along local X
  private readonly jib: THREE.Object3D | null;   // foresail billow animates along local X
  private mounted = false;
  /** >0 while boarding, <0 while leaving; magnitude counts down to 0. */
  private transition = 0;
  private leaving = false;
  private time = 0;
  private sailBillow = 1;
  private boomSwing = 0;
  private vanishSpin = 0;

  // Magic-poof sparkles shown when the boat vanishes on hop-off.
  private readonly sparkles: THREE.Points;
  private readonly sparkDirs: Float32Array;

  constructor(private readonly scene: THREE.Scene) {
    const built = buildMesh('boat_rowboat', { position: new THREE.Vector3(), scale: 1 });
    this.boat = (built as THREE.Group) ?? new THREE.Group();
    this.rig = this.boat.getObjectByName('rig') ?? null;
    this.sail = this.boat.getObjectByName('sail') ?? null;
    this.jib = this.boat.getObjectByName('jib') ?? null;
    this.boat.visible = false;
    this.scene.add(this.boat);

    // Sparkle cloud — random outward (upward-biased) directions, magic tints.
    const pos = new Float32Array(SPARK_N * 3);
    const col = new Float32Array(SPARK_N * 3);
    this.sparkDirs = new Float32Array(SPARK_N * 3);
    const tints = [new THREE.Color(0xaef0ff), new THREE.Color(0xc8a8ff), new THREE.Color(0xffffff)];
    for (let i = 0; i < SPARK_N; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = Math.random() * 0.8 + 0.1; // bias upward
      const r = 0.5 + Math.random() * 0.5;
      this.sparkDirs[i * 3] = Math.cos(a) * Math.cos(e) * r;
      this.sparkDirs[i * 3 + 1] = Math.sin(e) * r + 0.3;
      this.sparkDirs[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r;
      const c = tints[i % tints.length]!;
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const sparkMat = new THREE.PointsMaterial({
      size: 0.9, map: sparkSprite(), vertexColors: true, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.sparkles = new THREE.Points(geo, sparkMat);
    this.sparkles.visible = false;
    this.sparkles.userData.noCollision = true;
    this.scene.add(this.sparkles);
  }

  /** True while the player is riding the boat (or mid board/leave animation). */
  get isActive(): boolean {
    return this.mounted || this.transition !== 0;
  }

  update(controller: PlayerController, playerGroup: THREE.Group, delta: number): void {
    this.time += delta;
    const wantsBoat = controller.isSwimming;

    if (wantsBoat && !this.mounted) this.board(controller);
    else if (!wantsBoat && this.mounted) this.leave(controller);

    if (!this.isActive) return;

    const waterLevel = Water.getWaterLevel();
    const px = playerGroup.position.x;
    const pz = playerGroup.position.z;

    // Gentle bob + rock, phase-offset so the rock doesn't peak with the bob.
    const bob = Math.sin(this.time * 1.6) * BOB_AMP;
    const rockZ = Math.sin(this.time * 1.1) * ROCK_AMP;
    const rockX = Math.cos(this.time * 0.9) * ROCK_AMP * 0.6;

    // Transition progress p: 0→1. Drives the jump arc, lunge, and the magic
    // materialize (board) / vanish (leave) effects below.
    let hop = 0, jump = 0, lunge = 0;
    let p = this.mounted && !this.leaving ? 1 : 0; // settled when fully aboard
    const transitioning = this.transition > 0;
    if (transitioning) {
      this.transition = Math.max(0, this.transition - delta);
      p = 1 - this.transition / BOARD_TIME; // 0..1
      jump = Math.sin(p * Math.PI);
      hop = jump * HOP_HEIGHT;
      if (!this.leaving) lunge = (1 - p) * LUNGE; // boarding only: ease into the seat
      if (this.leaving && this.transition === 0) {
        this.boat.visible = false;
        this.sparkles.visible = false;
        this.leaving = false;
      }
    }
    controller.boardJumpT = jump;

    // Forward for this game's yaw convention is (sin, cos). The boat is shifted
    // FORWARD of the player so the player sits aft at the helm.
    const yaw = playerGroup.rotation.y;
    const fwdX = Math.sin(yaw);
    const fwdZ = Math.cos(yaw);
    this.boat.position.set(px + fwdX * BOAT_OFFSET, waterLevel + bob, pz + fwdZ * BOAT_OFFSET);
    this.boat.rotation.set(rockX, yaw, rockZ);

    // Magic materialize / vanish — the SAME sparkle effect both ways. On board the
    // sparkles converge inward as the boat spins/grows into being; on leave they
    // burst outward as it spins up, lifts and shrinks away.
    let grow: number;
    if (this.leaving) {
      this.vanishSpin += delta * 9;
      grow = Math.max(0.001, 1 - p);
      this.boat.position.y += p * 1.3;
      this.boat.rotation.y = yaw + this.vanishSpin;
      this.updateSparkles(p * SPARK_RADIUS, 1 - p);
    } else if (this.mounted && transitioning) {
      grow = Math.max(0.001, p);
      this.boat.position.y += (1 - p) * 1.1;             // descends into place
      this.boat.rotation.y = yaw + (1 - p) * (1 - p) * 7; // spin settles to heading
      this.updateSparkles((1 - p) * SPARK_RADIUS, 1 - p); // converge inward + fade
    } else {
      grow = this.mounted ? 1 : 0.001;
      this.sparkles.visible = false;
    }
    this.boat.scale.setScalar(grow * BOAT_SCALE);

    // Seat the player at the helm, bobbing with the boat, plus the leap arc/lunge.
    if (this.mounted || this.leaving) {
      playerGroup.position.y = controller.position.y + bob + hop;
      playerGroup.position.x = px - fwdX * lunge;
      playerGroup.position.z = pz - fwdZ * lunge;
    }

    // --- Living sail: fills and swings the boom when under way, luffs when idle ---
    const speed = Math.hypot(controller.velocity.x, controller.velocity.z);
    const moving = speed > 0.5;
    const t = Math.min(1, delta * 3); // frame-rate-independent smoothing
    // Billow deeper with speed; flutter always.
    const targetBillow = 1 + (moving ? 0.35 : 0.08) + Math.sin(this.time * 2.4) * 0.07;
    this.sailBillow = this.sailBillow + (targetBillow - this.sailBillow) * t;
    if (this.sail) this.sail.scale.x = this.sailBillow;
    // Jib billows a touch less than the main.
    if (this.jib) this.jib.scale.x = 0.8 + (this.sailBillow - 1) * 0.8;
    // Boom swings out to leeward under way, with a gentle sway.
    const targetSwing = (moving ? 0.16 : 0.0) + Math.sin(this.time * 1.3) * 0.05;
    this.boomSwing = this.boomSwing + (targetSwing - this.boomSwing) * t;
    if (this.rig) this.rig.rotation.y = this.boomSwing;
  }

  /** Place the sparkles at a given outward reach and opacity around the boat. */
  private updateSparkles(reach: number, opacity: number): void {
    this.sparkles.visible = true;
    const c = this.boat.position;
    const pos = this.sparkles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < SPARK_N; i++) {
      pos.setXYZ(
        i,
        c.x + this.sparkDirs[i * 3]! * reach,
        c.y + this.sparkDirs[i * 3 + 1]! * reach,
        c.z + this.sparkDirs[i * 3 + 2]! * reach,
      );
    }
    pos.needsUpdate = true;
    const m = this.sparkles.material as THREE.PointsMaterial;
    m.opacity = opacity;
    m.size = (0.4 + opacity * 0.8) * BOAT_SCALE * 0.5;
  }

  private board(controller: PlayerController): void {
    this.mounted = true;
    this.leaving = false;
    this.transition = BOARD_TIME;
    controller.inBoat = true;
    this.boat.visible = true;
    this.boat.scale.setScalar(0.001);
    this.vanishSpin = 0;
    AudioSystem.getInstance().playSfx('jump'); // magic materialize cue
  }

  private leave(controller: PlayerController): void {
    this.mounted = false;
    this.leaving = true;
    this.transition = BOARD_TIME;
    this.vanishSpin = 0;
    controller.inBoat = false;
    // Magic poof — reuse the jump cue (a dedicated sparkle SFX could slot in here).
    AudioSystem.getInstance().playSfx('jump');
  }
}
