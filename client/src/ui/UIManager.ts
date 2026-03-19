import { InteractionPanel } from "./InteractionPanel";
import { InventoryPanel } from "./InventoryPanel";
import { StatusBars } from "./StatusBars";
import { CombatHUD } from "./CombatHUD";
import { CombatLog } from "./CombatLog";
import { DamagePopup } from "./DamagePopup";
import { ItemUseEffect } from "./ItemUseEffect";
import { DeathScreen } from "./DeathScreen";
import { Minimap } from "./Minimap";
import { QuestLog } from "./QuestLog";
import { QuestTracker } from "./QuestTracker";
import { ZoneDisplay } from "./ZoneDisplay";
import { ChatPanel } from "./ChatPanel";
import { ChatBubbleSystem } from "./ChatBubbleSystem";
import type * as THREE from 'three';
import type { PlayerState } from "../state/PlayerState";

/**
 * Root UI overlay that sits on top of the Three.js canvas.
 * All child panels opt-in to pointer-events individually.
 */
export class UIManager {
  readonly container: HTMLDivElement;
  readonly interactionPanel: InteractionPanel;
  readonly inventoryPanel: InventoryPanel;
  readonly statusBars: StatusBars;
  readonly combatHUD: CombatHUD;
  readonly combatLog: CombatLog;
  readonly damagePopup: DamagePopup;
  readonly itemUseEffect: ItemUseEffect;
  readonly deathScreen: DeathScreen;
  readonly minimap: Minimap;
  readonly questLog: QuestLog;
  readonly questTracker: QuestTracker;
  readonly zoneDisplay: ZoneDisplay;
  readonly chatPanel: ChatPanel;
  bubbleSystem: ChatBubbleSystem | null = null;
  private _playerState: PlayerState | null = null;

  constructor() {
    this.container = document.createElement("div");
    this.container.id = "game-ui";
    Object.assign(this.container.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "10",
      overflow: "hidden",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
    } as CSSStyleDeclaration);

    const app = document.getElementById("app")!;
    app.appendChild(this.container);

    // ── Child components ──────────────────────────────────────────────────
    this.interactionPanel = new InteractionPanel();
    this.container.appendChild(this.interactionPanel.element);

    this.inventoryPanel = new InventoryPanel();
    this.container.appendChild(this.inventoryPanel.element);

    this.statusBars = new StatusBars();
    this.container.appendChild(this.statusBars.element);

    this.combatHUD = new CombatHUD();
    this.container.appendChild(this.combatHUD.element);

    this.combatLog = new CombatLog();
    this.container.appendChild(this.combatLog.element);

    this.damagePopup = new DamagePopup(this.container);
    this.itemUseEffect = new ItemUseEffect(this.container);

    this.deathScreen = new DeathScreen();
    this.container.appendChild(this.deathScreen.element);

    this.minimap = new Minimap();
    this.container.appendChild(this.minimap.element);

    this.questLog = new QuestLog();
    this.container.appendChild(this.questLog.element);

    this.questTracker = new QuestTracker();
    this.container.appendChild(this.questTracker.element);

    this.zoneDisplay = new ZoneDisplay();
    this.container.appendChild(this.zoneDisplay.element);

    this.chatPanel = new ChatPanel();
    this.container.appendChild(this.chatPanel.element);

    // Wire quest tracker click to open quest log
    this.questTracker.onOpenQuestLog = () => {
      if (this._playerState) {
        this.questLog.update(this._playerState);
      }
      this.questLog.show();
    };
  }

  initBubbleSystem(camera: THREE.PerspectiveCamera): void {
    this.bubbleSystem = new ChatBubbleSystem(camera, this.container);
  }

  showInteractionPanel(npcId: string, npcName: string): void {
    this.interactionPanel.show(npcId, npcName);
  }

  hideInteractionPanel(): void {
    this.interactionPanel.hide();
  }

  updateStatusBars(playerState: PlayerState): void {
    this.statusBars.update(playerState);
  }

  showInventory(): void {
    this.inventoryPanel.show();
  }

  hideInventory(): void {
    this.inventoryPanel.hide();
  }

  toggleInventory(): void {
    this.inventoryPanel.toggle();
  }

  // ── Combat HUD helpers ──────────────────────────────────────────────────

  showCombatHUD(npcId: string, npcName: string, npcHp: number, npcMaxHp: number): void {
    this.combatHUD.show(npcId, npcName, npcHp, npcMaxHp);
  }

  hideCombatHUD(): void {
    this.combatHUD.hide();
  }

  spawnDamagePopup(screenX: number, screenY: number, text: string, color: string, isCrit = false): void {
    this.damagePopup.spawn(screenX, screenY, text, color, isCrit);
  }

  showItemUseEffect(itemName: string, effectType: "heal" | "mana" | "buff"): void {
    this.itemUseEffect.show(itemName, effectType);
  }

  /** Add an entry to the always-visible combat log. */
  addCombatLog(text: string, color?: string): void {
    this.combatLog.addEntry(text, color);
  }

  // ── Death screen helpers ──────────────────────────────────────────────────

  showDeathScreen(killerName?: string): void {
    this.deathScreen.show(killerName);
  }

  hideDeathScreen(): void {
    this.deathScreen.hide();
  }

  // ── Minimap helpers ─────────────────────────────────────────────────────

  toggleMinimap(): void {
    this.minimap.toggle();
  }

  updateMinimap(playerX: number, playerZ: number, playerAngle: number): void {
    this.minimap.update(playerX, playerZ, playerAngle);
  }

  // ── Quest & Zone helpers ─────────────────────────────────────────────────

  toggleQuestLog(playerState?: PlayerState): void {
    // Ensure quest content is up-to-date before showing the panel
    if (playerState) {
      this.questLog.update(playerState);
    }
    this.questLog.toggle();
  }

  showZoneTransition(name: string, description: string): void {
    this.zoneDisplay.show(name, description);
  }

  updateQuestUI(playerState: PlayerState): void {
    this._playerState = playerState;
    this.questLog.update(playerState);
    this.questTracker.update(playerState);
  }
}
