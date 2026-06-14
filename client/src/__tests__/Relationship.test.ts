import { describe, expect, it } from "vitest";
import { relationshipBand } from "../ui/relationship";

describe("relationshipBand", () => {
  it("maps score to the correct label band", () => {
    expect(relationshipBand(-100).label).toBe("ENEMY");
    expect(relationshipBand(-50).label).toBe("ENEMY");
    expect(relationshipBand(-30).label).toBe("WARY");
    expect(relationshipBand(-10).label).toBe("WARY");
    expect(relationshipBand(0).label).toBe("STRANGER");
    expect(relationshipBand(10).label).toBe("STRANGER");
    expect(relationshipBand(40).label).toBe("FRIEND");
    expect(relationshipBand(50).label).toBe("FRIEND");
    expect(relationshipBand(80).label).toBe("ALLY");
    expect(relationshipBand(100).label).toBe("ALLY");
  });

  it("maps score to a 0..100 fill percentage", () => {
    expect(relationshipBand(-100).pct).toBe(0);
    expect(relationshipBand(0).pct).toBe(50);
    expect(relationshipBand(100).pct).toBe(100);
  });

  it("clamps out-of-range scores", () => {
    expect(relationshipBand(-999).pct).toBe(0);
    expect(relationshipBand(999).pct).toBe(100);
  });

  it("picks fill color by hostility threshold", () => {
    expect(relationshipBand(-40).fill).toBe("#cc2222");
    expect(relationshipBand(0).fill).toBe("#ccaa22");
    expect(relationshipBand(20).fill).toBe("#22cc44");
  });
});
