import * as THREE from 'three';
import { NPCAnimator } from './NPCAnimator';
import { createNPCMotionProfile, type NPCMotionProfile, type NPCMotionSource } from './NPCMotion';
import { Nameplate } from '../ui/Nameplate';
import { ActionIcon } from '../ui/ActionIcon';
import { QuestMarker } from '../ui/QuestMarker';
import type { NPCPlaceholderStyle } from './NPCModels';
import type { NPCAppearanceOverride } from './NPCModels';
import { NPCWander } from './NPCWander';
import { Water } from '../scene/Water';
import { buildNPCMesh, type NPCBuiltMesh } from './npc/NPCMeshFactory';
import { resolveAppearance } from './npc/NPCAppearanceResolver';

export interface NPCConfig {
  id: string;
  name: string;
  position: THREE.Vector3;
  color?: number;
  behavior?: NPCMotionSource['behavior'];
  style?: NPCPlaceholderStyle;
  appearance?: NPCAppearanceOverride;
  movementStyle?: NPCMotionSource['movementStyle'];
  wanderRadius?: number;
  hp?: number;
  maxHp?: number;
  personality?: string;
  personalityKey?: string;
  scale?: number;
  /** Show the floating golden "!" quest-giver marker above this NPC. */
  isQuestGiver?: boolean;
  /** When true the NPC holds its authored position: no wander, no walk-to-player
   *  on click, no ground snap (lets it sit on a rooftop). */
  fixed?: boolean;
}

export class NPC {
  public readonly id: string;
  public readonly name: string;
  public readonly personalityKey: string;
  public readonly position: THREE.Vector3;
  public readonly mesh: THREE.Group;
  public readonly animator: NPCAnimator;
  public readonly nameplate: Nameplate;
  public readonly actionIcon: ActionIcon;
  public readonly questMarker: QuestMarker | null;

  public homePosition: THREE.Vector3;
  public wanderRadius = 8;
  public isGrounded = false;
  /** Authored-position NPC: no wander, no walk-to-player, no ground snap. */
  public readonly fixed: boolean;

  /** Online mode: the server owns this NPC's intent. It assigns roam goals; the
   *  NPCWander navigator walks there with real collision (see walkToServerPosition). */
  private serverDriven = false;

  private readonly motionProfile: NPCMotionProfile;
  private readonly wander: NPCWander;
  private waterHoverPhase = Math.random() * Math.PI * 2;
  private readonly waterHoverHeight = 0.9;
  private readonly waterHoverAmplitude = 0.08;

  private materials: THREE.MeshStandardMaterial[] = [];
  private originalEmissives: number[] = [];

  constructor(config: NPCConfig, built: NPCBuiltMesh) {
    this.id = config.id;
    this.name = config.name;
    this.personalityKey = config.personalityKey ?? '';
    this.position = config.position.clone();
    this.homePosition = config.position.clone();
    this.fixed = config.fixed ?? false;
    this.motionProfile = createNPCMotionProfile(config);
    this.wanderRadius = this.fixed ? 0 : (config.wanderRadius ?? this.motionProfile.wanderRadius);

    this.mesh = built.object3D;
    this.materials = built.materials;
    this.mesh.position.copy(this.position);

    this.nameplate = new Nameplate(this.name);
    this.mesh.add(this.nameplate.sprite);

    this.actionIcon = new ActionIcon();
    this.mesh.add(this.actionIcon.sprite);

    this.questMarker = config.isQuestGiver ? new QuestMarker() : null;
    if (this.questMarker) this.mesh.add(this.questMarker.sprite);

    this.mesh.traverse((child) => {
      child.userData.npcId = this.id;
      child.userData.npcName = this.name;
    });

    this.animator = new NPCAnimator(this.mesh, this.motionProfile);
    this.wander = new NPCWander(this.mesh, this.position, this.motionProfile, this.animator, this.id);
  }

  /** Force immediate ground snapping. Useful during initialization.
   *  No-op for fixed NPCs so authored Y (e.g. a rooftop) is preserved. */
  snapToGround(getHeightAt: (x: number, z: number) => number): void {
    if (this.fixed) {
      this.animator.setBaseY(this.position.y);
      return;
    }
    const y = getHeightAt(this.position.x, this.position.z);
    this.mesh.position.y = y;
    this.position.y = y;
    this.homePosition.y = y;
    this.animator.setBaseY(y);
  }

  update(delta: number): void {
    this.waterHoverPhase += delta * 1.7;
    this.animator.update(delta);
    this.actionIcon.update(delta);
    this.questMarker?.update(delta);
    if (this.mesh.position.y < Water.LEVEL + 0.2) {
      const hoverY = Water.LEVEL
        + this.waterHoverHeight
        + Math.sin(this.waterHoverPhase) * this.waterHoverAmplitude;
      this.mesh.position.y = THREE.MathUtils.lerp(this.mesh.position.y, hoverY, Math.min(1, delta * 6));
      this.animator.setBaseY(this.mesh.position.y);
    }
    this.position.copy(this.mesh.position);
  }

  updateWander(
    delta: number,
    getHeightAt: (x: number, z: number) => number,
    collisionSystem?: { isPositionBlocked: (x: number, y: number, z: number, halfExtent?: number) => boolean },
  ): void {
    if (this.fixed || this.wanderRadius <= 0) return;
    const waterHoverY = Water.LEVEL
      + this.waterHoverHeight
      + Math.sin(this.waterHoverPhase) * this.waterHoverAmplitude;
    this.wander.update(delta, getHeightAt, collisionSystem, this.wanderRadius, this.homePosition, waterHoverY);
  }

  /** Walk to the player on interaction. Fixed NPCs ignore this and stay put. */
  walkToPlayer(playerPosition: THREE.Vector3): void {
    if (this.fixed) return;
    if (this.serverDriven) {
      // Server owns position: head there now for instant feedback; the server
      // echo (npc_move → npc_positions) keeps it authoritative.
      this.walkToServerPosition(playerPosition);
    } else {
      this.wander.walkTo(playerPosition);
    }
  }

  /** Hand position authority to the server: local random wandering stops and
   *  the NPC only moves toward server-pushed targets (followServerTarget). */
  setServerDriven(on: boolean): void {
    this.serverDriven = on;
    this.wander.serverDriven = on;
  }

  get isServerDriven(): boolean {
    return this.serverDriven;
  }

  /** Record the latest server-assigned roam goal. The NPCWander navigator walks
   *  there with real collision avoidance + terrain (server owns intent, client
   *  owns navigation). Server-driven NPCs only. */
  walkToServerPosition(target: THREE.Vector3): void {
    this.wander.setServerGoal(target);
  }

  updateApproachTarget(playerPosition: THREE.Vector3): void {
    this.wander.updateApproachTarget(playerPosition);
  }

  resumeWander(): void {
    this.wander.resumeWander();
  }

  playEmote(emote: string): void {
    if (emote === 'attack') this.animator.play('attack');
    else this.animator.play('emote', emote);
    this.actionIcon.displayAction(emote, 2.5);
  }

  /**
   * Drive a body gesture WITHOUT changing the action icon — used when an action
   * (damage, heal, quest) already shows its own semantic icon but should also
   * animate. `gesture` is an emote name or 'attack'.
   */
  playGesture(gesture: string): void {
    if (gesture === 'attack') this.animator.play('attack');
    else this.animator.play('emote', gesture);
  }

  /** Play a brief talk motion for `seconds` (matched to the chat bubble lifetime). */
  playTalk(seconds = 2.5): void {
    this.animator.talkDuration = seconds;
    this.animator.play('talk');
  }

  showAction(actionKind: string, duration = 3.0): void {
    this.actionIcon.displayAction(actionKind, duration);
  }

  /** Convenience factory — resolves appearance and builds the mesh in one call. */
  static create(config: NPCConfig): NPC {
    const spec = resolveAppearance(config);
    const scale = spec.scale ?? config.scale ?? 1;
    const built = buildNPCMesh({ ...spec, scale }, config.position, config.id);
    return new NPC(config, built);
  }

  dispose(): void {
    for (const mat of this.materials) mat.dispose();

    // Free per-part geometry too — NPC bodies are built from many unique, unshared
    // BufferGeometries, and procedural creatures spawn/despawn every chunk load,
    // so not disposing them leaks GPU memory over a session. Sprites (nameplate /
    // action icon / quest marker) are not THREE.Mesh and share an internal sprite
    // geometry, so they are correctly skipped by the instanceof check.
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });

    this.nameplate.sprite.material.dispose();
    if (this.nameplate.sprite.material instanceof THREE.SpriteMaterial && this.nameplate.sprite.material.map) {
      this.nameplate.sprite.material.map.dispose();
    }
    this.actionIcon.sprite.material.dispose();
    if (this.actionIcon.sprite.material instanceof THREE.SpriteMaterial && this.actionIcon.sprite.material.map) {
      this.actionIcon.sprite.material.map.dispose();
    }
    this.questMarker?.dispose();
  }

  setHighlight(on: boolean): void {
    const mats = this.materials;
    if (on) {
      if (this.originalEmissives.length === 0) {
        this.originalEmissives = mats.map((mat) => mat.emissive.getHex());
      }
      for (const mat of mats) mat.emissive.setHex(mat.emissive.getHex() | 0x444444);
    } else {
      for (let i = 0; i < mats.length; i++) {
        mats[i].emissive.setHex(this.originalEmissives[i] ?? 0x000000);
      }
    }
  }
}
