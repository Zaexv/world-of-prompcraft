/**
 * RichTextFormatter - Utility for parsing roleplay actions and markdown-style highlights.
 */
export interface FormattedResult {
  html: string;
  actions: string[];
  cleanText: string;
}

export class RichTextFormatter {
  /**
   * Parses text for *actions* and **highlights**.
   * Returns HTML-safe string with <span> tags and a list of found actions.
   */
  public static format(text: string): FormattedResult {
    const actions: string[] = [];

    const pushAction = (raw: string): void => {
      const action = raw.trim().toLowerCase();
      if (action) actions.push(action);
    };

    // 1. Escape HTML first to prevent XSS
    let escaped = this.escapeHtml(text);

    // 2. Extract and format actions from <emote> tags (e.g. <emote>wave</emote>)
    const tagRegex = /&lt;emote&gt;([^&]+)&lt;\/emote&gt;/g;
    escaped = escaped.replace(tagRegex, (_match, actionName) => {
      pushAction(actionName);
      return `<span class="chat-action">${actionName}</span>`;
    });

    // 3. Format highlights (**text**) BEFORE single-asterisk actions, otherwise
    //    the *action* regex eats the inner `*important*` of `**important**`,
    //    breaking emphasis and firing a bogus emote for every highlighted word.
    const highlightRegex = /\*\*([^*]+)\*\*/g;
    escaped = escaped.replace(highlightRegex, (_match, content) =>
      `<span class="chat-highlight">${content}</span>`,
    );

    // 4. Extract and format roleplay actions (*waves*). Highlights are already
    //    consumed above, so any remaining single-asterisk pair is an action.
    const actionRegex = /\*([a-zA-Z0-9\s_-]+)\*/g;
    escaped = escaped.replace(actionRegex, (_match, actionName) => {
      pushAction(actionName);
      return `<span class="chat-action">*${actionName}*</span>`;
    });

    // 5. Clean text: strip markup (highlights, action asterisks, emote tags).
    const cleanText = text
      .replace(/<emote>([^<]+)<\/emote>/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1');

    return {
      html: escaped,
      actions,
      cleanText,
    };
  }

  private static escapeHtml(str: string): string {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
  }
}
