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
  isQuestGiver?: boolean;
  questIds?: string[];
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
  /** Curated quest ids this NPC owns (for hiding the '!' once taken/completed). */
  public readonly questIds: readonly string[];

  public homePosition: THREE.Vector3;
  public wanderRadius = 8;
  public isGrounded = false;

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
    this.motionProfile = createNPCMotionProfile(config);
    this.wanderRadius = config.wanderRadius ?? this.motionProfile.wanderRadius;

    this.mesh = built.object3D;
    this.materials = built.materials;
    this.mesh.position.copy(this.position);

    this.nameplate = new Nameplate(this.name);
    this.mesh.add(this.nameplate.sprite);

    this.actionIcon = new ActionIcon();
    this.mesh.add(this.actionIcon.sprite);

    this.questIds = config.questIds ?? [];
    this.questMarker = config.isQuestGiver ? new QuestMarker() : null;
    if (this.questMarker) this.mesh.add(this.questMarker.sprite);

    this.mesh.traverse((child) => {
      child.userData.npcId = this.id;
      child.userData.npcName = this.name;
    });

    this.animator = new NPCAnimator(this.mesh, this.motionProfile);
    this.wander = new NPCWander(this.mesh, this.position, this.motionProfile, this.animator, this.id);
  }

  /** Force immediate ground snapping. Useful during initialization. */
  snapToGround(getHeightAt: (x: number, z: number) => number): void {
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
    if (this.questMarker?.sprite.visible) this.questMarker.update(delta);
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
    if (this.wanderRadius <= 0) return;
    const waterHoverY = Water.LEVEL
      + this.waterHoverHeight
      + Math.sin(this.waterHoverPhase) * this.waterHoverAmplitude;
    this.wander.update(delta, getHeightAt, collisionSystem, this.wanderRadius, this.homePosition, waterHoverY);
  }

  walkToPlayer(playerPosition: THREE.Vector3): void {
    this.wander.walkTo(playerPosition);
  }

  updateApproachTarget(playerPosition: THREE.Vector3): void {
    this.wander.updateApproachTarget(playerPosition);
  }

  resumeWander(): void {
    this.wander.resumeWander();
  }

  /**
   * Show the '!' marker only while this NPC has a quest the player hasn't taken
   * or finished yet. No-op for non-givers. `activeIds`/`completedIds` are the
   * player's active + completed quest id sets.
   */
  applyQuestState(activeIds: ReadonlySet<string>, completedIds: ReadonlySet<string>): void {
    if (!this.questMarker) return;
    const taken = this.questIds.some((q) => activeIds.has(q) || completedIds.has(q));
    this.questMarker.sprite.visible = !taken;
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
