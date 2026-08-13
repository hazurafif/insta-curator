import type { Curation, CurationResult, Story } from '../types.js';
import { chatCompletion } from './client.js';
import { Store } from '../ingest/store.js';

const SYSTEM_PROMPT = `Kamu adalah kurator konten untuk akun Instagram media teknologi Indonesia (gaya Cretivox, Folkative, USS Feed). Target audiens: Gen Z Indonesia.

Gaya penulisan:
- Bahasa Indonesia santai/gaul, kalimat pendek, bukan paragraf panjang.
- Emoji dipakai sebagai pemisah/penanda nada (🔥🫶👏), jangan berlebihan.
- Hook = 1 kalimat provokatif/relatable, sering berupa pertanyaan, maksimal 12 kata.
- Caption selalu berakhir dengan CTA ("menurut kalian gimana?", "setuju nggak?", "spill di kolom komentar") dan kredit sumber berita.
- Bullets = satu poin per slide carousel, singkat (maks 8 kata per poin).
- Hashtag campuran Indonesia + Inggris, 10–15, tanpa tanda #.
- Reel script: hook 3 detik + 3 poin + CTA, dalam bahasa Indonesia.

Output HANYA JSON valid (tanpa markdown/fence) dengan skema persis ini:
{
  "hook": "string",
  "summary": "string",
  "bullets": ["string", "string", "string", "string"],
  "caption": "string (dengan \\n sebagai line break)",
  "hashtags": ["string", "string"],
  "reelScript": "string (dengan \\n sebagai line break)"
}`;

/** Parse JSON robustly (strip markdown fences, extract first {...} block). */
function parseJson<T>(text: string): T {
  let t = text.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) t = t.slice(start, end + 1);
  return JSON.parse(t) as T;
}

function toArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter(Boolean);
}

/** Normalize raw LLM output into a clean Curation object. */
function normalizeCuration(raw: unknown): Curation {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    hook: String(r.hook ?? '').trim(),
    summary: String(r.summary ?? '').trim(),
    bullets: toArray(r.bullets),
    caption: String(r.caption ?? '').trim(),
    hashtags: toArray(r.hashtags).map((h) => h.replace(/^#/, '')),
    reelScript: String(r.reelScript ?? '').trim(),
  };
}

export async function curateStory(story: Story): Promise<Curation> {
  const user = [
    'Berita berikut perlu dikurasi jadi konten Instagram:',
    `Judul: ${story.title}`,
    story.summary ? `Ringkasan: ${story.summary}` : '',
    `Sumber: ${story.sourceName}`,
    `URL: ${story.url}`,
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await chatCompletion(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: user },
    ],
    { json: true, temperature: 0.8 },
  );

  return normalizeCuration(parseJson<unknown>(raw));
}

/** Curate the top-N unscored stories, persist, and return results. */
export async function curateTopStories(
  store: Store,
  count: number,
): Promise<CurationResult[]> {
  const top = store.listNew(count);
  const results: CurationResult[] = [];

  for (const story of top) {
    try {
      const curation = await curateStory(story);
      store.setCuration(story.id, JSON.stringify(curation));
      results.push({ story, curation });
    } catch (e) {
      console.warn(`[warn] kurasi "${story.title.slice(0, 50)}":`, (e as Error).message);
    }
  }

  return results;
}
