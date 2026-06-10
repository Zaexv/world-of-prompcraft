import { PlayerController } from '../entities/PlayerController';

/**
 * On-screen touch controls for phones:
 *   • left-thumb virtual joystick  → movement (forward/strafe + sprint)
 *   • drag anywhere on the canvas  → orbit camera (yaw/pitch)
 *   • two-finger pinch on canvas   → zoom
 *
 * A short, near-stationary touch on the canvas is treated as a TAP and left
 * untouched so the browser still synthesises a `click`, which InteractionSystem
 * uses to select NPCs. A real drag sets the canvas `justCameraDragged` dataset
 * flag so InteractionSystem ignores the trailing click (same mechanism the
 * desktop mouse-orbit uses).
 */
export class TouchControls {
  private readonly pc: PlayerController;
  private readonly canvas: HTMLElement;
  private readonly root: HTMLDivElement;

  // Joystick
  private readonly joyBase: HTMLDivElement;
  private readonly joyKnob: HTMLDivElement;
  private joyPointerId: number | null = null;
  private joyCenter = { x: 0, y: 0 };
  private readonly joyRadius = 52;

  // Look / pinch — track every active canvas pointer.
  private readonly lookPointers = new Map<
    number,
    { x: number; y: number; moved: number }
  >();
  private readonly tapSlop = 10; // px of travel still counted as a tap

  constructor(pc: PlayerController, canvas: HTMLElement) {
    this.pc = pc;
    this.canvas = canvas;

    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '30',
      touchAction: 'none',
    } as CSSStyleDeclaration);

    this.joyBase = document.createElement('div');
    Object.assign(this.joyBase.style, {
      position: 'absolute',
      left: 'calc(env(safe-area-inset-left, 0px) + 22px)',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 26px)',
      width: '124px',
      height: '124px',
      borderRadius: '50%',
      background: 'rgba(8,6,18,0.35)',
      border: '2px solid rgba(197,165,90,0.45)',
      boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      pointerEvents: 'auto',
      touchAction: 'none',
    } as CSSStyleDeclaration);

    this.joyKnob = document.createElement('div');
    Object.assign(this.joyKnob.style, {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: '56px',
      height: '56px',
      marginLeft: '-28px',
      marginTop: '-28px',
      borderRadius: '50%',
      background: 'rgba(197,165,90,0.55)',
      border: '1px solid rgba(224,200,114,0.9)',
      boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
      transition: 'transform 0.05s linear',
    } as CSSStyleDeclaration);
    this.joyBase.appendChild(this.joyKnob);
    this.root.appendChild(this.joyBase);

    const app = document.getElementById('app') ?? document.body;
    app.appendChild(this.root);

    this.attach();
  }

  private attach(): void {
    // Joystick — owns its own pointer, never bubbles to the look handler.
    this.joyBase.addEventListener('pointerdown', this.onJoyDown);
    this.joyBase.addEventListener('pointermove', this.onJoyMove);
    this.joyBase.addEventListener('pointerup', this.onJoyUp);
    this.joyBase.addEventListener('pointercancel', this.onJoyUp);

    // Look / pinch on the game canvas.
    this.canvas.addEventListener('pointerdown', this.onLookDown);
    this.canvas.addEventListener('pointermove', this.onLookMove);
    this.canvas.addEventListener('pointerup', this.onLookUp);
    this.canvas.addEventListener('pointercancel', this.onLookUp);
  }

  // ── Joystick ──────────────────────────────────────────────────────────────

  private onJoyDown = (e: PointerEvent): void => {
    if (this.joyPointerId !== null) return;
    this.joyPointerId = e.pointerId;
    const rect = this.joyBase.getBoundingClientRect();
    this.joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.joyBase.setPointerCapture(e.pointerId);
    e.preventDefault();
    this.updateJoy(e.clientX, e.clientY);
  };

  private onJoyMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.joyPointerId) return;
    e.preventDefault();
    this.updateJoy(e.clientX, e.clientY);
  };

  private onJoyUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.joyPointerId) return;
    this.joyPointerId = null;
    this.pc.touchForward = 0;
    this.pc.touchStrafe = 0;
    this.pc.touchRun = false;
    this.joyKnob.style.transform = 'translate(0px, 0px)';
  };

  private updateJoy(clientX: number, clientY: number): void {
    let dx = clientX - this.joyCenter.x;
    let dy = clientY - this.joyCenter.y;
    const dist = Math.hypot(dx, dy);
    if (dist > this.joyRadius) {
      dx = (dx / dist) * this.joyRadius;
      dy = (dy / dist) * this.joyRadius;
    }
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;

    const nx = dx / this.joyRadius; // -1 (left) .. +1 (right)
    const ny = dy / this.joyRadius; // -1 (up)   .. +1 (down)
    // forward axis: pushing up (negative screen y) = move forward (+1)
    this.pc.touchForward = -ny;
    // strafe axis matches keyboard A/D: A=+1=left, so left push (negative x) = +1
    this.pc.touchStrafe = -nx;
    const mag = Math.min(1, dist / this.joyRadius);
    this.pc.touchRun = mag > 0.85;
  }

  // ── Look / pinch ─────────────────────────────────────────────────────────

  private onLookDown = (e: PointerEvent): void => {
    this.lookPointers.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: 0 });
  };

  private onLookMove = (e: PointerEvent): void => {
    const p = this.lookPointers.get(e.pointerId);
    if (!p) return;

    if (this.lookPointers.size >= 2) {
      // Pinch-zoom: react to the change in spread between the two pointers.
      const prevSpread = this.pinchSpread();
      p.x = e.clientX;
      p.y = e.clientY;
      const newSpread = this.pinchSpread();
      this.pc.applyTouchZoom((prevSpread - newSpread) * 0.03);
      this.markDrag();
      e.preventDefault();
      return;
    }

    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.moved += Math.abs(dx) + Math.abs(dy);
    p.x = e.clientX;
    p.y = e.clientY;
    this.pc.applyTouchLook(dx, dy);
    if (p.moved > this.tapSlop) {
      this.markDrag();
      e.preventDefault();
    }
  };

  private onLookUp = (e: PointerEvent): void => {
    const p = this.lookPointers.get(e.pointerId);
    this.lookPointers.delete(e.pointerId);
    // A real drag suppresses the trailing synthetic click (NPC select); a tap
    // passes through so InteractionSystem can select the NPC under the finger.
    if (p && p.moved > this.tapSlop) {
      this.canvas.dataset.justCameraDragged = String(performance.now());
    }
    if (this.lookPointers.size === 0) {
      this.canvas.dataset.cameraDrag = '0';
    }
  };

  private pinchSpread(): number {
    const pts = [...this.lookPointers.values()];
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  private markDrag(): void {
    this.canvas.dataset.cameraDrag = '1';
  }

  dispose(): void {
    this.joyBase.removeEventListener('pointerdown', this.onJoyDown);
    this.joyBase.removeEventListener('pointermove', this.onJoyMove);
    this.joyBase.removeEventListener('pointerup', this.onJoyUp);
    this.joyBase.removeEventListener('pointercancel', this.onJoyUp);
    this.canvas.removeEventListener('pointerdown', this.onLookDown);
    this.canvas.removeEventListener('pointermove', this.onLookMove);
    this.canvas.removeEventListener('pointerup', this.onLookUp);
    this.canvas.removeEventListener('pointercancel', this.onLookUp);
    this.root.remove();
  }
}
