import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import type { Story } from '../types.js';

const IMG_DIR = resolve(process.cwd(), 'data/images');
const COVER_W = 1080;
const COVER_H = 1350;

async function fetchWithTimeout(url: string, ms = 10000): Promise<Response> {
  return fetch(url, {
    signal: AbortSignal.timeout(ms),
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    },
  });
}

/** Extract og:image / twitter:image, then any page <img> as fallback. */
function extractImages(html: string): string[] {
  const out: string[] = [];
  const metas = html.match(/<meta[^>]*>/gi) ?? [];
  for (const tag of metas) {
    if (/og:image|twitter:image/i.test(tag)) {
      const c = tag.match(/content=["']([^"']+)["']/i);
      if (c && c[1]) out.push(c[1]);
    }
  }
  const imgs = html.match(/<img[^>]+src=["']([^"']+)["']/gi) ?? [];
  for (const tag of imgs) {
    const c = tag.match(/src=["']([^"']+)["']/i);
    if (c && c[1]) out.push(c[1]);
  }
  return out.filter((u) => u.startsWith('http'));
}

/** Image URL candidates embedded in the stored raw RSS item. */
function rawImageCandidates(raw: Record<string, unknown>): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string' && v.startsWith('http')) out.push(v);
  };

  const enc = (raw.enclosure as Record<string, unknown>) ?? {};
  push(enc.url);

  const mc = (raw['media:content'] ?? raw['media:thumbnail']) as
    | Record<string, unknown>
    | undefined;
  if (mc) {
    push(mc.url);
    push((mc.$ as Record<string, unknown> | undefined)?.url);
  }

  const html = raw.content ?? raw['content:encoded'] ?? raw.contentSnippet ?? '';
  if (typeof html === 'string') {
    for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) {
      out.push(m[1]);
    }
  }
  return out;
}

/** Download an image to the cache; returns a file path or null. */
async function downloadImage(url: string, id: string): Promise<string | null> {
  const file = join(IMG_DIR, `${id}.img`);
  if (existsSync(file)) return file;
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 500) return null; // likely a tracking pixel
    mkdirSync(IMG_DIR, { recursive: true });
    writeFileSync(file, buf);
    return file;
  } catch {
    return null;
  }
}

/** Hapus cache gambar satu story supaya bisa dicoba ambil ulang. */
export function clearImageCache(id: string): void {
  try {
    rmSync(join(IMG_DIR, `${id}.img`), { force: true });
  } catch {
    /* ignore */
  }
}

/** Find a usable image for a story (RSS attachments → page og:image). */
export async function resolveStoryImage(story: Story): Promise<string | null> {
  let candidates: string[] = [];
  try {
    const raw = story.raw ? (JSON.parse(story.raw) as Record<string, unknown>) : {};
    candidates = rawImageCandidates(raw);
  } catch {
    candidates = [];
  }

  if (!candidates.length) {
    try {
      const res = await fetchWithTimeout(story.url);
      if (res.ok) {
        const html = await res.text();
        candidates = extractImages(html);
      }
    } catch {
      /* page not reachable — fall through to fallback */
    }
  }

  if (!candidates.length) {
    // Fallback: microlink metadata API (bisa render halaman JS).
    try {
      const res = await fetchWithTimeout(
        `https://api.microlink.io?url=${encodeURIComponent(story.url)}`,
        12000,
      );
      if (res.ok) {
        const j = (await res.json()) as {
          data?: { image?: { url?: string } };
        };
        const img = j?.data?.image?.url;
        if (img) candidates.push(img);
      }
    } catch {
      /* fallback gagal — tetap pakai cover tipografi */
    }
  }

  for (const url of candidates.slice(0, 6)) {
    try {
      const file = await downloadImage(url, story.id);
      if (file) return file;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/**
 * Resize/crop a story image into a 1080×1350 cover and return it as a
 * base64 data URI (embed-able directly in the SVG cover slide).
 */
export async function prepareCoverImage(
  story: Story,
): Promise<string | null> {
  const file = await resolveStoryImage(story);
  if (!file) return null;
  try {
    const buf = await sharp(file)
      .resize(COVER_W, COVER_H, { fit: 'cover' })
      .png()
      .toBuffer();
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}
