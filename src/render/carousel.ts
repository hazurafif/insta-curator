import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import type { Curation, CurationResult, Story } from '../types.js';
import { CANVAS, fonts, fontFactors, paletteFor, textOn, weights, type Palette } from './theme.js';
import { esc, fit, measure, stripEmoji, svgToPng, wrapText } from './svg.js';
import { prepareCoverImage } from './image.js';

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
function badge(p: Palette, y = 112): string {
  const label = config.brand.category;
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
${badge(p)}
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
  return doc(
    `
${badge(p, 132)}
<text x="${PAD}" y="${startY}" font-family="${fonts.headline}" font-size="${size}" fill="${p.fg}">${tspans}</text>
<text x="${PAD}" y="${H - 190}" font-family="${fonts.mono}" font-size="24" fill="${p.fg}" fill-opacity="0.55" letter-spacing="4">VIA ${esc(story.sourceName.toUpperCase())}</text>
${progressDots(0, total, p.fg)}
`,
    p.bg,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Content slides — no labels, no numbers. Summary paragraph + soft point cards.
// ─────────────────────────────────────────────────────────────────────────────

interface Block {
  svg: string;
  h: number;
}

/** Clean text for slides: no emoji, max 3 sentences, tight whitespace. */
function cleanText(text: string, maxSentences = 3): string {
  const t = stripEmoji(text).replace(/\s+/g, ' ').trim();
  const sentences = t.split(/(?<=[.!?])\s+/);
  return sentences.slice(0, maxSentences).join(' ');
}

/** Paragraph block, auto-fit. center=true for a lone statement slide. */
function paraBlock(
  text: string,
  p: Palette,
  opts: {
    y?: number;
    center?: boolean;
    startSize?: number;
    maxLines?: number;
    minSize?: number;
  } = {},
): Block {
  const startSize = opts.startSize ?? 46;
  const maxLines = opts.maxLines ?? 10;
  const minSize = opts.minSize ?? 36;
  const { size, lines } = fit(text, W - PAD * 2, maxLines, startSize, fontFactors.body, minSize);
  const lineH = size * 1.5;
  const baseline = opts.center
    ? (H - lines.length * lineH) / 2 + size * 0.8
    : (opts.y ?? START);
  const tspans = lines
    .map(
      (ln, i) =>
        `<tspan x="${PAD}" y="${baseline + i * lineH}">${esc(ln)}</tspan>`,
    )
    .join('');
  return {
    svg: `<text font-family="${fonts.body}" font-size="${size}" fill="${p.fg}">${tspans}</text>`,
    h: lines.length * lineH,
  };
}

/** Soft rounded "cards", one per point — no numbers, just the content. */
function pointCards(points: string[], y: number, p: Palette): Block {
  const cardW = W - PAD * 2;
  const inset = 44;
  const textW = cardW - inset * 2;
  const size = 40;
  const lineH = size * 1.45;
  const padY = 40;

  let svg = '';
  let cursor = y;
  for (const pt of points) {
    const lines = wrapText(pt, textW, size, fontFactors.body);
    const cardH = lines.length * lineH + padY * 2;
    const tspans = lines
      .map(
        (ln, i) =>
          `<tspan x="${PAD + inset}" y="${cursor + padY + size * 0.8 + i * lineH}">${esc(ln)}</tspan>`,
      )
      .join('');
    svg += `<rect x="${PAD}" y="${cursor}" width="${cardW}" height="${cardH}" rx="22" fill="${p.fg}" fill-opacity="0.07"/>
<text font-family="${fonts.body}" font-weight="${weights.bodyBold}" font-size="${size}" fill="${p.fg}">${tspans}</text>`;
    cursor += cardH + 20;
  }
  return { svg, h: cursor - y - 20 };
}

function cardHeight(points: string[]): number {
  const textW = W - PAD * 2 - 88;
  return points.reduce(
    (h, pt) =>
      h +
      wrapText(pt, textW, 40, fontFactors.body).length * 40 * 1.45 +
      40 * 2 +
      20,
    0,
  ) - 20;
}

function fitsOneSlide(curation: Curation): boolean {
  const lead = cleanText(curation.summary, 2);
  const points = curation.bullets
    .slice(0, config.maxBullets)
    .map(stripEmoji)
    .filter(Boolean);
  const leadH = wrapText(lead, W - PAD * 2, 42, fontFactors.body).length * 42 * 1.5;
  const cardsH = cardHeight(points);
  return leadH + 32 + cardsH <= BOTTOM - START;
}

function contentSlides(curation: Curation, p: Palette, total: number): string[] {
  const lead = cleanText(curation.summary, 2);
  const points = curation.bullets
    .slice(0, config.maxBullets)
    .map(stripEmoji)
    .filter(Boolean);

  if (fitsOneSlide(curation)) {
    // One content slide: lead sentence(s) + point cards.
    let y = START;
    const leadBlock = paraBlock(lead, p, { y, startSize: 42, maxLines: 3 });
    y += leadBlock.h + 32;
    const cards = pointCards(points, y, p);
    return [doc(leadBlock.svg + cards.svg + progressDots(1, total, p.fg), p.bg)];
  }

  // Two slides: full summary as a centered statement, then the cards.
  const sum = paraBlock(cleanText(curation.summary), p, { center: true });
  const cards = pointCards(points, START, p);
  return [
    doc(sum.svg + progressDots(1, total, p.fg), p.bg),
    doc(cards.svg + progressDots(2, total, p.fg), p.bg),
  ];
}

/** Final slide — handle + follow line. No question. */
function ctaSlide(p: Palette, active: number, total: number): string {
  const handle = config.brand.handle;
  const { size, lines } = fit(handle, W - PAD * 2, 2, 128, fontFactors.headline, 72);
  const lineH = size * 1.15;
  const blockH = lines.length * lineH;
  const baseline = (H - blockH) / 2 + size * 0.85 - 60;
  const tspans = lines
    .map(
      (ln, i) =>
        `<tspan x="${PAD}" y="${baseline + i * lineH}">${esc(ln)}</tspan>`,
    )
    .join('');

  return doc(
    `
<text x="${PAD}" y="${baseline}" font-family="${fonts.headline}" font-size="${size}" fill="${p.bg}">${tspans}</text>
<line x1="${PAD}" y1="${baseline + lines.length * lineH - size * 0.85 + 56}" x2="${W - PAD}" y2="${baseline + lines.length * lineH - size * 0.85 + 56}" stroke="${p.bg}" stroke-width="5" stroke-opacity="0.5"/>
<text x="${PAD}" y="${H - 200}" font-family="${fonts.body}" font-size="36" fill="${p.bg}" fill-opacity="0.9">${esc(config.brand.ctaFollow)}</text>
${progressDots(active, total, p.bg)}
`,
    p.accent,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Post assembly
// ─────────────────────────────────────────────────────────────────────────────

/** Render one post: cover + content (1–2 slides) + CTA → max 4 slides. */
async function renderStory(
  result: CurationResult,
  p: Palette,
  dir: string,
): Promise<void> {
  const { story, curation } = result;
  const imageDataUri = await prepareCoverImage(story);

  const total = 2 + (fitsOneSlide(curation) ? 1 : 2); // cover + content + CTA
  const content = contentSlides(curation, p, total);

  const slides: { file: string; svg: string }[] = [];
  slides.push({
    file: '01-cover.png',
    svg: coverSlide(curation, story, p, imageDataUri, total),
  });
  content.forEach((svg, i) => {
    slides.push({
      file: `${String(i + 2).padStart(2, '0')}-isi.png`,
      svg,
    });
  });
  slides.push({
    file: `${String(content.length + 2).padStart(2, '0')}-cta.png`,
    svg: ctaSlide(p, content.length, total),
  });

  for (const s of slides) svgToPng(s.svg, join(dir, s.file));

  writeFileSync(
    join(dir, 'caption.txt'),
    `${curation.caption}\n\n${curation.hashtags.map((h) => '#' + h).join(' ')}\n\nSumber: ${story.url}\n`,
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
    mkdirSync(postDir, { recursive: true });
    try {
      await renderStory(results[i], paletteFor(i), postDir);
      console.log(
        `✓ post-${String(i + 1).padStart(2, '0')} — ${results[i].story.title.slice(0, 60)}`,
      );
    } catch (e) {
      console.warn(`[warn] render "${results[i].story.title.slice(0, 40)}":`, (e as Error).message);
    }
  }
  return dir;
}
