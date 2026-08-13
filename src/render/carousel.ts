import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import type { Curation, CurationResult, Story } from '../types.js';
import { CANVAS, fonts, fontFactors, paletteFor, textOn, weights, type Palette } from './theme.js';
import { esc, fit, measure, stripEmoji, svgToPng, wrapText } from './svg.js';
import { prepareCoverImage } from './image.js';
import { generateReviewReport } from '../review/report.js';

const W = CANVAS.width;
const H = CANVAS.height;
const PAD = 96;

const START = 280; // first baseline on content slides
const BOTTOM = H - 180; // keep clear of the progress dots

function doc(body: string, bg: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${bg}"/>
${body}
</svg>`;
}

function progressDots(active: number, total: number, color: string): string {
  const dots: string[] = [];
  const r = 8;
  const gap = 38;
  const startX = W / 2 - ((total - 1) * gap) / 2;
  const y = H - 96;
  for (let i = 0; i < total; i++) {
    dots.push(
      `<circle cx="${startX + i * gap}" cy="${y}" r="${r}" fill="${i <= active ? color : 'none'}" stroke="${color}" stroke-width="3"/>`,
    );
  }
  return dots.join('');
}

/** Rounded "sticker" badge with the category label (Jakarta Keras style). */
function badge(label: string, p: Palette, y = 112): string {
  const w = measure(label, 26, fontFactors.mono) + 84;
  return `<g>
<rect x="${PAD}" y="${y}" width="${w}" height="68" rx="34" fill="${p.accent}"/>
<text x="${PAD + w / 2}" y="${y + 47}" text-anchor="middle" font-family="${fonts.mono}" font-weight="${weights.monoBold}" font-size="26" fill="${textOn(p.accent)}" letter-spacing="4">${esc(label)}</text>
</g>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cover (LOCKED — photo + gradient + hook + badge)
// ─────────────────────────────────────────────────────────────────────────────

function coverSlide(
  curation: Curation,
  story: Story,
  p: Palette,
  imageDataUri: string | null,
  total: number,
): string {
  const rawText = stripEmoji(curation.hook);
  const words = rawText.split(/\s+/).filter(Boolean);
  const upper = words.length > 0 && words.length <= 5;
  const text = upper ? rawText.toUpperCase() : rawText;

  if (imageDataUri) {
    const { size, lines } = fit(text, W - PAD * 2, 3, upper ? 104 : 88, fontFactors.headline, 54);
    const lineH = size * 1.22;
    const startY = H - 560;
    const tspans = lines
      .map(
        (ln, i) =>
          `<tspan x="${PAD}" y="${startY + i * lineH}">${esc(ln)}</tspan>`,
      )
      .join('');
    const tag = curation.category || config.brand.category;
    return doc(
      `
<defs>
  <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000000" stop-opacity="0.10"/>
    <stop offset="0.45" stop-color="#000000" stop-opacity="0.45"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.93"/>
  </linearGradient>
</defs>
<image href="${imageDataUri}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
<rect x="0" y="0" width="${W}" height="${H}" fill="url(#shade)"/>
${badge(tag, p)}
<text x="${PAD}" y="${startY}" font-family="${fonts.headline}" font-size="${size}" fill="#FFFFFF">${tspans}</text>
<text x="${PAD}" y="${H - 196}" font-family="${fonts.mono}" font-size="24" fill="#FFFFFF" fill-opacity="0.75" letter-spacing="4">VIA ${esc(story.sourceName.toUpperCase())}</text>
${progressDots(0, total, '#FFFFFF')}
`,
      '#000000',
    );
  }

  // No image — typographic fallback cover (same lock).
  const { size, lines } = fit(text, W - PAD * 2, 4, upper ? 100 : 88, fontFactors.headline, 52);
  const lineH = size * 1.28;
  const blockH = lines.length * lineH;
  const startY = (H - blockH) / 2 + size * 0.85;
  const tspans = lines
    .map(
      (ln, i) =>
        `<tspan x="${PAD}" y="${startY + i * lineH}">${esc(ln)}</tspan>`,
    )
    .join('');
  const tag = curation.category || config.brand.category;
  return doc(
    `
${badge(tag, p, 132)}
<text x="${PAD}" y="${startY}" font-family="${fonts.headline}" font-size="${size}" fill="${p.fg}">${tspans}</text>
<text x="${PAD}" y="${H - 190}" font-family="${fonts.mono}" font-size="24" fill="${p.fg}" fill-opacity="0.55" letter-spacing="4">VIA ${esc(story.sourceName.toUpperCase())}</text>
${progressDots(0, total, p.fg)}
`,
    p.bg,
  );
}

// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Post assembly — satu post = satu slide cover + caption
// ─────────────────────────────────────────────────────────────────────────────

/** Render one post: cover saja (caption-nya di caption.txt). */
async function renderStory(
  result: CurationResult,
  p: Palette,
  dir: string,
): Promise<void> {
  const { story, curation } = result;
  const imageDataUri = await prepareCoverImage(story);

  svgToPng(coverSlide(curation, story, p, imageDataUri, 1), join(dir, 'cover.png'));

  // Strip any "Source/Sumber: ..." line the LLM wrote, then append the canonical URL.
  const lines = curation.caption.split('\n');
  const srcIdx = lines.findIndex((l) => /^s(umber|ource)\s*:/i.test(l.trim()));
  const cleanCaption = (srcIdx === -1 ? lines : lines.slice(0, srcIdx))
    .join('\n')
    .trim();

  // Caption dalam Bahasa Inggris, tanpa hashtag.
  writeFileSync(
    join(dir, 'caption.txt'),
    `${cleanCaption}\n\nSource: ${story.url}\n`,
  );
}

/** Render carousels for all curated stories into an output folder. */
export async function renderCarousels(
  results: CurationResult[],
  outDir?: string,
): Promise<string> {
  const dir = outDir ?? join('output', new Date().toISOString().slice(0, 10));
  for (let i = 0; i < results.length; i++) {
    const postDir = join(dir, `post-${String(i + 1).padStart(2, '0')}`);
    rmSync(postDir, { recursive: true, force: true }); // drop stale slides from earlier design versions
    mkdirSync(postDir, { recursive: true });
    try {
      // Semua post pakai gaya yang sama (palette post-01).
      await renderStory(results[i], paletteFor(0), postDir);
      console.log(
        `✓ post-${String(i + 1).padStart(2, '0')} — ${results[i].story.title.slice(0, 60)}`,
      );
    } catch (e) {
      console.warn(`[warn] render "${results[i].story.title.slice(0, 40)}":`, (e as Error).message);
    }
  }
  generateReviewReport(dir);
  return dir;
}
