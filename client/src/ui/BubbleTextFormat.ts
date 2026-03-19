/**
 * Text formatting utilities for chat bubbles.
 */

/** Maximum characters before truncation. */
const MAX_CHARS = 120;

/** Maximum lines to display. */
const MAX_LINES = 3;

/**
 * Escape HTML special characters to prevent injection.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Format text for bubble display:
 * - Escape HTML
 * - Truncate if too long
 * - Limit line count
 */
export function formatBubbleText(text: string): string {
  let cleaned = text.trim();

  // Truncate very long messages
  if (cleaned.length > MAX_CHARS) {
    cleaned = cleaned.substring(0, MAX_CHARS - 3) + '...';
  }

  // Limit lines
  const lines = cleaned.split('\n');
  if (lines.length > MAX_LINES) {
    cleaned = lines.slice(0, MAX_LINES).join('\n') + '...';
  }

  return escapeHtml(cleaned);
}

/**
 * Format a bubble with an optional sender name prefix.
 * Returns HTML string with the name bolded and colored.
 */
export function formatBubbleWithSender(
  text: string,
  senderName?: string,
  nameColor = '#88bbff',
): string {
  const formattedText = formatBubbleText(text);
  if (!senderName) return formattedText;

  const escapedName = escapeHtml(senderName);
  return `<span class="cb-name" style="color: ${nameColor}">${escapedName}:</span> ${formattedText}`;
}
