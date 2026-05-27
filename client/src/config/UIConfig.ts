/**
 * UI-specific configuration and constants.
 * Dimensions, colors, fonts, and styling constants.
 */

export const UIConfig = {
  // Colors
  colors: {
    primary: '#3a86ff',
    secondary: '#8338ec',
    success: '#38a169',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#0ea5e9',
    text: '#ffffff',
    textSecondary: '#d4d4d4',
    background: '#0f172a',
    backgroundLight: '#1e293b',
    border: '#64748b',
  },

  // Dimensions
  dimensions: {
    buttonHeight: 40,
    buttonWidth: 120,
    panelWidth: 400,
    panelHeight: 300,
    iconSize: 32,
    nameplateWidth: 150,
    nameplateHeight: 40,
    minimapSize: 200,
    hudPadding: 16,
    hudMargin: 12,
  },

  // Fonts
  fonts: {
    primary: 'Arial, sans-serif',
    mono: '"Monaco", "Courier New", monospace',
    sizes: {
      xs: 12,
      sm: 14,
      base: 16,
      lg: 18,
      xl: 20,
      title: 28,
      heading: 24,
    },
    weights: {
      light: 300,
      normal: 400,
      semibold: 600,
      bold: 700,
    },
  },

  // Z-Index Layers
  zIndex: {
    background: 1,
    world: 10,
    hud: 100,
    dialog: 1000,
    modal: 2000,
    tooltip: 3000,
    notification: 4000,
  },

  // Animations
  animations: {
    fadeDuration: 300,
    slideDuration: 400,
    scaleDuration: 200,
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },

  // Responsive Breakpoints
  breakpoints: {
    mobile: 640,
    tablet: 1024,
    desktop: 1280,
  },

  // Layout
  layout: {
    hudBottomMargin: 20,
    hudRightMargin: 20,
    hudTopMargin: 20,
    hudLeftMargin: 20,
  },
} as const;

export type UIConfigType = typeof UIConfig;
