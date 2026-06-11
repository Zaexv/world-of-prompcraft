import * as THREE from "three";
import type { AgentResponse, Action } from "../network/MessageProtocol";
import type { PlayerState } from "../state/PlayerState";
import type { NPCStateStore } from "../state/NPCState";
import type { WorldState } from "../state/WorldState";
import type { WorldBuilder } from "./WorldBuilder";
import type { Terrain } from "../scene/Terrain";
import type { AudioSystem } from "../audio/AudioSystem";

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

// Keywords that mark a prompt as an attack. MUST mirror the server's
// ATTACK_KEYWORDS (server/src/combat/combat_resolution.py) so the client only
// previews a hit when the server will actually score one.
const ATTACK_KEYWORDS = new Set<string>([
  // Direct violence
  "attack", "hit", "strike", "slash", "stab", "punch", "kick", "fight", "kill",
  "destroy", "smash", "swing", "cleave", "thrust", "cut", "shoot", "blast",
  "crush", "bite", "claw", "slam", "burn", "freeze", "slay", "vanquish",
  "obliterate", "annihilate", "impale", "shatter", "pummel", "batter",
  "bludgeon", "gut", "rend", "tear", "mutilate", "pierce", "skewer", "decimate",
  "devastate", "maim", "overpower", "assault", "ambush", "execute",
  // Magical intent
  "fireball", "lightning", "unleash", "surge", "detonate", "incinerate",
  "electrocute", "smite", "curse", "hex", "wither", "zap", "ignite", "explode",
  // Tactical / expressive
  "lunge", "pounce", "tackle", "headbutt", "duel",
]);

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
  getNPC(id: string): {
    mesh: THREE.Group;
    position?: THREE.Vector3;
    playEmote?: (emote: string) => void;
    playGesture?: (gesture: string) => void;
    showAction?: (kind: string, duration?: number) => void;
    nameplate?: {
      updateHP: (hp: number, maxHp: number) => void;
      updateMood?: (mood: string, relationshipScore: number) => void;
    };
  } | undefined;
  removeNPC?(id: string): void;
  /** Permanently mark an NPC dead (despawn + refuse respawns on chunk reload). */
  markNPCDead?(id: string): void;
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
  private worldBuilder: WorldBuilder | null = null;
  private terrain: Terrain | null = null;

  /** Active tween-like updates to run each frame via `tick()`. */
  private activeEffects: Array<{
    update: (dt: number) => boolean; // return false to remove
  }> = [];

  private audio: AudioSystem | null = null;

  constructor(
    scene: THREE.Scene,
    playerState: PlayerState,
    npcStateStore: NPCStateStore,
    worldState: WorldState,
    entityManager: EntityManagerLike,
    audioSystem?: AudioSystem,
  ) {
    this.scene = scene;
    this.playerState = playerState;
    this.npcStateStore = npcStateStore;
    this.worldState = worldState;
    this.entityManager = entityManager;
    this.audio = audioSystem ?? null;
  }

  setWorldBuilder(wb: WorldBuilder): void {
    this.worldBuilder = wb;
  }

  setTerrain(t: Terrain): void {
    this.terrain = t;
  }

  // ── Main entry point ───────────────────────────────────────────────────────

  /** Process a list of actions without a full AgentResponse context (e.g. world_modify_response). */
  processActions(actions: Action[]): void {
    for (const action of actions) {
      this.processAction(action, "");
    }
  }

  handleResponse(response: AgentResponse): void {
    // Determine which state fields will be touched by individual actions
    // so we DON'T also apply them via the bulk merge (avoids double-damage,
    // duplicate items, and phantom HP changes).
    const actionTouchesHP = response.actions.some(
      (a) => a.kind === "damage" || a.kind === "heal",
    );
    const actionTouchesInventory = response.actions.some(
      (a) =>
        a.kind === "give_item" ||
        a.kind === "take_item" ||
        a.kind === "complete_purchase" ||
        a.kind === "sell_item",
    );

    if (response.playerStateUpdate) {
      const safePatch = { ...response.playerStateUpdate };
      // Strip fields that actions will handle to prevent double-application
      if (actionTouchesHP) {
        delete safePatch.hp;
      }
      if (actionTouchesInventory) {
        delete safePatch.inventory;
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
      if (npc?.nameplate) {
        const hp = response.npcStateUpdate.hp ?? 100;
        const maxHp = response.npcStateUpdate.maxHp ?? 100;
        npc.nameplate.updateHP(hp, maxHp);

        // Update mood & relationship indicators on the nameplate
        const mood = response.npcStateUpdate.mood;
        const relScore = response.npcStateUpdate.relationship_score;
        if (mood !== undefined || relScore !== undefined) {
          const state = this.npcStateStore.getState(response.npcId);
          if (state) {
            npc.nameplate.updateMood?.(state.mood, state.relationship_score);
          }
        }
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
                // Permanent death — also blocks respawn on chunk reload/rejoin.
                if (entityManager.markNPCDead) entityManager.markNPCDead(npcId);
                else entityManager.removeNPC?.(npcId);
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

  /** True when a prompt reads as an attack (mirrors the server's detection). */
  isAttackPrompt(prompt: string): boolean {
    for (const word of prompt.toLowerCase().split(/\s+/)) {
      if (ATTACK_KEYWORDS.has(word)) return true;
    }
    return false;
  }

  /**
   * Instant, optimistic combat feedback shown the moment the player submits an
   * attack — before the server round-trip. Plays the impact (hit sfx, NPC
   * lunge, spark burst) so combat feels immediate; the authoritative damage
   * number and HP arrive shortly after via the server's `npc_actions` message.
   * No HP is mutated here — the server stays the source of truth.
   */
  previewLocalAttack(npcId: string): void {
    const npc = this.entityManager.getNPC(npcId);
    if (!npc) return;
    this.audio?.playSfx("hit");
    npc.playGesture?.("attack");
    const pos = npc.mesh.position.clone();
    pos.y += 1.5;
    this.createParticleBurst(pos, "#ffd27f", 16, EFFECT_PRESETS.sparkle);
  }

  /** Call every frame so time-based effects can animate. */
  tick(delta: number): void {
    this.activeEffects = this.activeEffects.filter((e) => e.update(delta));
  }

  // ── Action dispatcher ──────────────────────────────────────────────────────

  private processAction(action: Action, npcId: string): void {
    const actingNpc = this.entityManager.getNPC(npcId);

    switch (action.kind) {
      case "damage": {
        const {
          amount = 10,
          target = "player",
          damageType,
          outcome,
          isCrit,
          combatText,
        } = action.params as {
          amount?: number;
          target?: string;
          damageType?: string;
          outcome?: string;
          isCrit?: boolean;
          combatText?: string;
        };
        this.audio?.playSfx("hit");
        if (actingNpc?.showAction) actingNpc.showAction(damageType ?? "damage", 3.0);
        actingNpc?.playGesture?.("attack");
        if (amount < 0) {
          const healAmt = Math.abs(amount);
          this.playerState.heal(healAmt);
          this.createFloatingText(`+${healAmt}`, "#33ff66", this.playerWorldPos());
          this.flashScreen("#2d5016");
        } else if (target === "player") {
          this.playerState.takeDamage(amount as number);
          this.createFloatingText(`-${amount}`, "#ff3333", this.playerWorldPos());
          this.flashScreen("#8b0000");
        } else {
          // `target` is the literal "npc" discriminator — the damaged NPC is the
          // one this response belongs to. Looking up getNPC("npc") never hit,
          // which silently dropped every damage popup.
          const targetNpc = actingNpc ?? this.entityManager.getNPC(target as string);
          if (targetNpc) {
            const npcPos = targetNpc.mesh.position.clone();
            npcPos.y += 3;
            const popupColor = this._damageTypeColor(damageType as string | undefined);
            this.createFloatingText(`-${amount}`, popupColor, npcPos, !!(isCrit as boolean | undefined));
            if (targetNpc.nameplate) {
              const state = this.npcStateStore.getState(target as string);
              if (state) targetNpc.nameplate.updateHP(state.hp, state.maxHp);
            }
            if (targetNpc.playEmote) targetNpc.playEmote("hit");
            if (combatText) {
              this._logCombatText(combatText as string, outcome as string | undefined);
            }
            if (isCrit) {
              this._flashNpcPortrait();
              this.flashScreen(this._damageTypeFlash(damageType as string | undefined));
            }
            if (outcome === "defeated") {
              this._spawnFinisher("DEFEATED!");
            }
          }
        }
        break;
      }

      case "heal": {
        const { amount = 10 } = action.params;
        this.audio?.playSfx("heal");
        if (actingNpc?.showAction) actingNpc.showAction("heal", 3.0);
        actingNpc?.playGesture?.("cheer"); // arms-raised casting gesture
        if (amount > 0) {
          this.playerState.heal(amount);
          this.createFloatingText(`+${amount}`, "#33ff66", this.playerWorldPos());
          this.flashScreen("#2d5016");
        }
        break;
      }

      case "give_item": {
        const { item = "Unknown Item", description, rarity, icon, effects, value } = action.params;
        this.audio?.playSfx("item_pickup");
        if (actingNpc?.showAction) actingNpc.showAction("give_item", 3.0);
        this.playerState.addItem({ name: item, description, rarity, icon, effects, value });
        this.createFloatingText(`+${item}`, "#c5a55a", this.playerWorldPos());
        break;
      }

      case "give_gold": {
        const { amount = 0 } = action.params;
        if (amount > 0) {
          this.audio?.playSfx("item_pickup");
          this.playerState.addGold(amount);
          this.createFloatingText(`+${amount} Gold`, "#ffcc33", this.playerWorldPos());
        }
        break;
      }

      case "complete_purchase": {
        const { item = "Unknown Item", price = 0, description, rarity, icon, effects, value } =
          action.params;
        this.audio?.playSfx("item_pickup");
        if (actingNpc?.showAction) actingNpc.showAction("give_item", 3.0);
        this.playerState.addItem({ name: item, description, rarity, icon, effects, value });
        if (price > 0) this.playerState.addGold(-price);
        this.createFloatingText(`+${item}`, "#c5a55a", this.playerWorldPos());
        if (price > 0) {
          this.createFloatingText(`-${price} Gold`, "#ffcc33", this.playerWorldPos());
        }
        break;
      }

      case "sell_item": {
        const { item = "", price = 0 } = action.params;
        this.audio?.playSfx("item_pickup");
        if (item) this.playerState.removeItem(item);
        if (price > 0) {
          this.playerState.addGold(price);
          this.createFloatingText(`+${price} Gold`, "#ffcc33", this.playerWorldPos());
        }
        break;
      }

      case "take_item": {
        const { item = "" } = action.params;
        this.playerState.removeItem(item);
        break;
      }

      case "emote": {
        const { animation } = action.params;
        this.audio?.playSfx("emote");
        if (actingNpc?.showAction) actingNpc.showAction(animation, 3.0);
        const npc = this.entityManager.getNPC(npcId);
        if (npc?.playEmote) npc.playEmote(animation ?? "wave");
        break;
      }

      case "move_npc": {
        if (actingNpc?.showAction) actingNpc.showAction("move_npc", 3.0);
        const npc = this.entityManager.getNPC(npcId);
        const { position, duration = 2 } = action.params;
        if (npc && Array.isArray(position) && position.length >= 3) {
          const destX = position[0] as number;
          const destZ = position[2] as number;
          // Snap Y to terrain height — server sends null for Y when it doesn't
          // know the terrain height (e.g. move_npc tool in environment.py).
          const destY = (position[1] != null && (position[1] as number) !== 0)
            ? (position[1] as number)
            : (this.terrain ? this.terrain.getHeightAt(destX, destZ) : 0);
          const targetPos = new THREE.Vector3(destX, destY, destZ);
          const start = npc.mesh.position.clone();
          let elapsed = 0;
          this.activeEffects.push({
            update(dt) {
              elapsed += dt;
              const t = Math.min(1, elapsed / duration);
              npc.mesh.position.lerpVectors(start, targetPos, t);
              npc.position?.copy(npc.mesh.position);
              if (t >= 1) {
                npc.mesh.position.copy(targetPos);
                npc.position?.copy(targetPos);
                return false;
              }
              return true;
            },
          });
        }
        break;
      }

      case "spawn_effect": {
        const { effectType, effect_type, color, count, position } = action.params;
        const resolvedType: string = effectType ?? effect_type ?? "sparkle";
        this.audio?.playSfx(resolvedType);
        if (actingNpc?.showAction) actingNpc.showAction(resolvedType, 3.0);
        const pos =
          Array.isArray(position) && position.length >= 3
            ? new THREE.Vector3(
                position[0] as number,
                position[1] as number,
                position[2] as number,
              )
            : this.playerWorldPos();
        const resolved = EFFECT_PRESETS[resolvedType] ?? EFFECT_PRESETS.sparkle;
        this.createParticleBurst(pos, color ?? resolved.color, count ?? resolved.count, resolved);
        break;
      }

      case "change_weather": {
        const { weather = "clear" } = action.params;
        this.audio?.playSfx("sparkle");
        if (actingNpc?.showAction) actingNpc.showAction("change_weather", 3.0);
        this.worldState.weather = weather;
        if (weather === "fog" || weather === "rain") {
          this.scene.fog = new THREE.FogExp2(0x888888, 0.015);
        } else if (weather === "storm") {
          this.scene.fog = new THREE.FogExp2(0x444444, 0.025);
        } else if (weather === "snow") {
          this.scene.fog = new THREE.FogExp2(0xccccdd, 0.008);
        } else {
          this.scene.fog = new THREE.FogExp2(0x1a1133, 0.004);
        }
        break;
      }

      case "accept_quest":
      case "start_quest": {
        this.audio?.playSfx("quest_start");
        if (actingNpc?.showAction) actingNpc.showAction("start_quest", 3.0);
        actingNpc?.playGesture?.("bow"); // present the quest with a gesture
        const raw = action.params.quest;
        if (raw && typeof raw === "object") {
          this.playerState.acceptQuest(raw as Record<string, unknown>);
          const name = this.playerState.getQuestName(String((raw as Record<string, unknown>).id ?? ""));
          this.showQuestBanner(`Quest Started: ${name}`);
        } else if ("questId" in action.params && action.params.questId) {
          // Legacy id-only path.
          this.showQuestBanner(`Quest Started: ${this.playerState.getQuestName(action.params.questId)}`);
        }
        break;
      }

      case "advance_objective": {
        const { questId = "", objectiveId = "", description = "", progress } = action.params;
        if (actingNpc?.showAction) actingNpc.showAction("advance_objective", 3.0);
        if (questId && objectiveId) this.playerState.advanceObjective(questId, objectiveId, progress);
        this.showQuestBanner(`Objective: ${description || objectiveId}`);
        break;
      }

      case "complete_quest": {
        const { questId, quest_id } = action.params;
        this.audio?.playSfx("quest_complete");
        if (actingNpc?.showAction) actingNpc.showAction("complete_quest", 3.0);
        actingNpc?.playGesture?.("cheer");
        const id = questId ?? quest_id ?? "";
        const name = id ? this.playerState.getQuestName(id) : "Quest";
        if (id) this.playerState.completeQuest(id);
        this.showQuestBanner(`Quest Complete: ${name}`);
        break;
      }

      case "world_spawn": {
        this.worldBuilder?.spawnObject(action.params);
        break;
      }

      case "world_remove": {
        this.worldBuilder?.removeObject(action.params.objectId);
        break;
      }

      case "play_music": {
        const { mood, notes, duration } = action.params;
        if (notes && notes.length > 0) {
          this.audio?.playMusicSequence(notes);
        } else {
          this.audio?.playMoodMusic(mood, duration);
        }
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

  /** Map damage type to a popup color. */
  private _damageTypeColor(damageType: string | undefined): string {
    switch (damageType) {
      case "fire": return "#ff6600";
      case "ice": return "#66ccff";
      case "lightning": return "#aaeeff";
      case "holy": return "#ffffaa";
      case "dark": return "#cc44ff";
      case "arcane": return "#aa44ff";
      default: return "#ff6633";
    }
  }

  /** Map damage type to a subtle screen flash color for crits. */
  private _damageTypeFlash(damageType: string | undefined): string {
    switch (damageType) {
      case "fire": return "#8b2200";
      case "ice": return "#003366";
      case "lightning": return "#334466";
      case "holy": return "#2d5016";
      case "dark": return "#330044";
      case "arcane": return "#220044";
      default: return "#662200";
    }
  }

  /** Log a combat outcome text to the CombatHUD if available. */
  private _logCombatText(text: string, outcome: string | undefined): void {
    const hud = (window as unknown as Record<string, unknown>)["combatHUD"] as {
      addLogEntry?: (text: string, color?: string) => void;
    } | undefined;
    if (!hud?.addLogEntry) return;
    let color = "#e8dcc8";
    if (outcome === "devastating_hit" || outcome === "defeated") color = "#ff4400";
    else if (outcome === "critical_hit") color = "#ffd700";
    else if (outcome === "clean_hit") color = "#aaffaa";
    hud.addLogEntry(text, color);
  }

  private _flashNpcPortrait(): void {
    const hud = (window as unknown as Record<string, unknown>)["combatHUD"] as {
      flashNpcPortrait?: () => void;
    } | undefined;
    hud?.flashNpcPortrait?.();
  }

  private _spawnFinisher(text: string): void {
    const damagePopup = (window as unknown as Record<string, unknown>)["damagePopup"] as {
      spawnFinisher?: (popupText: string) => void;
    } | undefined;
    damagePopup?.spawnFinisher?.(text);
  }

  /** Creates a text sprite that floats up and fades over ~2 s. */
  createFloatingText(
    text: string,
    color: string,
    position: THREE.Vector3,
    isCrit = false,
  ): void {
    this.capEffects();
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    const displayText = isCrit ? `${text}!` : text;
    const displayColor = isCrit ? "#ffd700" : color;
    const fontSize = isCrit ? 52 : 36;

    ctx.font = `bold ${fontSize}px serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillText(displayText, 129, 33);
    // Main
    ctx.fillStyle = displayColor;
    ctx.fillText(displayText, 128, 32);

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
