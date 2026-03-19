/** Visual presets for different chat bubble types. */

export interface BubblePreset {
  background: string;
  border: string;
  textColor: string;
  nameColor: string;
  caretColor: string;
  fontStyle: string;
}

export const BUBBLE_PRESETS: Record<string, BubblePreset> = {
  player: {
    background: 'rgba(20, 40, 80, 0.92)',
    border: '1px solid rgba(100, 160, 255, 0.5)',
    textColor: '#e8e8f0',
    nameColor: '#88bbff',
    caretColor: 'rgba(20, 40, 80, 0.92)',
    fontStyle: 'normal',
  },
  npc: {
    background: 'rgba(50, 35, 10, 0.92)',
    border: '1px solid rgba(197, 165, 90, 0.6)',
    textColor: '#f0e6d0',
    nameColor: '#c5a55a',
    caretColor: 'rgba(50, 35, 10, 0.92)',
    fontStyle: 'normal',
  },
  system: {
    background: 'rgba(40, 40, 40, 0.88)',
    border: '1px solid rgba(150, 150, 150, 0.3)',
    textColor: '#aaaaaa',
    nameColor: '#888888',
    caretColor: 'rgba(40, 40, 40, 0.88)',
    fontStyle: 'italic',
  },
  hostile: {
    background: 'rgba(80, 20, 20, 0.92)',
    border: '1px solid rgba(255, 80, 80, 0.5)',
    textColor: '#ffcccc',
    nameColor: '#ff6666',
    caretColor: 'rgba(80, 20, 20, 0.92)',
    fontStyle: 'normal',
  },
  alliance: {
    background: 'rgba(20, 35, 70, 0.92)',
    border: '1px solid rgba(80, 140, 255, 0.5)',
    textColor: '#d0d8f0',
    nameColor: '#6699ff',
    caretColor: 'rgba(20, 35, 70, 0.92)',
    fontStyle: 'normal',
  },
  horde: {
    background: 'rgba(70, 20, 20, 0.92)',
    border: '1px solid rgba(200, 60, 60, 0.5)',
    textColor: '#f0d0d0',
    nameColor: '#cc4444',
    caretColor: 'rgba(70, 20, 20, 0.92)',
    fontStyle: 'normal',
  },
};

export function getPreset(style: string): BubblePreset {
  return BUBBLE_PRESETS[style] ?? BUBBLE_PRESETS.player;
}
