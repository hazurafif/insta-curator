/** Design system for Instagram carousels (see RESEARCH.md for the rationale). */

export const CANVAS = {
  width: 1080,
  height: 1350, // 4:5
};

/** Fonts: Archivo Black (headline), Plus Jakarta Sans (body), Space Grotesk (labels). */
export const fonts = {
  headline: 'Archivo Black',
  body: 'Plus Jakarta Sans',
  mono: 'Space Grotesk',
};

/** Font weights available as static files in assets/fonts. */
export const weights = {
  body: 400,
  bodyBold: 700,
  mono: 400,
  monoBold: 700,
};

/** Approx. average glyph width as a fraction of font-size (for manual wrapping). */
export const fontFactors = {
  headline: 0.65, // Archivo Black is wide
  body: 0.6,
  mono: 0.62,
};

export interface Palette {
  name: string;
  bg: string;
  fg: string;
  accent: string;
}

/**
 * Editorial color-block palettes — softer than v1, inspired by
 * Folkative's warm primary blocks / USS Feed's clean cards.
 */
export const palettes: Palette[] = [
  { name: 'cream', bg: '#F6F1E7', fg: '#17130C', accent: '#E4572E' },
  { name: 'ink', bg: '#17130C', fg: '#F6F1E7', accent: '#E4572E' },
  { name: 'blue', bg: '#1B4965', fg: '#F2F7F9', accent: '#5FA8D3' },
  { name: 'mustard', bg: '#E9C46A', fg: '#201A05', accent: '#201A05' },
  { name: 'blush', bg: '#F2C7C0', fg: '#3A1F1D', accent: '#3A1F1D' },
  { name: 'mint', bg: '#C8E0D5', fg: '#103328', accent: '#103328' },
];

export function paletteFor(i: number): Palette {
  return palettes[i % palettes.length];
}

/** Pick a readable text color (dark or light) for the given hex background. */
export function textOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 150 ? '#17130C' : '#FFFFFF';
}
