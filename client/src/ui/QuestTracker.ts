import { UIComponent } from "./core/UIComponent";
import type { PlayerState } from "../state/PlayerState";

/**
 * Compact always-visible quest tracker widget on the right side of the screen.
 * Shows up to 3 active quests with their incomplete objectives.
 * Hidden entirely when no quests are active.
 * Extends UIComponent for consistent lifecycle management.
 */
export class QuestTracker extends UIComponent {
  /** Fires when the user clicks a quest name — caller should open the quest log. */
  onOpenQuestLog?: () => void;

  constructor() {
    super('ui-root', 'quest-tracker');
  }

  /**
   * Render the component's DOM structure.
   * Called during initialization.
   */
  render(): void {
    Object.assign(this.container.style, {
      position: "absolute",
      top: "336px",
      right: "16px",
      width: "220px",
      background: "rgba(8,6,18,0.88)",
      border: "1px solid rgba(197,165,90,0.3)",
      borderRadius: "6px",
      padding: "10px",
      pointerEvents: "auto",
      zIndex: "20",
      fontFamily: "'Cinzel', 'Times New Roman', serif",
      userSelect: "none",
      display: "none",
    } as CSSStyleDeclaration);
  }

  /** Rebuild the tracker contents from current player state. */
  update(playerState: PlayerState): void {
    const quests = playerState.activeQuests;

    if (quests.length === 0) {
      this.container.style.display = "none";
      return;
    }

    this.container.style.display = "block";
    this.container.innerHTML = "";

    const displayed = quests.slice(0, 3);

    for (let i = 0; i < displayed.length; i++) {
      const quest = displayed[i];

      // Quest name (clickable)
      const nameEl = document.createElement("div");
      Object.assign(nameEl.style, {
        color: "#c5a55a",
        fontSize: "13px",
        fontWeight: "bold",
        cursor: "pointer",
        lineHeight: "1.3",
      } as CSSStyleDeclaration);
      nameEl.textContent = quest.name;
      nameEl.addEventListener("click", () => {
        this.onOpenQuestLog?.();
      });
      this.container.appendChild(nameEl);

      // Incomplete objectives only
      const incomplete = quest.objectives.filter((o) => !o.completed);
      for (const obj of incomplete) {
        const objEl = document.createElement("div");
        Object.assign(objEl.style, {
          color: "#999",
          fontSize: "12px",
          paddingLeft: "12px",
          marginTop: "2px",
          lineHeight: "1.3",
        } as CSSStyleDeclaration);
        const counter = obj.required > 1 ? ` (${obj.progress}/${obj.required})` : "";
        objEl.textContent = `\u25CB ${obj.description}${counter}`;
        this.container.appendChild(objEl);
      }

      // Separator between quests (not after the last one)
      if (i < displayed.length - 1) {
        const separator = document.createElement("div");
        Object.assign(separator.style, {
          borderBottom: "1px solid rgba(197, 165, 90, 0.15)",
          marginTop: "8px",
          marginBottom: "8px",
        } as CSSStyleDeclaration);
        this.container.appendChild(separator);
      }
    }
  }

  get element(): HTMLElement {
    return this.container;
  }
}
