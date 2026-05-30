import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { NPCAnimator } from './NPCAnimator';
import { createNPCMotionProfile, type NPCMotionProfile, type NPCMotionSource } from './NPCMotion';
import { addOutlineShell } from './ModelStyling';
import { Nameplate } from '../ui/Nameplate';
import { ActionIcon } from '../ui/ActionIcon';
import { getNPCModelPath, getNPCPlaceholderStyle, type NPCPlaceholderStyle } from './NPCModels';
import { buildProceduralMesh, getPlaceholderAppearance } from './NPCAppearance';
import { addPlaceholderAccessory, addNPCVisualOutline, applyFlatShading } from './NPCAccessories';
import { NPCWander } from './NPCWander';
import type { AssetLoader } from '../utils/asset/AssetLoader';
import { Water } from '../scene/Water';

export interface NPCConfig {
  id: string;
  name: string;
  position: THREE.Vector3;
  color?: number;
  behavior?: NPCMotionSource['behavior'];
  movementStyle?: NPCMotionSource['movementStyle'];
  wanderRadius?: number;
  hp?: number;
  maxHp?: number;
  personality?: string;
  personalityKey?: string;
  scale?: number;
  mood?: string;
  relationshipScore?: number;
  personalityNotes?: string;
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

  public homePosition: THREE.Vector3;
  public wanderRadius = 8;
  public isGrounded = false;

  private readonly motionProfile: NPCMotionProfile;
  private readonly placeholderStyle: NPCPlaceholderStyle;
  private readonly wander: NPCWander;
  private waterHoverPhase = Math.random() * Math.PI * 2;
  private readonly waterHoverHeight = 0.9;
  private readonly waterHoverAmplitude = 0.08;

  private materials: THREE.MeshStandardMaterial[] = [];
  private originalEmissives: number[] = [];
  private gltfMode = false;

  constructor(config: NPCConfig) {
    this.id = config.id;
    this.name = config.name;
    this.personalityKey = config.personalityKey ?? '';
    this.position = config.position.clone();
    this.homePosition = config.position.clone();
    this.motionProfile = createNPCMotionProfile(config);
    this.placeholderStyle = getNPCPlaceholderStyle(config.id, config.name, config.behavior);
    this.wanderRadius = config.wanderRadius ?? this.motionProfile.wanderRadius;
    this.mesh = new THREE.Group();
    if (config.scale) this.mesh.scale.setScalar(config.scale);

    const appearance = getPlaceholderAppearance(this.placeholderStyle);
    this.materials = buildProceduralMesh(this.mesh, appearance, this.placeholderStyle);

    addPlaceholderAccessory(this.mesh, this.placeholderStyle);
    applyFlatShading(this.mesh);
    addNPCVisualOutline(this.mesh, this.placeholderStyle);

    this.nameplate = new Nameplate(this.name);
    this.mesh.add(this.nameplate.sprite);

    this.actionIcon = new ActionIcon();
    this.mesh.add(this.actionIcon.sprite);

    this.mesh.traverse((child) => {
      child.userData.npcId = this.id;
      child.userData.npcName = this.name;
    });

    this.mesh.position.copy(this.position);
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

  static create(config: NPCConfig, assetLoader?: AssetLoader): NPC {
    const npc = new NPC(config);
    if (assetLoader) {
      const modelPath = getNPCModelPath(config.id, config.name, config.behavior);
      if (modelPath) {
        assetLoader.loadGLTF(modelPath)
          .then((gltf) => npc.replaceWithGLTF(gltf))
          .catch(() => { /* keep procedural mesh silently */ });
      }
    }
    return npc;
  }

  private replaceWithGLTF(gltf: GLTF): void {
    const toRemove = this.mesh.children.filter((child) => !(child instanceof THREE.Sprite));
    for (const child of toRemove) this.mesh.remove(child);

    const gltfScene = gltf.scene.clone();
    const box = new THREE.Box3().setFromObject(gltfScene);
    const size = new THREE.Vector3();
    box.getSize(size);
    const scale = 2.5 / Math.max(size.y, 0.001);
    gltfScene.scale.setScalar(scale);
    gltfScene.position.y = -box.min.y * scale;

    gltfScene.traverse((child) => {
      child.userData.npcId = this.id;
      child.userData.npcName = this.name;
      if (child instanceof THREE.Mesh) child.castShadow = true;
    });

    this.mesh.add(gltfScene);
    this.materials = [];
    this.originalEmissives = [];
    this.gltfMode = true;
    addOutlineShell(gltfScene, { scale: 1.03, opacity: 0.85 });

    if (gltf.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(gltfScene);
      this.animator.setMixer(mixer, gltf.animations);
    }
  }

  private collectStdMaterials(): THREE.MeshStandardMaterial[] {
    const result: THREE.MeshStandardMaterial[] = [];
    this.mesh.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (mat instanceof THREE.MeshStandardMaterial) result.push(mat);
        }
      }
    });
    return result;
  }

  update(delta: number): void {
    this.waterHoverPhase += delta * 1.7;
    this.animator.update(delta);
    this.actionIcon.update(delta);
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

  playEmote(emote: string): void {
    this.animator.play(emote);
    this.actionIcon.displayAction(emote, 2.5);
  }

  showAction(actionKind: string, duration = 3.0): void {
    this.actionIcon.displayAction(actionKind, duration);
  }

  dispose(): void {
    // Only dispose unique per-instance assets.
    // Shared NPC geometries and materials are kept in a global cache (NPCAppearance.ts).
    
    if (this.gltfMode) {
      // GLTF models are currently unique per NPC because they are cloned.
      this.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            for (const mat of child.material) mat.dispose();
          } else {
            child.material.dispose();
          }
        }
      });
    }

    this.nameplate.sprite.material.dispose();
    if (this.nameplate.sprite.material instanceof THREE.SpriteMaterial && this.nameplate.sprite.material.map) {
      this.nameplate.sprite.material.map.dispose();
    }
    this.actionIcon.sprite.material.dispose();
    if (this.actionIcon.sprite.material instanceof THREE.SpriteMaterial && this.actionIcon.sprite.material.map) {
      this.actionIcon.sprite.material.map.dispose();
    }
  }

  setHighlight(on: boolean): void {
    const mats = this.gltfMode ? this.collectStdMaterials() : this.materials;
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
