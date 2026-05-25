/**
 * NPCActionConfig — NPC interaction action definitions.
 *
 * Pre-defined action buttons for each NPC type, used by InteractionPanel.
 */

export interface ActionButton {
  icon: string;
  label: string;
  prompt: string;
}

export const DEFAULT_ACTIONS: ActionButton[] = [
  { icon: "🗣️", label: "Talk", prompt: "Hello, what can you tell me about this place?" },
  { icon: "⚔️", label: "Attack", prompt: "I attack you with my weapon!" },
  { icon: "🛒", label: "Trade", prompt: "Do you have anything to trade?" },
  { icon: "📜", label: "Quest", prompt: "Do you have any quests for me?" },
];

export const NPC_ACTIONS: Record<string, ActionButton[]> = {
  dragon_01: [
    { icon: "⚔️", label: "Attack", prompt: "I attack you with my weapon!" },
    { icon: "🛡️", label: "Defend", prompt: "I raise my shield and take a defensive stance" },
    { icon: "🗣️", label: "Negotiate", prompt: "I wish to negotiate peacefully with you" },
    { icon: "🏃", label: "Flee", prompt: "I turn and flee!" },
  ],
  merchant_01: [
    { icon: "🛒", label: "Browse Wares", prompt: "Show me what you have for sale" },
    { icon: "💰", label: "Sell Items", prompt: "I'd like to sell some items" },
    { icon: "🗣️", label: "Chat", prompt: "Hello, what can you tell me about this place?" },
    { icon: "📖", label: "Tell a Story", prompt: "Let me tell you an interesting story" },
  ],
  sage_01: [
    { icon: "📜", label: "Ask for Quest", prompt: "Do you have any quests for me?" },
    { icon: "🔎", label: "Seek Wisdom", prompt: "I seek your ancient wisdom" },
    { icon: "🗣️", label: "Chat", prompt: "Hello, what can you tell me about this place?" },
    { icon: "🙏", label: "Request Blessing", prompt: "Could you bless me for my journey?" },
  ],
  guard_01: [
    { icon: "🗣️", label: "Chat", prompt: "Hello, what can you tell me about this place?" },
    { icon: "⚔️", label: "Challenge", prompt: "I challenge you to combat!" },
    { icon: "💰", label: "Bribe", prompt: "Perhaps some gold would change your mind..." },
    { icon: "ℹ️", label: "Ask Directions", prompt: "Which way should I go?" },
  ],
  healer_01: [
    { icon: "❤️", label: "Request Healing", prompt: "Please heal my wounds" },
    { icon: "🙏", label: "Request Blessing", prompt: "Could you bless me for my journey?" },
    { icon: "🗣️", label: "Chat", prompt: "Hello, what can you tell me about this place?" },
    { icon: "🛡️", label: "Ask for Protection", prompt: "Can you protect me from the dangers ahead?" },
  ],
  eltito_01: [
    { icon: "✨", label: "Quest", prompt: "Hey tio, got any quests or adventures for me?" },
    { icon: "🌿", label: "Chill", prompt: "Hey tio, what's up? Pass me some of that herbal tea" },
    { icon: "🎮", label: "Talk WoW", prompt: "So what are you playing in WoW right now?" },
    { icon: "📚", label: "Lore", prompt: "Tell me about the Night Elves and Teldrassil" },
  ],
};

/**
 * Get actions for NPC, defaulting to DEFAULT_ACTIONS if not found.
 */
export function getActionsForNPC(npcId: string): ActionButton[] {
  return NPC_ACTIONS[npcId] ?? DEFAULT_ACTIONS;
}
