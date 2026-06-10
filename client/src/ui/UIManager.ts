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
import { QuestLog } from "./QuestLog";
import { QuestTracker } from "./QuestTracker";
import { ZoneDisplay } from "./ZoneDisplay";
import { ChatPanel } from "./ChatPanel";
import { ChatBubbleSystem } from "./ChatBubbleSystem";
import type * as THREE from 'three';
import type { PlayerState } from "../state/PlayerState";
import { isPhone } from "../utils/DeviceDetection";

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

    const globalUi = window as unknown as Record<string, unknown>;
    globalUi["combatHUD"] = this.combatHUD;
    globalUi["damagePopup"] = this.damagePopup;

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

    this.buildShortcutBar();

    if (isPhone()) {
      this.applyMobileLayout();
    }
  }

  /**
   * Phone-only layout pass. HUD panels use fixed-pixel inline styles sized for
   * desktop; here we tag each panel root with a class and inject a stylesheet of
   * `!important` overrides (needed to beat the inline styles).
   *
   * Two groups, per the mobile design:
   *   • Non-interactive INFO panels (status, combat HUD/log, quest tracker,
   *     zone banner, minimap) are SCALED DOWN to declutter the small screen.
   *   • Interactive panels (dialogue/prompt, chat, inventory, shortcut bar) are
   *     kept at a comfortable, readable, tappable size — never shrunk.
   */
  private applyMobileLayout(): void {
    // Interactive (kept usable)
    this.interactionPanel.element.classList.add('m-interaction');
    this.chatPanel.element.classList.add('m-chat');
    this.inventoryPanel.element.classList.add('m-inventory');
    // Non-interactive info (scaled down)
    this.minimap.element.classList.add('m-minimap');
    this.combatLog.element.classList.add('m-combatlog');
    this.questTracker.element.classList.add('m-questtracker');
    this.statusBars.element.classList.add('m-status');
    this.combatHUD.element.classList.add('m-combathud');
    this.zoneDisplay.element.classList.add('m-zone');

    const style = document.createElement('style');
    style.textContent = `
      /* Stop the browser scrolling / pinch-zooming the page during play. */
      html, body { overscroll-behavior: none; touch-action: none; }

      /* iOS zooms the whole page when focusing an input whose font is < 16px.
         Force 16px on every control so the viewport stays put. */
      .is-phone input, .is-phone textarea, .is-phone select { font-size: 16px !important; }

      /* Layout is tuned for landscape phones (≈915×412). Each panel gets a
         dedicated screen zone so nothing overlaps:
           top-left = status    top-center = shortcuts   top-right = minimap
           right    = quests     bottom-left = joystick + chat
           bottom-center = dialogue   bottom-right = combat log   center = inventory */

      /* ── Top-left: status (info, scaled) ────────────────────────────────── */
      .m-status {
        transform: scale(0.7); transform-origin: top left;
        top: calc(env(safe-area-inset-top, 0px) + 6px) !important;
        left: calc(env(safe-area-inset-left, 0px) + 6px) !important;
      }

      /* ── Top-center: shortcut bar (tappable, stays centered) ─────────────── */
      .ui-shortcut-bar {
        top: calc(env(safe-area-inset-top, 0px) + 6px) !important;
        bottom: auto !important;
        gap: 6px !important;
      }
      .ui-shortcut-bar button { padding: 7px 11px !important; font-size: 12px !important; }

      /* ── Top-right: minimap (info, scaled) ──────────────────────────────── */
      .m-minimap {
        transform: scale(0.5); transform-origin: top right;
        top: calc(env(safe-area-inset-top, 0px) + 6px) !important;
        right: calc(env(safe-area-inset-right, 0px) + 6px) !important;
      }

      /* ── Right edge, below the minimap: quest tracker (info, scaled) ─────── */
      .m-questtracker {
        transform: scale(0.78); transform-origin: top right;
        top: 158px !important;
        right: calc(env(safe-area-inset-right, 0px) + 6px) !important;
      }

      /* ── Bottom-right: combat log (info, scaled, clear of shortcut bar) ──── */
      .m-combatlog {
        transform: scale(0.66); transform-origin: bottom right;
        right: calc(env(safe-area-inset-right, 0px) + 6px) !important;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 6px) !important;
      }

      /* Combat HUD drops below the shortcut bar so the two don't stack. */
      .m-combathud {
        transform: translateX(-50%) scale(0.7) !important;
        transform-origin: top center;
        top: 52px !important;
      }
      .m-zone { transform: translateX(-50%) scale(0.82) !important; transform-origin: top center; }

      /* ── Left column, under the status bars: world chat (readable) ───────── */
      /* Parked top-left (not bottom) so it never collides with the joystick or
         the dialogue panel that share the cramped bottom band. */
      .m-chat {
        width: min(42vw, 260px) !important;
        height: 28vh !important;
        top: 56px !important;
        left: calc(env(safe-area-inset-left, 0px) + 8px) !important;
        bottom: auto !important;
      }
      .m-chat, .m-chat div, .m-chat span { font-size: 13px !important; line-height: 1.4 !important; }
      .m-chat input { font-size: 16px !important; }

      /* ── Bottom-center: NPC dialogue (between joystick and combat log) ───── */
      .m-interaction {
        width: min(48vw, 460px) !important;
        height: auto !important;
        max-height: 54vh !important;
        left: 50% !important;
        right: auto !important;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 10px) !important;
      }

      /* ── Center: inventory opens as a centered modal (clears the corners) ── */
      .m-inventory {
        top: 50% !important;
        left: 50% !important;
        right: auto !important;
        bottom: auto !important;
        transform: translate(-50%, -50%) !important;
        max-width: 96vw !important;
        max-height: 88vh !important;
      }
    `;
    document.head.appendChild(style);
  }

  private buildShortcutBar(): void {
    const bar = document.createElement('div');
    bar.className = 'ui-shortcut-bar';
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

  /**
   * Single entry point for all combat/loot/quest log messages. Always writes
   * to the persistent bottom-right combat log (so its position never jumps),
   * and mirrors into the combat HUD's inline log while a fight is on screen.
   */
  logCombat(text: string, color?: string): void {
    this.combatLog.addEntry(text, color);
    if (this.combatHUD.isVisible) {
      this.combatHUD.addLogEntry(text, color);
    }
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
