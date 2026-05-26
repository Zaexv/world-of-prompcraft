export const UITheme = {
  colors: {
    panelBg:      'rgba(10, 8, 20, 0.95)',
    panelBorder:  'rgba(197, 165, 90, 0.3)',
    goldPrimary:  '#c5a55a',
    goldLight:    '#e0c872',
    textPrimary:  '#e8d5b0',
    textMuted:    '#aaa',
    healthGreen:  '#44aa99',
    manaBlue:     '#4477aa',
    dangerRed:    '#ff4444',
    healGreen:    '#44ff44',
    systemGold:   '#c5a55a',
  },
  fonts: {
    heading: "'Cinzel', 'Times New Roman', serif",
    body:    "'Segoe UI', system-ui, sans-serif",
  },
  zIndex: {
    world:   0,
    hud:     10,
    panel:   20,
    modal:   30,
    overlay: 9000,
    cursor:  2147483647,
  },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 40 },
} as const;
