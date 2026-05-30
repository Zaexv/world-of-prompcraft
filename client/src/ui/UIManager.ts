import { AudioSystem } from "../audio/AudioSystem";
import { InteractionPanel } from "./InteractionPanel";
import { InventoryPanel } from "./InventoryPanel";
import { StatusBars } from "./StatusBars";
import { CombatHUD } from "./CombatHUD";
import { CombatLog } from "./CombatLog";
import { DamagePopup } from "./DamagePopup";
import { ItemUseEffect } from "./ItemUseEffect";
import { DeathScreen } from "./DeathScreen";
import { Minimap } from "./Minimap";
import { MinimapWidget } from "./MinimapWidget";
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
  readonly minimapWidget: MinimapWidget;
  readonly questLog: QuestLog;
  readonly questTracker: QuestTracker;
  readonly zoneDisplay: ZoneDisplay;
  readonly chatPanel: ChatPanel;
  bubbleSystem: ChatBubbleSystem | null = null;
  private _playerState: PlayerState | null = null;
  /** Wire this to WorldBuilderPanel.toggle() from GameBootstrapper. */
  worldBuilderToggle: (() => void) | null = null;

  constructor() {
    this.injectGlobalStyles();

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

    this.minimapWidget = new MinimapWidget();
    this.container.appendChild(this.minimapWidget.element);

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

    this.buildShortcutBar();
  }

  private buildShortcutBar(): void {
    const bar = document.createElement('div');
    Object.assign(bar.style, {
      position: 'absolute',
      bottom: '12px',
      left: '50%',
      transform: 'translateX(-50%)',
      display: 'flex',
      gap: '4px',
      pointerEvents: 'none',
      zIndex: '15',
    } as CSSStyleDeclaration);

    const btnDefs: Array<{ label: string; key: string; action: () => void }> = [
      { label: 'Bag',    key: 'I', action: () => this.toggleInventory() },
      { label: 'Map',    key: 'M', action: () => this.toggleMinimap() },
      { label: 'Quests', key: 'L', action: () => this.toggleQuestLog(this._playerState ?? undefined) },
      { label: 'Build',  key: 'B', action: () => this.worldBuilderToggle?.() },
    ];

    for (const def of btnDefs) {
      const btn = document.createElement('button');
      btn.title = `${def.label} [${def.key}]`;

      Object.assign(btn.style, {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '5px 10px',
        background: 'rgba(8,6,18,0.85)',
        border: '1px solid rgba(197,165,90,0.35)',
        borderRadius: '4px',
        color: '#c5a55a',
        fontFamily: "'Cinzel','Times New Roman',serif",
        fontSize: '11px',
        cursor: 'pointer',
        pointerEvents: 'auto',
        userSelect: 'none',
        letterSpacing: '0.06em',
        transition: 'border-color 0.15s, background 0.15s',
        boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
      } as CSSStyleDeclaration);

      const text = document.createElement('span');
      text.textContent = def.label;

      const kbd = document.createElement('span');
      Object.assign(kbd.style, {
        fontSize: '9px',
        padding: '1px 4px',
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(197,165,90,0.2)',
        borderRadius: '2px',
        color: 'rgba(197,165,90,0.55)',
        marginLeft: '2px',
        fontFamily: 'monospace',
      } as CSSStyleDeclaration);
      kbd.textContent = def.key;

      btn.appendChild(text);
      btn.appendChild(kbd);

      btn.addEventListener('mouseenter', () => {
        btn.style.background = 'rgba(30,20,8,0.92)';
        btn.style.borderColor = 'rgba(197,165,90,0.7)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.background = 'rgba(12,8,3,0.82)';
        btn.style.borderColor = 'rgba(197,165,90,0.35)';
      });
      btn.addEventListener('click', def.action);

      bar.appendChild(btn);
    }

    this.container.appendChild(bar);
  }

  private injectGlobalStyles(): void {
    const style = document.createElement('style');
    style.textContent = `
      :root {
        --gold: #c5a55a;
        --gold-light: #e0c872;
        --gold-dim: rgba(197,165,90,0.35);
        --panel-bg: rgba(10,8,20,0.95);
        --panel-border: rgba(197,165,90,0.3);
        --text-primary: #e8dcc8;
        --text-muted: #aaaaaa;
        --health-green: #1a7a1a;
        --mana-blue: #1a3a7a;
        --danger-red: #8b0000;
      }

      /* Shared scrollbar style for all game panels */
      .ui-panel ::-webkit-scrollbar { width: 6px; height: 6px; }
      .ui-panel ::-webkit-scrollbar-track { background: rgba(0,0,0,0.3); border-radius: 3px; }
      .ui-panel ::-webkit-scrollbar-thumb { background: var(--gold); border-radius: 3px; }
      .ui-panel { scrollbar-width: thin; scrollbar-color: var(--gold) rgba(0,0,0,0.3); }

      /* Thinking-dots animation used in InteractionPanel */
      .thinking-dots span { animation: wop-dot-blink 1.4s infinite; opacity: 0; }
      .thinking-dots span:nth-child(1) { animation-delay: 0s; }
      .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }
      .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes wop-dot-blink { 0%,20% { opacity:0; } 50% { opacity:1; } 100% { opacity:0; } }
    `;
    document.head.appendChild(style);
  }

  initBubbleSystem(camera: THREE.PerspectiveCamera): void {
    this.bubbleSystem = new ChatBubbleSystem(camera, this.container);
  }

  showInteractionPanel(npcId: string, npcName: string): void {
    AudioSystem.getInstance().playSfx("ui_click");
    this.interactionPanel.show(npcId, npcName);
  }

  hideInteractionPanel(): void {
    this.interactionPanel.hide();
  }

  updateStatusBars(playerState: PlayerState): void {
    this.statusBars.update(playerState);
  }

  showInventory(): void {
    AudioSystem.getInstance().playSfx("ui_click");
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
    this.itemUseEffect.trigger(itemName, effectType);
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
    this.minimapWidget.update(playerX, playerZ, playerAngle);
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
