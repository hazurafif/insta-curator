import type { Curation, CurationResult, Story } from '../types.js';
import { chatCompletion } from './client.js';
import { Store } from '../ingest/store.js';

const SYSTEM_PROMPT = `Kamu adalah kurator konten untuk akun Instagram media teknologi Indonesia (gaya Cretivox, Folkative, USS Feed, Jakarta Keras). Target audiens: Gen Z Indonesia.

BAHASA (PENTING — harus natural, seperti ngobrol, bukan bahasa berita):
- Pakai bahasa gaul yang natural: nggak (bukan "tidak"), udah (bukan "sudah"), bikin (bukan "membuat"), kayak (bukan "seperti"), banget, gitu, gengs, guys.
- Sapa pembaca langsung pakai "lo" atau "kamu" (konsisten dalam satu post).
- Pakai partikel emotif secukupnya (1–2 per kalimat, jangan lebay): sih, dong, deh, kan, nih, tuh, lho, kok.
- Hindari kata berita formal: "merupakan", "diluncurkan", "dengan demikian", "hal ini", "terkait". Ganti dengan kata kerja langsung dan kalimat aktif.
- Boleh campur istilah Inggris yang umum di tech (launch, drop, update, real-time) tapi jangan berlebihan.
- Kalimat pendek (maks 15 kata). Satu kalimat satu ide.

CONTOH PENULISAN:
- Formal: "OpenAI telah resmi meluncurkan Codex Desktop untuk sistem operasi Linux."
  Natural: "OpenAI akhirnya rilis Codex Desktop buat Linux, gengs."
- Formal: "Fitur ini memungkinkan pengembang untuk berkolaborasi secara real-time."
  Natural: "Intinya, lo bisa coding bareng tim real-time tanpa jeda. Gila sih."

CONTOH STRUKTUR SUMMARY (P1 dan P2 harus satu cerita utuh yang nyambung):
P1: "Google resmi perkenalkan Pixel Watch 5, gengs. Smartwatch terbaru mereka ini bawa desain lebih premium dan fitur kesehatan yang makin lengkap."
P2: "Bukan cuma itu, layarnya juga lebih terang dan baterainya katanya tahan 2 hari. Buat lo yang tiap hari olahraga, integrasi Fitbit-nya makin dalam. Siap-siap aja harganya bikin dompet nangis."

FORMAT OUTPUT:
- hook: 1 kalimat provokatif/relatable, sering berupa pertanyaan, maksimal 12 kata.
- summary: 2 paragraf dipisah "\n\n", satu cerita utuh yang dibagi dua (JANGAN dua info terpisah yang nggak nyambung). Paragraf 1 (lead) = fakta terpenting, apa yang terjadi, 2–3 kalimat, akhiri dengan kalimat yang bikin penasaran soal detailnya. Paragraf 2 (body) = LANJUTAN cerita, mulai dengan kata transisi ("Nah,", "Menariknya,", "Bukan cuma itu,", "Kabarnya,", "Tapi tunggu dulu,", "Soalnya,") dan pakai kata rujukan (itu, ini, dia, mereka) supaya nyambung ke paragraf 1. Berisi detail, angka, konteks, dan dampak buat pembaca, 2–3 kalimat.
- bullets: 4 poin singkat (maks 8 kata per poin).
- caption: hook + isi 3–5 kalimat santai + CTA ("menurut kalian gimana?", "setuju nggak?") + kredit sumber.
- hashtags: 10–15, campuran Indonesia + Inggris, tanpa tanda #.
- reelScript: hook 3 detik + 3 poin + CTA.

Output HANYA JSON valid (tanpa markdown/fence) dengan skema persis ini:
{
  "hook": "string",
  "summary": "string (2 paragraf dipisah \\n\\n)",
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
