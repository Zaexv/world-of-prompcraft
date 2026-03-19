import type { PlayerState } from "../state/PlayerState";
import type { ActiveQuest } from "../state/QuestDefinitions";
import { QUEST_DEFINITIONS } from "../state/QuestDefinitions";

/**
 * WoW-style quest log overlay panel — toggled with L key.
 * Displays active and completed quests with objective tracking.
 */
export class QuestLog {
  readonly element: HTMLDivElement;

  private contentContainer: HTMLDivElement;
  private escHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    // ── Root overlay ────────────────────────────────────────────────────
    this.element = document.createElement("div");
    Object.assign(this.element.style, {
      position: "fixed",
      top: "50%",
      left: "50%",
      transform: "translate(-50%, -50%)",
      width: "450px",
      maxHeight: "80vh",
      overflowY: "auto",
      display: "none",
      background: "rgba(10, 6, 2, 0.95)",
      border: "2px solid #c5a55a",
      borderRadius: "6px",
      padding: "20px",
      pointerEvents: "auto",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      color: "#e8dcc8",
      zIndex: "50",
      userSelect: "none",
      boxShadow: "0 0 30px rgba(0,0,0,0.8), inset 0 1px 0 rgba(197,165,90,0.15)",
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
    this.element.appendChild(header);

    // ── Content container (re-rendered on update) ───────────────────────
    this.contentContainer = document.createElement("div");
    this.element.appendChild(this.contentContainer);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  show(): void {
    this.element.style.display = "block";
    this.escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this.hide();
      }
    };
    window.addEventListener("keydown", this.escHandler);
  }

  hide(): void {
    this.element.style.display = "none";
    if (this.escHandler) {
      window.removeEventListener("keydown", this.escHandler);
      this.escHandler = null;
    }
  }

  toggle(): void {
    if (this.element.style.display === "none") {
      this.show();
    } else {
      this.hide();
    }
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
        const card = this.createCompletedQuestCard(questId);
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

      if (obj.completed) {
        objLine.style.color = "#66cc66";
        objLine.style.textDecoration = "line-through";
        objLine.textContent = `\u25CF ${obj.description}`;
      } else {
        objLine.style.color = "#888";
        objLine.textContent = `\u25CB ${obj.description}`;
      }

      objList.appendChild(objLine);
    }
    card.appendChild(objList);

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

  private createCompletedQuestCard(questId: string): HTMLDivElement {
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "rgba(197,165,90,0.04)",
      border: "1px solid rgba(197,165,90,0.08)",
      borderRadius: "4px",
      padding: "12px",
      marginBottom: "10px",
      opacity: "0.6",
    } as CSSStyleDeclaration);

    const def = QUEST_DEFINITIONS[questId];
    const questName = def ? def.name : questId;

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
