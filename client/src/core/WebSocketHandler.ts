import * as THREE from 'three';
import type { AgentResponse, RemotePlayerData } from '../network/MessageProtocol';
import type { EntityManager } from '../entities/EntityManager';
import type { UIManager } from '../ui/UIManager';
import type { PlayerState } from '../state/PlayerState';
import type { NPCStateStore } from '../state/NPCState';
import type { ReactionSystem } from '../systems/ReactionSystem';
import type { WorldBuilderPanel } from '../ui/WorldBuilderPanel';
import type { PlayerController } from '../entities/PlayerController';
import type { LoginScreen } from '../ui/LoginScreen';
import { DamagePopup } from '../ui/DamagePopup';
import type { RuntimeState } from './RuntimeState';

interface LoadingOverlay { hide(): void }

export interface WSHandlerDeps {
  runtime: RuntimeState;
  entityManager: EntityManager;
  uiManager: UIManager;
  playerState: PlayerState;
  npcStateStore: NPCStateStore;
  reactionSystem: ReactionSystem;
  worldBuilderPanel: WorldBuilderPanel;
  playerController: PlayerController;
  camera: THREE.PerspectiveCamera;
  scene: THREE.Scene;
  loginScreen: LoginScreen;
  loadingOverlay: LoadingOverlay;
  username: string;
  npcNameMap: Map<string, string>;
  HOSTILE_NPCS: ReadonlySet<string>;
  startIntroCinematic: () => void;
  spawnChatBubble: (text: string, parent?: THREE.Object3D, style?: 'player' | 'npc' | 'system', name?: string) => void;
}

export class WebSocketHandler {
  constructor(private readonly d: WSHandlerDeps) {}

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle(data: any): void {
    if (data.type === 'join_ok') {
      this.d.runtime.localPlayerId = data.playerId as string;
      this.d.runtime.joinedServer = true;
      this.d.playerState.playerId = data.playerId as string;

      try {
        this.d.uiManager.chatPanel.addSystemMessage(`Welcome to World of Promptcraft, ${this.d.username}!`);

        if (data.players) {
          for (const p of data.players) {
            if (p.playerId !== this.d.runtime.localPlayerId) {
              try {
                this.d.entityManager.addRemotePlayer(p);
              } catch (err) {
                console.error('join_ok: failed to add remote player', p.playerId, err);
              }
            }
          }
        }

        if (data.npcs) {
          console.info(`Received ${data.npcs.length} NPCs from server.`);
          for (const n of data.npcs) {
            const id = n.npc_id || n.id;
            const pos = n.position;

            if (!id || !pos || !Array.isArray(pos) || pos.length < 3) {
              console.warn('Skipping invalid NPC data (missing id or position array):', n);
              continue;
            }

            this.d.npcNameMap.set(id, n.name);

            try {
              this.d.entityManager.addNPC({
                id,
                name: n.name,
                position: new THREE.Vector3(pos[0], pos[1], pos[2]),
                hp: n.hp,
                maxHp: n.maxHp,
                personality: n.personality,
                scale: n.scale,
              });
            } catch (err) {
              console.error(`join_ok: failed to spawn NPC ${n.name} (${id}):`, err);
            }

            this.d.npcStateStore.updateState(id, {
              name: n.name,
              hp: n.hp,
              maxHp: n.maxHp,
              personality: n.personality,
              scale: n.scale,
              mood: n.mood,
            });
          }
        } else {
          console.warn('No NPCs received in join_ok message.');
        }
      } catch (err) {
        console.error('join_ok: unexpected error during world setup:', err);
      } finally {
        this.d.loginScreen.hide();
        this.d.loadingOverlay.hide();
        this.d.startIntroCinematic();
      }
      return;
    }

    if (data.type === 'join_error') {
      this.d.loadingOverlay.hide();
      this.d.loginScreen.showError(data.message as string);
      return;
    }

    if (data.type === 'player_joined') {
      if (data.player.playerId !== this.d.runtime.localPlayerId) {
        this.d.entityManager.addRemotePlayer(data.player);
        this.d.uiManager.chatPanel.addSystemMessage(`${data.player.username} has joined the world.`);
      }
      return;
    }

    if (data.type === 'player_left') {
      const remote = this.d.entityManager.getRemotePlayer(data.playerId as string);
      const leftName = remote?.username ?? (data.playerId as string);
      this.d.entityManager.removeRemotePlayer(data.playerId as string);
      this.d.uiManager.chatPanel.addSystemMessage(`${leftName} has left the world.`);
      return;
    }

    if (data.type === 'world_update') {
      const others = (data.players as RemotePlayerData[]).filter(
        p => p.playerId !== this.d.runtime.localPlayerId,
      );
      this.d.entityManager.updateRemotePlayers(others);
      return;
    }

    if (data.type === 'chat_broadcast') {
      this.d.uiManager.chatPanel.addMessage(data.sender as string, data.text as string);
      const remote = this.d.entityManager.getRemotePlayer(data.sender as string);
      if (remote) {
        this.d.spawnChatBubble(data.text as string, remote.group, 'player', data.sender as string);
      } else if (data.position) {
        const pos = new THREE.Vector3(data.position[0], data.position[1], data.position[2]);
        const tmpObj = new THREE.Object3D();
        tmpObj.position.copy(pos);
        this.d.scene.add(tmpObj);
        this.d.spawnChatBubble(data.text as string, tmpObj, 'player', data.sender as string);
        setTimeout(() => this.d.scene.remove(tmpObj), 8000);
      } else {
        this.d.spawnChatBubble(data.text as string, undefined, 'player', data.sender as string);
      }
      return;
    }

    if (data.type === 'npc_dialogue') {
      if (data.npcName) {
        this.d.uiManager.chatPanel.addMessage(data.npcName as string, data.dialogue as string, '#c5a55a');
        const npc = this.d.entityManager.getNPC(data.npcId as string);
        this.d.spawnChatBubble(data.dialogue as string, npc?.mesh, 'npc', data.npcName as string);
      } else {
        this.d.uiManager.chatPanel.addMessage(data.speakerPlayer as string, data.dialogue as string);
        const remote = this.d.entityManager.getRemotePlayer(data.speakerPlayer as string);
        this.d.spawnChatBubble(data.dialogue as string, remote?.group, 'player', data.speakerPlayer as string);
      }
      return;
    }

    if (data.type === 'npc_actions') {
      this.d.reactionSystem.handleResponse({
        type: 'agent_response', npcId: data.npcId as string, dialogue: '',
        actions: (data.actions as AgentResponse['actions']) ?? [],
        npcStateUpdate: data.npcStateUpdate ?? undefined,
        playerStateUpdate: undefined,
      } as AgentResponse);
      return;
    }

    if (data.type === 'error') {
      const errorMsg: string = (data.message as string) ?? 'An unknown error occurred.';
      console.warn(`[Server Error] ${errorMsg}`);
      if (this.d.runtime.activeNpcId) {
        this.d.uiManager.interactionPanel.hideThinking();
        this.d.uiManager.interactionPanel.addMessage('system', `Error: ${errorMsg}`);
      }
      this.d.uiManager.chatPanel.addSystemMessage(`Server error: ${errorMsg}`);
      return;
    }

    if (data.type === 'agent_response') {
      const response = data as AgentResponse;
      const isActiveNpc = response.npcId === this.d.runtime.activeNpcId;

      if (isActiveNpc) {
        this.d.uiManager.interactionPanel.hideThinking();
        this.d.uiManager.interactionPanel.addMessage('npc', response.dialogue);
      }

      const respondingNpc = this.d.entityManager.getNPC(response.npcId);
      if (respondingNpc) {
        respondingNpc.actionIcon.hide();
        this.d.spawnChatBubble(response.dialogue, respondingNpc.mesh, 'npc');
      }

      const chatNpcName =
        this.d.npcNameMap.get(response.npcId) ??
        this.d.entityManager.getNPC(response.npcId)?.name ??
        response.npcId;
      this.d.uiManager.chatPanel.addMessage(chatNpcName, response.dialogue, '#c5a55a');
      this.d.reactionSystem.handleResponse(response);

      if (isActiveNpc && this.d.uiManager.combatHUD.isVisible) {
        this.d.uiManager.combatHUD.updatePlayerHP(this.d.playerState.hp, this.d.playerState.maxHp);
        this.d.uiManager.combatHUD.updatePlayerMana(this.d.playerState.mana, this.d.playerState.maxMana);
        if (response.npcStateUpdate) {
          this.d.uiManager.combatHUD.updateNpcHP(
            response.npcStateUpdate.hp ?? 100,
            response.npcStateUpdate.maxHp ?? 100,
          );
        }
      }

      if (isActiveNpc && response.npcStateUpdate) {
        const mood = response.npcStateUpdate.mood ?? 'neutral';
        const relScore = response.npcStateUpdate.relationship_score ?? 0;
        this.d.uiManager.interactionPanel.updateMoodStatus(mood, relScore);
      }

      const npcName =
        this.d.npcNameMap.get(response.npcId) ??
        this.d.entityManager.getNPC(response.npcId)?.name ??
        response.npcId;
      const logCombat = (msg: string, color: string) => {
        if (this.d.uiManager.combatHUD.isVisible) {
          this.d.uiManager.combatHUD.addLogEntry(msg, color);
        } else {
          this.d.uiManager.addCombatLog(msg, color);
        }
      };

      for (const action of response.actions) {
        if (action.kind === 'damage') {
          const target = action.params.target ?? 'player';
          const amount = action.params.amount ?? 0;
          const damageType = action.params.damageType ?? 'physical';
          if (target === 'player') {
            logCombat(`${npcName} deals ${amount} ${damageType} damage!`, '#ff4444');
            const playerPos = new THREE.Vector3(
              this.d.playerController.position.x,
              this.d.playerController.position.y + 2.5,
              this.d.playerController.position.z,
            );
            const screenPos = DamagePopup.worldToScreen(playerPos, this.d.camera, window.innerWidth, window.innerHeight);
            if (screenPos) {
              this.d.uiManager.spawnDamagePopup(screenPos.x, screenPos.y, `-${amount}`, '#ff4444', amount >= 30);
            }
          } else {
            logCombat(`You strike ${npcName} for ${amount} damage!`, '#ffffff');
            const targetNpc = this.d.entityManager.getNPC(target);
            if (targetNpc) {
              const npcPos = targetNpc.mesh.position.clone();
              npcPos.y += 3;
              const screenPos = DamagePopup.worldToScreen(npcPos, this.d.camera, window.innerWidth, window.innerHeight);
              if (screenPos) {
                this.d.uiManager.spawnDamagePopup(screenPos.x, screenPos.y, `-${amount}`, '#ff6633', amount >= 30);
              }
            }
          }
        } else if (action.kind === 'heal') {
          const amount = action.params.amount ?? 0;
          logCombat(`Healed for ${amount} HP`, '#44ff44');
          const playerPos = new THREE.Vector3(
            this.d.playerController.position.x,
            this.d.playerController.position.y + 2.5,
            this.d.playerController.position.z,
          );
          const screenPos = DamagePopup.worldToScreen(playerPos, this.d.camera, window.innerWidth, window.innerHeight);
          if (screenPos) {
            this.d.uiManager.spawnDamagePopup(screenPos.x, screenPos.y, `+${amount}`, '#44ff44');
          }
        } else if (action.kind === 'give_item') {
          logCombat(`Received: ${action.params.item ?? 'Unknown Item'}`, '#c5a55a');
        } else if (action.kind === 'start_quest') {
          const quest = action.params.quest ?? action.params.questName ?? 'Unknown Quest';
          logCombat(`Quest Started: ${quest}`, '#c5a55a');
        } else if (action.kind === 'complete_quest') {
          const quest = action.params.questName ?? action.params.questId ?? 'Unknown Quest';
          logCombat(`Quest Complete: ${quest}`, '#c5a55a');
        } else if (action.kind === 'advance_objective') {
          logCombat(`Objective Complete: ${action.params.objectiveId ?? 'objective'}`, '#c5a55a');
        } else if (action.kind === 'emote') {
          logCombat(`${npcName} performs ${action.params.animation ?? 'gesture'}`, '#aaaaaa');
        }
      }
      return;
    }

    if (data.type === 'quest_update') {
      this.d.reactionSystem.handleResponse({
        type: 'agent_response', npcId: '', dialogue: '',
        actions: data.actions || [],
        playerStateUpdate: data.playerStateUpdate,
      });
      return;
    }

    if (data.type === 'use_item_result' && data.success) {
      const serverUpdate = data.playerStateUpdate;
      const safeUpdate = serverUpdate ? { ...serverUpdate } : undefined;
      if (safeUpdate) delete safeUpdate.inventory;
      this.d.reactionSystem.handleResponse({
        type: 'agent_response', npcId: '', dialogue: '',
        actions: data.actions || [],
        playerStateUpdate: safeUpdate,
      });
      const itemMessage: string = data.message ?? '';
      if (itemMessage) {
        this.d.uiManager.addCombatLog(itemMessage, '#44ff44');
        if (this.d.uiManager.combatHUD.isVisible) {
          this.d.uiManager.combatHUD.addLogEntry(itemMessage, '#44ff44');
        }
      }
      return;
    }

    if (data.type === 'world_modify_response') {
      this.d.worldBuilderPanel.setResponse(data.dialogue ?? '');
      this.d.worldBuilderPanel.setReady();
      this.d.reactionSystem.processActions(data.actions ?? []);
      return;
    }

    if (data.type === 'world_modify_start') {
      this.d.worldBuilderPanel.startStreaming(data.blueprintId, data.totalChunks);
      return;
    }

    if (data.type === 'world_modify_chunk') {
      this.d.worldBuilderPanel.updateStreaming(data.blueprintId, data.chunkIndex, data.data);
      return;
    }

    if (data.type === 'world_modify_end') {
      this.d.worldBuilderPanel.endStreaming(data.blueprintId);
      return;
    }
  }
}

