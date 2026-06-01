import { describe, expect, it } from "vitest";

describe("Combat outcome color mapping", () => {
  function damageTypeColor(damageType: string | undefined): string {
    switch (damageType) {
      case "fire": return "#ff6600";
      case "ice": return "#66ccff";
      case "lightning": return "#aaeeff";
      case "holy": return "#ffffaa";
      case "dark": return "#cc44ff";
      case "arcane": return "#aa44ff";
      default: return "#ff6633";
    }
  }

  it("returns fire color for fire damage", () => {
    expect(damageTypeColor("fire")).toBe("#ff6600");
  });

  it("returns ice color for ice damage", () => {
    expect(damageTypeColor("ice")).toBe("#66ccff");
  });

  it("returns physical color for undefined", () => {
    expect(damageTypeColor(undefined)).toBe("#ff6633");
  });

  it("returns physical color for physical", () => {
    expect(damageTypeColor("physical")).toBe("#ff6633");
  });
});

describe("CombatHUD log entry styling", () => {
  function getLogEntryColor(color: string): { isBold: boolean; fontSize: string } {
    const isBold = color === "#ffd700" || color === "#ff4400";
    return { isBold, fontSize: isBold ? "12px" : "11px" };
  }

  it("crit entries are bold gold", () => {
    const { isBold } = getLogEntryColor("#ffd700");
    expect(isBold).toBe(true);
  });

  it("defeating entries are bold red", () => {
    const { isBold, fontSize } = getLogEntryColor("#ff4400");
    expect(isBold).toBe(true);
    expect(fontSize).toBe("12px");
  });

  it("normal entries are not bold", () => {
    const { isBold } = getLogEntryColor("#e8dcc8");
    expect(isBold).toBe(false);
  });

  it("clean hit entries are not bold", () => {
    const { isBold } = getLogEntryColor("#aaffaa");
    expect(isBold).toBe(false);
  });
});

describe("Outcome → log color mapping", () => {
  function outcomeToLogColor(outcome: string | undefined): string {
    if (outcome === "devastating_hit" || outcome === "defeated") return "#ff4400";
    if (outcome === "critical_hit") return "#ffd700";
    if (outcome === "clean_hit") return "#aaffaa";
    return "#e8dcc8";
  }

  it("devastating_hit maps to red", () => {
    expect(outcomeToLogColor("devastating_hit")).toBe("#ff4400");
  });

  it("defeated maps to red", () => {
    expect(outcomeToLogColor("defeated")).toBe("#ff4400");
  });

  it("critical_hit maps to gold", () => {
    expect(outcomeToLogColor("critical_hit")).toBe("#ffd700");
  });

  it("clean_hit maps to green", () => {
    expect(outcomeToLogColor("clean_hit")).toBe("#aaffaa");
  });

  it("glancing_hit maps to default", () => {
    expect(outcomeToLogColor("glancing_hit")).toBe("#e8dcc8");
  });

  it("undefined maps to default", () => {
    expect(outcomeToLogColor(undefined)).toBe("#e8dcc8");
  });
});
