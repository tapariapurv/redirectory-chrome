// Theme catalogue for the Appearance picker. Colours here are only used to
// draw the swatches; the real palettes live in styles/base.css.

export const THEMES = [
  { id: 'ember', name: 'Ember', light: ['#f6f4f0', '#e8552c'], dark: ['#0e0f12', '#ff7149'] },
  { id: 'ocean', name: 'Ocean', light: ['#f2f5f9', '#2463eb'], dark: ['#0b0f16', '#5b8cff'] },
  { id: 'forest', name: 'Forest', light: ['#f2f5f0', '#1a7f4e'], dark: ['#0b100d', '#45d08e'] },
  { id: 'grape', name: 'Grape', light: ['#f6f4fa', '#7046e6'], dark: ['#0f0d15', '#a48bff'] },
  { id: 'rose', name: 'Rose', light: ['#faf4f4', '#d92f5a'], dark: ['#130d0f', '#ff6f8f'] },
  { id: 'mono', name: 'Mono', light: ['#f5f5f4', '#1c1c1e'], dark: ['#09090a', '#f4f4f5'] },
];

export const MODES = [
  { id: 'system', name: 'System' },
  { id: 'light', name: 'Light' },
  { id: 'dark', name: 'Dark' },
];

export const DEFAULT_APPEARANCE = { theme: 'ember', mode: 'system' };
