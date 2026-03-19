/**
 * Prevents chat bubble overlap by adjusting their screen positions.
 * When bubbles are too close on screen, offsets them vertically.
 */

interface BubbleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Given a list of active bubble screen positions and sizes,
 * adjust Y positions so no two bubbles overlap.
 *
 * @param bubbles - Array of { x, y, width, height } for each active bubble
 * @param minGap - Minimum vertical gap between bubbles in pixels
 * @returns Adjusted Y positions array
 */
export function resolveOverlaps(bubbles: BubbleRect[], minGap = 8): number[] {
  if (bubbles.length === 0) return [];

  // Sort by Y position (topmost first)
  const indexed = bubbles.map((b, i) => ({ ...b, index: i }));
  indexed.sort((a, b) => a.y - b.y);

  const adjustedY = new Array<number>(bubbles.length);
  for (const b of indexed) {
    adjustedY[b.index] = b.y;
  }

  // Push overlapping bubbles upward
  for (let i = 1; i < indexed.length; i++) {
    const prev = indexed[i - 1];
    const curr = indexed[i];

    // Check horizontal proximity (only stack if X positions are close)
    const xDist = Math.abs(prev.x - curr.x);
    if (xDist > 200) continue; // Too far apart horizontally, no overlap

    const prevBottom = adjustedY[prev.index] + prev.height + minGap;
    if (adjustedY[curr.index] < prevBottom) {
      adjustedY[curr.index] = prevBottom;
    }
  }

  return adjustedY;
}

/**
 * Check if two screen rectangles overlap.
 */
export function rectsOverlap(a: BubbleRect, b: BubbleRect, margin = 0): boolean {
  return !(
    a.x + a.width + margin < b.x ||
    b.x + b.width + margin < a.x ||
    a.y + a.height + margin < b.y ||
    b.y + b.height + margin < a.y
  );
}
