// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import {
  applyHighlightedText,
  archetypeCategory,
  categoryForActions,
  categoryForLabel,
  highlightsFromActions,
} from "../ui/npcText";
import type { Action } from "../network/MessageProtocol";

describe("categoryForLabel", () => {
  it("classifies action-button labels", () => {
    expect(categoryForLabel("Attack")).toBe("combat");
    expect(categoryForLabel("Sell")).toBe("trade");
    expect(categoryForLabel("Heal")).toBe("heal");
    expect(categoryForLabel("Quest")).toBe("quest");
    expect(categoryForLabel("Chat")).toBe("neutral");
  });
});

describe("categoryForActions", () => {
  it("returns null when no action carries flavour", () => {
    expect(categoryForActions([{ kind: "change_weather", params: { weather: "rain" } }])).toBeNull();
    expect(categoryForActions([])).toBeNull();
  });

  it("maps a single salient action to its category", () => {
    expect(categoryForActions([{ kind: "give_item", params: { item: "Sword" } }])).toBe("trade");
    expect(categoryForActions([{ kind: "heal", params: { amount: 10, target: "player" } }])).toBe("heal");
    expect(categoryForActions([{ kind: "start_quest", params: { questName: "The Lost Ring" } }])).toBe("quest");
  });

  it("prefers combat/heal/quest over trade when several actions occur", () => {
    const actions: Action[] = [
      { kind: "give_item", params: { item: "Potion" } },
      { kind: "damage", params: { amount: 5, target: "player" } },
    ];
    expect(categoryForActions(actions)).toBe("combat");
  });
});

describe("archetypeCategory", () => {
  it("derives a baseline category from the server archetype", () => {
    expect(archetypeCategory("friendly_merchant")).toBe("trade");
    expect(archetypeCategory("friendly_healer")).toBe("heal");
    expect(archetypeCategory("quest_giver")).toBe("quest");
    expect(archetypeCategory("hostile_boss")).toBe("combat");
    expect(archetypeCategory("friendly_guide")).toBe("neutral");
    expect(archetypeCategory(undefined)).toBe("neutral");
  });
});

describe("highlightsFromActions", () => {
  it("extracts item and quest tokens, de-duplicated", () => {
    const actions: Action[] = [
      { kind: "give_item", params: { item: "Espeto de Sardinas" } },
      { kind: "give_item", params: { item: "Espeto de Sardinas" } },
      { kind: "start_quest", params: { questName: "Find the Relic" } },
    ];
    expect(highlightsFromActions(actions)).toEqual([
      { value: "Espeto de Sardinas", kind: "item" },
      { value: "Find the Relic", kind: "quest" },
    ]);
  });
});

describe("applyHighlightedText", () => {
  it("wraps recognised tokens and prices in coloured spans", () => {
    const el = document.createElement("div");
    applyHighlightedText(el, "I offer you a Magic Sword for 40 gold.", [
      { value: "Magic Sword", kind: "item" },
    ]);
    const spans = el.querySelectorAll("span");
    const texts = Array.from(spans).map((s) => s.textContent);
    expect(texts).toContain("Magic Sword");
    expect(texts).toContain("40 gold");
    // Full text is preserved when concatenating all child nodes.
    expect(el.textContent).toBe("I offer you a Magic Sword for 40 gold.");
  });

  it("is XSS-safe — markup in dialogue is never parsed as HTML", () => {
    const el = document.createElement("div");
    const malicious = 'Hi <img src=x onerror=alert(1)> there';
    applyHighlightedText(el, malicious, []);
    expect(el.querySelector("img")).toBeNull();
    expect(el.textContent).toBe(malicious);
  });

  it("falls back to plain text when there are no matches", () => {
    const el = document.createElement("div");
    applyHighlightedText(el, "Just a greeting.", []);
    expect(el.querySelectorAll("span").length).toBe(0);
    expect(el.textContent).toBe("Just a greeting.");
  });
});
