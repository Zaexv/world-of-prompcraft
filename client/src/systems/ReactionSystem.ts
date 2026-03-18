import * as THREE from "three";
import type { AgentResponse, Action } from "../network/MessageProtocol";
import type { PlayerState } from "../state/PlayerState";
import type { NPCStateStore } from "../state/NPCState";
import type { WorldState } from "../state/WorldState";

// ── Effect-type presets ────────────────────────────────────────────────────
// Maps server effect types to visual parameters so each effect looks distinct.
interface EffectPreset {
  color: string;
  count: number;
  speed: number;     // velocity multiplier
  gravity: number;   // gravity strength (negative = floats up)
  size: number;      // particle size
  duration: number;  // seconds
  flash?: string;    // optional screen flash color
}

const EFFECT_PRESETS: Record<string, EffectPreset> = {
  fire: {
    color: "#ff4400", count: 40, speed: 3.5, gravity: -1, size: 0.35,
    duration: 1.8, flash: "#8b2200",
  },
  explosion: {
    color: "#ff6600", count: 60, speed: 6, gravity: 3, size: 0.4,
    duration: 1.5, flash: "#8b4400",
  },
  ice: {
    color: "#66ccff", count: 35, speed: 2, gravity: 1, size: 0.3,
    duration: 2.5,
  },
  sparkle: {
    color: "#ffee88", count: 25, speed: 1.5, gravity: -0.5, size: 0.2,
    duration: 2.5,
  },
  smoke: {
    color: "#888888", count: 30, speed: 1, gravity: -1.5, size: 0.5,
    duration: 3,
  },
  lightning: {
    color: "#aaeeff", count: 50, speed: 8, gravity: 5, size: 0.2,
    duration: 0.8, flash: "#334466",
  },
  holy_light: {
    color: "#ffffaa", count: 35, speed: 1.5, gravity: -2, size: 0.3,
    duration: 2.5, flash: "#2d5016",
  },
};

/** Minimal interface for the entity manager the reaction system depends on. */
export interface EntityManagerLike {
  getNPC(id: string): { mesh: THREE.Group; playEmote?: (emote: string) => void; showAction?: (kind: string, duration?: number) => void } | undefined;
  removeNPC?(id: string): void;
}

/**
 * Translates AgentResponse actions into concrete game-world effects:
 * HP changes, floating text, particles, weather shifts, quest banners, etc.
 */
export class ReactionSystem {
  private scene: THREE.Scene;
  private playerState: PlayerState;
  private npcStateStore: NPCStateStore;
  private worldState: WorldState;
  private entityManager: EntityManagerLike;

  /** Active tween-like updates to run each frame via `tick()`. */
  private activeEffects: Array<{
    update: (dt: number) => boolean; // return false to remove
  }> = [];

  constructor(
    scene: THREE.Scene,
    playerState: PlayerState,
    npcStateStore: NPCStateStore,
    worldState: WorldState,
    entityManager: EntityManagerLike,
  ) {
    this.scene = scene;
    this.playerState = playerState;
    this.npcStateStore = npcStateStore;
    this.worldState = worldState;
    this.entityManager = entityManager;
  }

  // ── Main entry point ───────────────────────────────────────────────────────

  handleResponse(response: AgentResponse): void {
    // Determine which state fields will be touched by individual actions
    // so we DON'T also apply them via the bulk merge (avoids double-damage,
    // duplicate items, and phantom HP changes).
    const actionTouchesHP = response.actions.some(
      (a) => a.kind === "damage" || a.kind === "heal",
    );
    const actionTouchesInventory = response.actions.some(
      (a) => a.kind === "give_item" || a.kind === "take_item",
    );

    if (response.playerStateUpdate) {
      const safePatch: Partial<typeof response.playerStateUpdate> = { ...response.playerStateUpdate };
      // Strip fields that actions will handle to prevent double-application
      if (actionTouchesHP) {
        delete (safePatch as any).hp;
      }
      if (actionTouchesInventory) {
        delete (safePatch as any).inventory;
      }
      // Only merge if there's anything left worth merging
      if (Object.keys(safePatch).length > 0) {
        this.playerState.merge(safePatch);
      }
    }
    if (response.npcStateUpdate) {
      this.npcStateStore.updateState(response.npcId, response.npcStateUpdate);
      // Update NPC nameplate health bar
      const npc = this.entityManager.getNPC(response.npcId);
      if (npc && 'nameplate' in npc) {
        const hp = response.npcStateUpdate.hp ?? 100;
        const maxHp = response.npcStateUpdate.maxHp ?? 100;
        (npc as any).nameplate.updateHP(hp, maxHp);
      }

      // NPC death check
      if (response.npcStateUpdate.hp !== undefined && response.npcStateUpdate.hp <= 0) {
        const deadNpc = this.entityManager.getNPC(response.npcId);
        if (deadNpc) {
          this.createFloatingText(
            "DEFEATED",
            "#c5a55a",
            deadNpc.mesh.position.clone().setY(deadNpc.mesh.position.y + 3),
          );
          // Death animation: scale to 0 over 1s then remove
          const mesh = deadNpc.mesh;
          const entityManager = this.entityManager;
          const npcId = response.npcId;
          const startScale = mesh.scale.clone();
          let timer = 0;
          this.activeEffects.push({
            update(dt) {
              timer += dt;
              const t = Math.min(timer / 1.0, 1);
              const s = 1 - t;
              mesh.scale.set(startScale.x * s, startScale.y * s, startScale.z * s);
              if (t >= 1) {
                entityManager.removeNPC?.(npcId);
                return false;
              }
              return true;
            },
          });
        }
      }
    }

    // Process individual actions
    for (const action of response.actions) {
      this.processAction(action, response.npcId);
    }
  }

  /** Call every frame so time-based effects can animate. */
  tick(delta: number): void {
    this.activeEffects = this.activeEffects.filter((e) => e.update(delta));
  }

  // ── Action dispatcher ──────────────────────────────────────────────────────

  private processAction(action: Action, npcId: string): void {
    const p = action.params;

    // Show action icon above the NPC
    const actingNpc = this.entityManager.getNPC(npcId);
    if (actingNpc?.showAction) {
      const iconKey = p.animation ?? p.effectType ?? p.damageType ?? action.kind;
      actingNpc.showAction(iconKey, 3.0);
    }

    switch (action.kind) {
      case "damage": {
        const amount = p.amount ?? 10;
        const target: string = p.target ?? "player";
        if (amount < 0) {
          // Negative damage = healing
          const healAmt = Math.abs(amount);
          this.playerState.heal(healAmt);
          const pos = this.playerWorldPos();
          this.createFloatingText(`+${healAmt}`, "#33ff66", pos);
          this.flashScreen("#2d5016");
        } else if (target === "player") {
          this.playerState.takeDamage(amount);
          const pos = this.playerWorldPos();
          this.createFloatingText(`-${amount}`, "#ff3333", pos);
          this.flashScreen("#8b0000");
        } else {
          // Damage targeting an NPC — show floating text on the NPC
          const targetNpc = this.entityManager.getNPC(target);
          if (targetNpc) {
            const npcPos = targetNpc.mesh.position.clone();
            npcPos.y += 3;
            this.createFloatingText(`-${amount}`, "#ff6633", npcPos);
            if ('nameplate' in targetNpc) {
              const state = this.npcStateStore.getState(target);
              if (state) (targetNpc as any).nameplate.updateHP(state.hp, state.maxHp);
            }
          }
        }
        break;
      }

      case "heal": {
        const amount = p.amount ?? 10;
        if (amount > 0) {
          this.playerState.heal(amount);
          const pos = this.playerWorldPos();
          this.createFloatingText(`+${amount}`, "#33ff66", pos);
          this.flashScreen("#2d5016");
        }
        break;
      }

      case "give_item": {
        const item: string = p.item ?? "Unknown Item";
        this.playerState.addItem(item);
        const pos = this.playerWorldPos();
        this.createFloatingText(`+${item}`, "#c5a55a", pos);
        break;
      }

      case "take_item": {
        const item: string = p.item ?? "";
        this.playerState.removeItem(item);
        break;
      }

      case "emote": {
        const npc = this.entityManager.getNPC(npcId);
        if (npc?.playEmote) {
          npc.playEmote(p.emote ?? "wave");
        }
        break;
      }

      case "move_npc": {
        const npc = this.entityManager.getNPC(npcId);
        if (npc && p.position) {
          const target = new THREE.Vector3(...(p.position as [number, number, number]));
          const start = npc.mesh.position.clone();
          let elapsed = 0;
          const duration = p.duration ?? 2;

          this.activeEffects.push({
            update(dt) {
              elapsed += dt;
              const t = Math.min(1, elapsed / duration);
              npc.mesh.position.lerpVectors(start, target, t);
              return t < 1;
            },
          });
        }
        break;
      }

      case "spawn_effect": {
        const pos = p.position
          ? new THREE.Vector3(...(p.position as [number, number, number]))
          : this.playerWorldPos();
        // Normalize: server sends effectType (NPC tools) or effect_type (handler)
        const effectType: string = p.effectType ?? p.effect_type ?? "sparkle";
        const resolved = EFFECT_PRESETS[effectType] ?? EFFECT_PRESETS.sparkle;
        const color: string = p.color ?? resolved.color;
        const count: number = p.count ?? resolved.count;
        this.createParticleBurst(pos, color, count, resolved);
        break;
      }

      case "change_weather": {
        const weather: string = p.weather ?? "clear";
        this.worldState.weather = weather;

        // Adjust scene fog as a visual cue
        if (weather === "fog" || weather === "rain") {
          this.scene.fog = new THREE.FogExp2(0x888888, 0.015);
        } else if (weather === "storm") {
          this.scene.fog = new THREE.FogExp2(0x444444, 0.025);
        } else if (weather === "snow") {
          this.scene.fog = new THREE.FogExp2(0xccccdd, 0.008);
        } else {
          // Restore default Teldrassil fog
          this.scene.fog = new THREE.FogExp2(0x1a1133, 0.004);
        }
        break;
      }

      case "start_quest":
      case "complete_quest": {
        const questName: string = p.quest ?? p.name ?? "Unknown Quest";
        const prefix = action.kind === "start_quest" ? "Quest Started" : "Quest Complete";
        this.showQuestBanner(`${prefix}: ${questName}`);
        break;
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private playerWorldPos(): THREE.Vector3 {
    const [x, y, z] = this.playerState.position;
    return new THREE.Vector3(x, y + 2.5, z);
  }

  /** Cap active effects to prevent memory/performance issues. */
  private capEffects(): void {
    while (this.activeEffects.length > 20) {
      const oldest = this.activeEffects.shift();
      if (oldest) oldest.update(999); // Force cleanup
    }
  }

  /** Creates a text sprite that floats up and fades over ~2 s. */
  createFloatingText(
    text: string,
    color: string,
    position: THREE.Vector3,
  ): void {
    this.capEffects();
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;

    ctx.font = "bold 36px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillText(text, 129, 33);
    // Main
    ctx.fillStyle = color;
    ctx.fillText(text, 128, 32);

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2, 0.5, 1);
    sprite.position.copy(position);
    this.scene.add(sprite);

    let elapsed = 0;
    const duration = 2;

    this.activeEffects.push({
      update: (dt) => {
        elapsed += dt;
        const t = elapsed / duration;
        sprite.position.y += dt * 1.2;
        mat.opacity = 1 - t;
        if (t >= 1) {
          this.scene.remove(sprite);
          tex.dispose();
          mat.dispose();
          return false;
        }
        return true;
      },
    });
  }

  /** Spawn a particle burst with effect-type-aware visuals. */
  createParticleBurst(
    position: THREE.Vector3,
    color: string,
    count: number,
    preset: EffectPreset = EFFECT_PRESETS.sparkle,
  ): void {
    this.capEffects();

    const speed = preset.speed;
    const gravity = preset.gravity;
    const duration = preset.duration;

    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = position.x;
      positions[i * 3 + 1] = position.y;
      positions[i * 3 + 2] = position.z;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * speed,
          Math.random() * speed * 0.75 + speed * 0.25,
          (Math.random() - 0.5) * speed,
        ),
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: new THREE.Color(color),
      size: preset.size,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const points = new THREE.Points(geometry, material);
    this.scene.add(points);

    // Optional screen flash for dramatic effects
    if (preset.flash) {
      this.flashScreen(preset.flash);
    }

    let elapsed = 0;

    this.activeEffects.push({
      update: (dt) => {
        elapsed += dt;
        const t = elapsed / duration;

        const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < count; i++) {
          posAttr.setX(i, posAttr.getX(i) + velocities[i].x * dt);
          posAttr.setY(i, posAttr.getY(i) + velocities[i].y * dt);
          posAttr.setZ(i, posAttr.getZ(i) + velocities[i].z * dt);
          velocities[i].y -= dt * gravity;
        }
        posAttr.needsUpdate = true;
        material.opacity = 1 - t;

        if (t >= 1) {
          this.scene.remove(points);
          geometry.dispose();
          material.dispose();
          return false;
        }
        return true;
      },
    });
  }

  // ── Screen flash ───────────────────────────────────────────────────────────

  private flashScreen(color: string): void {
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: color,
      opacity: "0.35",
      pointerEvents: "none",
      zIndex: "100",
      transition: "opacity 0.4s ease-out",
    } as CSSStyleDeclaration);

    document.body.appendChild(overlay);

    // Kick off fade
    requestAnimationFrame(() => {
      overlay.style.opacity = "0";
    });

    overlay.addEventListener("transitionend", () => {
      overlay.remove();
    });
  }

  // ── Quest banner ───────────────────────────────────────────────────────────

  private showQuestBanner(text: string): void {
    const banner = document.createElement("div");
    Object.assign(banner.style, {
      position: "fixed",
      top: "80px",
      left: "50%",
      transform: "translateX(-50%)",
      padding: "14px 32px",
      background: "linear-gradient(180deg, rgba(26,17,8,0.95), rgba(20,12,4,0.98))",
      border: "2px solid #c5a55a",
      borderRadius: "6px",
      color: "#c5a55a",
      fontSize: "20px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      fontWeight: "700",
      textShadow: "0 1px 4px rgba(0,0,0,0.9)",
      letterSpacing: "1px",
      zIndex: "90",
      pointerEvents: "none",
      opacity: "0",
      transition: "opacity 0.5s ease",
    } as CSSStyleDeclaration);

    banner.textContent = text;
    document.body.appendChild(banner);

    // Fade in
    requestAnimationFrame(() => {
      banner.style.opacity = "1";
    });

    // Fade out after 3 s
    setTimeout(() => {
      banner.style.opacity = "0";
      banner.addEventListener("transitionend", () => banner.remove());
    }, 3000);
  }
}
