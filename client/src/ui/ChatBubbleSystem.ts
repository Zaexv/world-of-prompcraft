import * as THREE from 'three';

export type BubbleStyle = 'player' | 'npc' | 'system';

export interface BubbleOptions {
  parent?: THREE.Object3D;
  style?: BubbleStyle;
  duration?: number;
  senderName?: string;
}

interface BubbleEntry {
  div: HTMLDivElement;
  parent: THREE.Object3D | null;
  worldPos: THREE.Vector3;
  elapsed: number;
  duration: number;
  fading: boolean;
}

const MAX_BUBBLES = 8;
const Y_OFFSET = 4.5;
const DEFAULT_DURATION = 6;
const FADE_LEAD = 1;

const BUBBLE_CSS = `
@keyframes cb-appear {
  from {
    opacity: 0;
    transform: translateX(-50%) scale(0.8);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) scale(1);
  }
}

.cb-container {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 50;
}

.cb-bubble {
  position: absolute;
  transform: translateX(-50%);
  max-width: 320px;
  word-wrap: break-word;
  overflow-wrap: break-word;
  background: rgba(20, 40, 80, 0.9);
  border: 1px solid rgba(100, 160, 255, 0.4);
  border-radius: 12px;
  padding: 10px 16px;
  font: 15px 'Cinzel', Georgia, serif;
  color: #ffffff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
  animation: cb-appear 0.2s ease-out forwards;
  transition: opacity 1s ease;
}

.cb-bubble::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 8px solid rgba(20, 40, 80, 0.9);
}

.cb-bubble--player {
  background: rgba(20, 40, 80, 0.9);
  border-color: rgba(100, 160, 255, 0.4);
}

.cb-bubble--player::after {
  border-top-color: rgba(20, 40, 80, 0.9);
}

.cb-bubble--npc {
  background: rgba(60, 40, 10, 0.9);
  border-color: rgba(197, 165, 90, 0.6);
  color: #f0e6d0;
}

.cb-bubble--npc::after {
  border-top-color: rgba(60, 40, 10, 0.9);
}

.cb-bubble--system {
  background: rgba(40, 40, 40, 0.85);
  border-color: rgba(150, 150, 150, 0.3);
  font-style: italic;
}

.cb-bubble--system::after {
  border-top-color: rgba(40, 40, 40, 0.85);
}
`;

export class ChatBubbleSystem {
  private readonly camera: THREE.PerspectiveCamera;
  private readonly container: HTMLElement;
  private readonly bubbleContainer: HTMLDivElement;
  private readonly bubbles: BubbleEntry[] = [];
  private readonly projVec: THREE.Vector3 = new THREE.Vector3();
  private lastTime: number = 0;

  constructor(camera: THREE.PerspectiveCamera, container: HTMLElement) {
    this.camera = camera;
    this.container = container;

    // Inject CSS once
    if (!document.getElementById('cb-styles')) {
      const style = document.createElement('style');
      style.id = 'cb-styles';
      style.textContent = BUBBLE_CSS;
      document.head.appendChild(style);
    }

    // Create overlay container
    this.bubbleContainer = document.createElement('div');
    this.bubbleContainer.classList.add('cb-container');
    this.container.appendChild(this.bubbleContainer);

    this.lastTime = performance.now();
  }

  spawn(text: string, worldPos: THREE.Vector3, opts?: BubbleOptions): void {
    const style: BubbleStyle = opts?.style ?? 'player';
    const duration = opts?.duration ?? DEFAULT_DURATION;
    const parent = opts?.parent ?? null;
    const senderName = opts?.senderName;

    // Anti-stack: remove existing bubble for the same parent
    if (parent) {
      const existing = this.bubbles.findIndex((b) => b.parent === parent);
      if (existing !== -1) {
        this.removeBubble(existing);
      }
    }

    // Enforce max bubble limit — remove oldest
    while (this.bubbles.length >= MAX_BUBBLES) {
      this.removeBubble(0);
    }

    // Build HTML content
    let innerHTML = '';
    if (senderName) {
      const nameColor = style === 'npc' ? '#c5a55a' : '#88bbff';
      innerHTML = `<strong style="color: ${nameColor}">[${senderName}]</strong> ${this.escapeHtml(text)}`;
    } else {
      innerHTML = this.escapeHtml(text);
    }

    // Create div
    const div = document.createElement('div');
    div.className = `cb-bubble cb-bubble--${style}`;
    div.innerHTML = innerHTML;
    this.bubbleContainer.appendChild(div);

    this.bubbles.push({
      div,
      parent,
      worldPos: worldPos.clone(),
      elapsed: 0,
      duration,
      fading: false,
    });
  }

  update(): void {
    const now = performance.now();
    const dt = (now - this.lastTime) / 1000;
    this.lastTime = now;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.elapsed += dt;

      // Remove expired bubbles
      if (b.elapsed >= b.duration) {
        this.removeBubble(i);
        continue;
      }

      // Start fading
      if (!b.fading && b.elapsed >= b.duration - FADE_LEAD) {
        b.fading = true;
        b.div.style.opacity = '0';
      }

      // Get world position
      if (b.parent) {
        b.parent.getWorldPosition(this.projVec);
      } else {
        this.projVec.copy(b.worldPos);
      }

      // Add Y offset
      this.projVec.y += Y_OFFSET;

      // Project to NDC
      this.projVec.project(this.camera);

      // Behind camera check
      if (this.projVec.z > 1) {
        b.div.style.display = 'none';
        continue;
      }

      b.div.style.display = '';

      // NDC to screen pixels
      const screenX = (this.projVec.x * 0.5 + 0.5) * width;
      const screenY = (-this.projVec.y * 0.5 + 0.5) * height;

      b.div.style.left = `${screenX}px`;
      b.div.style.top = `${screenY}px`;
    }
  }

  clear(): void {
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      this.removeBubble(i);
    }
  }

  private removeBubble(index: number): void {
    const b = this.bubbles[index];
    b.div.remove();
    this.bubbles.splice(index, 1);
  }

  private escapeHtml(str: string): string {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}
