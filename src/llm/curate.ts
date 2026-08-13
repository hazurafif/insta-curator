import type { Curation, CurationResult, Story } from '../types.js';
import { chatCompletion } from './client.js';
import { Store } from '../ingest/store.js';

const SYSTEM_PROMPT = `You are a content curator for an Instagram tech news account targeting a global Gen Z audience (style similar to Creativox, Folkative, USS Feed, Jakarta Keras).

TWO LANGUAGES — follow exactly:
1) HOOK + SUMMARY + BULLETS: Bahasa Indonesia santai tapi rapi (rules under BAHASA INDONESIA below).
2) CAPTION + HASHTAGS + REEL SCRIPT: English, casual Gen-Z tone (rules under ENGLISH below).

BAHASA INDONESIA (untuk hook, summary, bullets):
- Natural, seperti menjelaskan ke teman, tapi JANGAN pakai sapaan "lo", "gengs", "guys", "bro", "gua".
- Pakai partikel emotif secukupnya (1–2 per kalimat, jangan lebay): sih, dong, deh, kan, nih, tuh, lho, kok.
- Hindari kata berita formal: "merupakan", "diluncurkan", "dengan demikian", "hal ini", "terkait". Ganti kata kerja langsung.
- Kalimat pendek (maks 15 kata). Satu kalimat satu ide.

ENGLISH (untuk caption, hashtags, reelScript):
- Professional, clear English — like a well-written news summary. NOT casual, no slang, no filler words.
- Fokus pada inti artikel/berita: apa yang terjadi, detail/angka penting, kenapa penting. Boleh panjang.
- JANGAN akhiri dengan pertanyaan atau CTA ("What do you think?"). Tutup ringkasan secara natural.

EXAMPLES:
- Hook ID natural: "OpenAI akhirnya rilis Codex Desktop buat Linux."
- Caption EN natural: "OpenAI just dropped Codex Desktop for Linux. Basically, you can now code with your team in real time. Pretty wild. What do you think?"

OUTPUT FORMAT:
- hook: 1 kalimat provokatif Bahasa Indonesia (maks 12 kata), sering berupa pertanyaan.
- summary: 2 paragraf Bahasa Indonesia dipisah "\n\n", satu cerita utuh (JANGAN dua info terpisah). Paragraf 1 (lead) = fakta terpenting, apa yang terjadi, 2–3 kalimat, akhiri dengan kalimat yang bikin penasaran. Paragraf 2 (body) = LANJUTAN cerita, mulai dengan kata transisi ("Nah,", "Menariknya,", "Bukan cuma itu,", "Kabarnya,") dan kata rujukan (itu, ini, mereka) supaya nyambung, 2–3 kalimat.
- bullets: 4 poin singkat Bahasa Indonesia (maks 8 kata per poin).
- caption: English — ringkasan fokus pada inti berita: apa yang terjadi, detail/angka penting, kenapa penting. Nada profesional seperti rangkuman berita, boleh panjang (4–8 kalimat). NO hashtags, NO pertanyaan penutup / CTA. Tutup secara natural.
- hashtags: English tech hashtags, 10–15, without # (stored but not shown in the post).
- reelScript: English — 3-second hook + 3 points + CTA.
- category: 1 kata kategori untuk badge cover, pilih dari daftar ini: TEKNOLOGI, AI, GADGET, BISNIS, STARTUP, SAINS, KESEHATAN, GAME, SIBER, ENERGI, MOBIL, ANGKASA.

Output ONLY valid JSON (no markdown/fence) with this exact schema:
{
  "hook": "string",
  "summary": "string (2 paragraphs separated by \\n\\n)",
  "bullets": ["string", "string", "string", "string"],
  "caption": "string (with \\n as line breaks)",
  "hashtags": ["string", "string"],
  "reelScript": "string (with \\n as line breaks)",
  "category": "string"
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
    category: String(r.category ?? 'TEKNOLOGI').trim().toUpperCase(),
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

/** Curate the top-N stories by score. */
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
