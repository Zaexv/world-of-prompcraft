import * as THREE from 'three';
import type { AgentResponse, RemotePlayerData } from '../network/MessageProtocol';
import {
  archetypeCategory,
  categoryAccent,
  categoryForActions,
  highlightsFromActions,
} from '../ui/npcText';
import type { EntityManager } from '../entities/EntityManager';
import type { UIManager } from '../ui/UIManager';
import type { PlayerState } from '../state/PlayerState';
import type { NPCStateStore } from '../state/NPCState';
import type { ReactionSystem } from '../systems/ReactionSystem';
import type { WorldBuilder } from '../systems/WorldBuilder';
import type { WorldBuilderPanel } from '../ui/WorldBuilderPanel';
import type { WorldSpawnParams, Action } from '../network/MessageProtocol';
import type { PlayerController } from '../entities/PlayerController';
import type { LoginScreen } from '../ui/LoginScreen';
import { DamagePopup } from '../ui/DamagePopup';
import type { RuntimeState } from './RuntimeState';

interface LoadingOverlay { hide(): void }

/** Talk-gesture length scaled to dialogue length, clamped to a sane range. */
function talkSeconds(dialogue: string): number {
  return Math.max(1.5, Math.min(4, dialogue.length * 0.045));
}

export interface WSHandlerDeps {
  runtime: RuntimeState;
  entityManager: EntityManager;
  uiManager: UIManager;
  playerState: PlayerState;
  npcStateStore: NPCStateStore;
  reactionSystem: ReactionSystem;
  worldBuilder: WorldBuilder;
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
  stopReconnect: () => void;
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
                behavior: n.behavior ?? undefined,
                style: n.style ?? undefined,
                appearance: n.appearance ?? undefined,
                isQuestGiver: n.isQuestGiver ?? false,
              });
            } catch (err) {
              console.error(`join_ok: failed to spawn NPC ${n.name} (${id}):`, err);
            }

            this.d.npcStateStore.updateState(id, {
              name: n.name,
              hp: n.hp,
              maxHp: n.maxHp,
              personality: n.personality,
              archetype: n.archetype,
              scale: n.scale,
              mood: n.mood,
            });
          }
        } else {
          console.warn('No NPCs received in join_ok message.');
        }

        // Player-built objects already in the shared world (placed by anyone).
        // Spawn without touching the local undo stack — these aren't our edits.
        if (Array.isArray(data.worldObjects)) {
          for (const params of data.worldObjects as WorldSpawnParams[]) {
            try {
              this.d.worldBuilder.spawnObject(params, false);
            } catch (err) {
              console.error('join_ok: failed to spawn world object', params?.objectId, err);
            }
          }
          this.d.worldBuilderPanel.refreshPlaced();
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
      // Fatal: stop the auto-reconnect loop so a rejected duplicate login
      // doesn't ping-pong reconnecting and re-triggering the error.
      this.d.stopReconnect();
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
        const archetype = this.d.npcStateStore.getState(data.npcId as string)?.personality;
        const dialogueColor = categoryAccent(archetypeCategory(archetype)).text;
        this.d.uiManager.chatPanel.addMessage(data.npcName as string, data.dialogue as string, dialogueColor);
        const npc = this.d.entityManager.getNPC(data.npcId as string);
        this.d.spawnChatBubble(data.dialogue as string, npc?.mesh, 'npc', data.npcName as string);
        npc?.playTalk(talkSeconds(data.dialogue as string));
      } else {
        this.d.uiManager.chatPanel.addMessage(data.speakerPlayer as string, data.dialogue as string);
        const remote = this.d.entityManager.getRemotePlayer(data.speakerPlayer as string);
        this.d.spawnChatBubble(data.dialogue as string, remote?.group, 'player', data.speakerPlayer as string);
      }
      return;
    }

    if (data.type === 'npc_actions') {
      const actions = (data.actions as AgentResponse['actions']) ?? [];
      this.d.reactionSystem.handleResponse({
        type: 'agent_response', npcId: data.npcId as string, dialogue: '',
        actions,
        npcStateUpdate: data.npcStateUpdate ?? undefined,
        playerStateUpdate: undefined,
      } as AgentResponse);
      // Combat log + damage-number popup for the instant hit — only for the
      // acting player's own strike (`self`), not bystander combat-sync broadcasts.
      if (data.self) {
        this.applyCombatFeedback(actions, data.npcId as string);
      }
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

      // Pick a styling category: what the NPC actually DID this turn wins; fall
      // back to its archetype so plain chit-chat still carries a baseline tint.
      const archetype = this.d.npcStateStore.getState(response.npcId)?.personality;
      const dialogueCategory =
        categoryForActions(response.actions) ?? archetypeCategory(archetype);
      const highlights = highlightsFromActions(response.actions);

      if (isActiveNpc) {
        this.d.uiManager.interactionPanel.hideThinking();
        this.d.uiManager.interactionPanel.addMessage('npc', response.dialogue, {
          category: dialogueCategory,
          highlights,
        });
      }

      const respondingNpc = this.d.entityManager.getNPC(response.npcId);
      if (respondingNpc) {
        respondingNpc.actionIcon.hide();
        this.d.spawnChatBubble(response.dialogue, respondingNpc.mesh, 'npc');
        // Talk motion sized to the line; any action gesture below overrides it.
        respondingNpc.playTalk(talkSeconds(response.dialogue));
      }

      const chatNpcName =
        this.d.npcNameMap.get(response.npcId) ??
        this.d.entityManager.getNPC(response.npcId)?.name ??
        response.npcId;
      this.d.uiManager.chatPanel.addMessage(
        chatNpcName, response.dialogue, categoryAccent(dialogueCategory).text,
      );
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

      this.applyCombatFeedback(response.actions, response.npcId);
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
        this.d.uiManager.logCombat(itemMessage, '#44ff44');
      }
      return;
    }

    if (data.type === 'world_modify_response') {
      this.d.worldBuilderPanel.setResponse(data.dialogue ?? '');
      this.d.worldBuilderPanel.setReady();
      this.d.reactionSystem.processActions(data.actions ?? []);
      this.d.worldBuilderPanel.refreshPlaced();
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

    if (data.type === 'world_objects_update') {
      // A build/remove made by another player (or our own manual edit echoed
      // back). Apply directly without touching the local undo stack.
      const actions = (data.actions as Action[]) ?? [];
      for (const action of actions) {
        if (action.kind === 'world_spawn') {
          this.d.worldBuilder.spawnObject(action.params, false);
        } else if (action.kind === 'world_remove') {
          this.d.worldBuilder.removeObject(action.params.objectId, false);
        }
      }
      this.d.worldBuilderPanel.refreshPlaced();
      return;
    }
  }

  /**
   * Combat log entries + prominent damage-number popups for a turn's actions.
   * Called from BOTH the immediate `npc_actions` message (the player's hit, so
   * the number and "You strike…" log appear instantly) and the final
   * `agent_response` (the NPC's reply). Visual-only — HP is applied elsewhere.
   */
  private applyCombatFeedback(actions: AgentResponse['actions'], npcId: string): void {
    const npcName =
      this.d.npcNameMap.get(npcId) ??
      this.d.entityManager.getNPC(npcId)?.name ??
      npcId;
    const logCombat = (msg: string, color: string) => {
      this.d.uiManager.logCombat(msg, color);
    };

    for (const action of actions) {
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
      } else if (action.kind === 'give_gold') {
        logCombat(`Looted ${action.params.amount ?? 0} gold`, '#ffcc33');
      } else if (action.kind === 'complete_purchase') {
        logCombat(
          `Bought ${action.params.item ?? 'item'} for ${action.params.price ?? 0} gold`,
          '#ffcc33',
        );
      } else if (action.kind === 'sell_item') {
        logCombat(
          `Sold ${action.params.item ?? 'item'} for ${action.params.price ?? 0} gold`,
          '#ffcc33',
        );
      } else if (action.kind === 'accept_quest' || action.kind === 'start_quest') {
        const raw = action.params.quest;
        const title =
          raw && typeof raw === 'object'
            ? String((raw as Record<string, unknown>).title ?? (raw as Record<string, unknown>).name ?? 'a quest')
            : 'a quest';
        logCombat(`Quest Started: ${title}`, '#c5a55a');
      } else if (action.kind === 'complete_quest') {
        const quest = action.params.questId ?? action.params.quest_id ?? 'Quest';
        logCombat(`Quest Complete: ${quest}`, '#c5a55a');
      } else if (action.kind === 'advance_objective') {
        logCombat(`Objective: ${action.params.description ?? action.params.objectiveId ?? 'objective'}`, '#c5a55a');
      } else if (action.kind === 'grant_xp') {
        logCombat(`Gained ${action.params.amount ?? 0} XP`, '#c5a55a');
      } else if (action.kind === 'emote') {
        logCombat(`${npcName} performs ${action.params.animation ?? 'gesture'}`, '#aaaaaa');
      }
    }
  }
}

