import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const FONT_DIR = resolve(process.cwd(), 'assets/fonts');

/** Every .ttf dropped into assets/fonts gets registered with the rasterizer. */
function fontFiles(): string[] {
  return readdirSync(FONT_DIR)
    .filter((f) => f.endsWith('.ttf'))
    .map((f) => resolve(FONT_DIR, f));
}

/** Escape text for safe embedding in SVG/XML. */
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Remove emoji/symbols that a plain text font can't render (avoids tofu boxes). */
export function stripEmoji(s: string): string {
  return s
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]/gu,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Approximate rendered width of a text run (heuristic, no font metrics available). */
export function measure(text: string, fontSize: number, factor: number): number {
  let w = 0;
  for (const ch of text) {
    if (ch === ' ') w += fontSize * 0.32;
    else if ('ilIjtfr!.,:;\'"'.includes(ch)) w += fontSize * 0.38;
    else if (/[A-Z0-9@#%&]/.test(ch)) w += fontSize * factor;
    else w += fontSize * factor * 0.92;
  }
  return w;
}

/** Greedy word-wrap into lines that fit within maxWidth. */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  factor: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (!line || measure(cand, fontSize, factor) <= maxWidth) {
      line = cand;
    } else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Shrink font-size until the text fits within maxLines (returns size + lines). */
export function fit(
  text: string,
  maxWidth: number,
  maxLines: number,
  startSize: number,
  factor: number,
  minSize = 40,
): { size: number; lines: string[] } {
  let size = startSize;
  while (size > minSize) {
    const lines = wrapText(text, maxWidth, size, factor);
    if (lines.length <= maxLines) return { size, lines };
    size -= 6;
  }
  return { size, lines: wrapText(text, maxWidth, size, factor) };
}

/** Rasterize an SVG string to a 1080px-wide PNG file. */
export function svgToPng(svg: string, outPath: string): void {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1080 },
    font: {
      loadSystemFonts: false,
      fontFiles: fontFiles(),
      defaultFontFamily: 'Plus Jakarta Sans',
    },
  });
  const png = resvg.render().asPng();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, png);
}
