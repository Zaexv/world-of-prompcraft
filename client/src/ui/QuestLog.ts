import { UIComponent } from "./core/UIComponent";
import type { PlayerState } from "../state/PlayerState";
import type { ActiveQuest } from "../state/QuestDefinitions";

/**
 * WoW-style quest log overlay panel — toggled with L key.
 * Displays active and completed quests with objective tracking.
 * Extends UIComponent for consistent lifecycle management.
 */
export class QuestLog extends UIComponent {
  declare private contentContainer: HTMLDivElement;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super('ui-root', 'quest-log');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: "absolute",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "480px",
      maxHeight: "80vh",
      overflowY: "auto",
      display: "none",
      flexDirection: "column",
      background: "rgba(8, 6, 18, 0.97)",
      border: "1px solid rgba(197,165,90,0.45)",
      borderRadius: "8px",
      padding: "20px",
      pointerEvents: "auto",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      color: "#e8dcc8",
      zIndex: "500",
      userSelect: "none",
      boxShadow: "0 0 40px rgba(0,0,0,0.9), inset 0 1px 0 rgba(197,165,90,0.15)",
    } as CSSStyleDeclaration);

    // ── Header ──────────────────────────────────────────────────────────
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
      marginBottom: "16px",
    } as CSSStyleDeclaration);

    const title = document.createElement("span");
    Object.assign(title.style, {
      fontSize: "18px",
      fontWeight: "700",
      color: "#c5a55a",
      textShadow: "0 1px 3px rgba(0,0,0,0.8)",
      letterSpacing: "2px",
      textTransform: "uppercase",
    } as CSSStyleDeclaration);
    title.textContent = "Quest Log";
    header.appendChild(title);

    // Close button
    const closeBtn = document.createElement("button");
    Object.assign(closeBtn.style, {
      position: "absolute",
      right: "0",
      top: "50%",
      transform: "translateY(-50%)",
      background: "none",
      border: "1px solid rgba(197,165,90,0.4)",
      borderRadius: "4px",
      color: "#c5a55a",
      fontSize: "14px",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      cursor: "pointer",
      width: "24px",
      height: "24px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0",
      lineHeight: "1",
      pointerEvents: "auto",
    } as CSSStyleDeclaration);
    closeBtn.textContent = "X";
    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "rgba(197,165,90,0.2)";
    });
    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "none";
    });
    closeBtn.addEventListener("click", () => {
      this.hide();
    });
    header.appendChild(closeBtn);
    this.container.appendChild(header);

    // ── Content container (re-rendered on update) ───────────────────────
    this.contentContainer = document.createElement("div");
    this.container.appendChild(this.contentContainer);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  protected override onShow(): void {
    this.container.style.display = 'flex';
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.hide();
      }
    };
    window.addEventListener("keydown", this.escHandler);
  }

  protected override onHide(): void {
    if (this.escHandler) {
      window.removeEventListener("keydown", this.escHandler);
      this.escHandler = null;
    }
  }

  get element(): HTMLElement {
    return this.container;
  }

  /** Re-render quest content from current player state. */
  update(playerState: PlayerState): void {
    this.contentContainer.innerHTML = "";

    // ── Active Quests ─────────────────────────────────────────────────
    const activeHeader = this.createSectionHeader("Active Quests");
    this.contentContainer.appendChild(activeHeader);

    if (playerState.activeQuests.length === 0) {
      const empty = document.createElement("div");
      Object.assign(empty.style, {
        color: "#666",
        fontSize: "13px",
        fontStyle: "italic",
        padding: "8px 0",
      } as CSSStyleDeclaration);
      empty.textContent = "No active quests. Talk to NPCs to find adventures.";
      this.contentContainer.appendChild(empty);
    } else {
      for (const quest of playerState.activeQuests) {
        const card = this.createActiveQuestCard(quest);
        this.contentContainer.appendChild(card);
      }
    }

    // ── Completed Quests ──────────────────────────────────────────────
    const completedHeader = this.createSectionHeader(
      `Completed (${playerState.completedQuests.length})`,
    );
    completedHeader.style.marginTop = "16px";
    this.contentContainer.appendChild(completedHeader);

    if (playerState.completedQuests.length === 0) {
      const empty = document.createElement("div");
      Object.assign(empty.style, {
        color: "#555",
        fontSize: "13px",
        fontStyle: "italic",
        padding: "8px 0",
      } as CSSStyleDeclaration);
      empty.textContent = "No completed quests yet.";
      this.contentContainer.appendChild(empty);
    } else {
      for (const questId of playerState.completedQuests) {
        const card = this.createCompletedQuestCard(playerState.getQuestName(questId));
        this.contentContainer.appendChild(card);
      }
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private createSectionHeader(text: string): HTMLDivElement {
    const header = document.createElement("div");
    Object.assign(header.style, {
      fontSize: "14px",
      color: "#888",
      textTransform: "uppercase",
      letterSpacing: "2px",
      marginBottom: "10px",
      fontWeight: "700",
    } as CSSStyleDeclaration);
    header.textContent = text;
    return header;
  }

  private createActiveQuestCard(quest: ActiveQuest): HTMLDivElement {
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "rgba(197,165,90,0.08)",
      border: "1px solid rgba(197,165,90,0.15)",
      borderRadius: "4px",
      padding: "12px",
      marginBottom: "10px",
    } as CSSStyleDeclaration);

    // Quest name with star prefix
    const name = document.createElement("div");
    Object.assign(name.style, {
      color: "#c5a55a",
      fontSize: "16px",
      fontWeight: "700",
      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
    } as CSSStyleDeclaration);
    name.textContent = `\u2605 ${quest.name}`;
    card.appendChild(name);

    // Description
    const desc = document.createElement("div");
    Object.assign(desc.style, {
      color: "#aaa",
      fontSize: "13px",
      fontStyle: "italic",
      marginTop: "4px",
      lineHeight: "1.4",
    } as CSSStyleDeclaration);
    desc.textContent = quest.description;
    card.appendChild(desc);

    // Objectives
    const objList = document.createElement("div");
    Object.assign(objList.style, {
      marginTop: "8px",
    } as CSSStyleDeclaration);

    for (const obj of quest.objectives) {
      const objLine = document.createElement("div");
      Object.assign(objLine.style, {
        fontSize: "13px",
        marginTop: "3px",
        lineHeight: "1.4",
      } as CSSStyleDeclaration);

      // Show a (progress/required) counter for multi-step objectives.
      const counter = obj.required > 1 ? ` (${obj.progress}/${obj.required})` : "";
      if (obj.completed) {
        objLine.style.color = "#66cc66";
        objLine.style.textDecoration = "line-through";
        objLine.textContent = `\u25CF ${obj.description}${counter}`;
      } else {
        objLine.style.color = "#888";
        objLine.textContent = `\u25CB ${obj.description}${counter}`;
      }

      objList.appendChild(objLine);
    }
    card.appendChild(objList);

    // Reward line (gold + items)
    const rewardParts: string[] = [];
    if (quest.reward.gold > 0) rewardParts.push(`${quest.reward.gold} gold`);
    rewardParts.push(...quest.reward.items);
    if (quest.reward.xp > 0) rewardParts.push(`${quest.reward.xp} XP`);
    if (rewardParts.length > 0) {
      const rewardLine = document.createElement("div");
      Object.assign(rewardLine.style, {
        color: "#c5a55a",
        fontSize: "12px",
        marginTop: "8px",
      } as CSSStyleDeclaration);
      rewardLine.textContent = `Reward: ${rewardParts.join(", ")}`;
      card.appendChild(rewardLine);
    }

    // Giver footer
    const footer = document.createElement("div");
    Object.assign(footer.style, {
      color: "#666",
      fontSize: "12px",
      marginTop: "8px",
    } as CSSStyleDeclaration);
    footer.textContent = `Given by: ${quest.giverName}`;
    card.appendChild(footer);

    return card;
  }

  private createCompletedQuestCard(questName: string): HTMLDivElement {
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "rgba(197,165,90,0.04)",
      border: "1px solid rgba(197,165,90,0.08)",
      borderRadius: "4px",
      padding: "12px",
      marginBottom: "10px",
      opacity: "0.6",
    } as CSSStyleDeclaration);

    // Quest name with checkmark prefix
    const name = document.createElement("div");
    Object.assign(name.style, {
      color: "#c5a55a",
      fontSize: "16px",
      fontWeight: "700",
      textShadow: "0 1px 2px rgba(0,0,0,0.6)",
    } as CSSStyleDeclaration);
    name.textContent = `\u2713 ${questName}`;
    card.appendChild(name);

    return card;
  }
}
