/**
 * Pure mapping from a relationship score (−100..100) to its UI band:
 * label, text color, progress-bar fill color, and fill percentage.
 *
 * Kept free of DOM so it can be unit-tested and reused (InteractionPanel,
 * Nameplate). The persisted per-(npc, player) score drives this.
 */

export interface RelationshipBand {
  label: string;
  /** Text color for the label. */
  color: string;
  /** Progress-bar fill color. */
  fill: string;
  /** Fill width 0..100 (score mapped from −100..100). */
  pct: number;
}

export function relationshipBand(score: number): RelationshipBand {
  const pct = Math.max(0, Math.min(100, (score + 100) / 2));
  const fill = score < -30 ? "#cc2222" : score < 10 ? "#ccaa22" : "#22cc44";

  let label: string;
  let color: string;
  if (score <= -50) {
    label = "ENEMY";
    color = "#cc4444";
  } else if (score <= -10) {
    label = "WARY";
    color = "#cc8844";
  } else if (score <= 10) {
    label = "STRANGER";
    color = "rgba(197,165,90,0.6)";
  } else if (score <= 50) {
    label = "FRIEND";
    color = "#88cc44";
  } else {
    label = "ALLY";
    color = "#44cc44";
  }

  return { label, color, fill, pct };
}
