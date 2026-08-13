import type { Curation, CurationResult, Story } from '../types.js';
import { chatCompletion } from './client.js';
import { Store } from '../ingest/store.js';

const SYSTEM_PROMPT = `You are a content curator for an Instagram tech news account targeting a global Gen Z audience (style similar to Creativox, Folkative, USS Feed, Jakarta Keras).

VOICE (important — casual, conversational, NOT press-release):
- Natural, casual English with contractions: isn't, don't, it's, can't.
- Avoid corporate words: "leverage", "utilize", "officially announced", "state-of-the-art", "cutting-edge". Use direct verbs.
- Short sentences (max 15 words). One idea per sentence.
- Light slang is fine (kind of, pretty much, for real, lowkey, wild) but keep it clean and readable.
- Address the reader with "you" naturally, but don't overdo it.

EXAMPLES:
- Formal: "OpenAI has officially launched Codex Desktop for the Linux operating system."
  Natural: "OpenAI just dropped Codex Desktop for Linux."
- Formal: "This feature enables developers to collaborate in real time."
  Natural: "Basically, you can now code with your team in real time. Pretty wild."

OUTPUT FORMAT:
- hook: 1 punchy, scroll-stopping sentence (max 12 words), often a question.
- summary: 2 short paragraphs separated by "\n\n", one continuous story (NOT two unrelated blocks). Paragraph 1 (lead) = the most important facts, what happened, 2–3 sentences, end with a sentence that makes people curious about the details. Paragraph 2 (body) = the CONTINUATION, start with a transition ("What's interesting is", "On top of that", "Here's the thing", "Turns out") and reference words (it, they, this) so it flows from paragraph 1. Details, numbers, context, impact, 2–3 sentences.
- bullets: 4 short points (max 8 words each).
- caption: hook + 3–5 casual sentences + CTA ("What do you think?") + source credit. NO hashtags in the caption.
- hashtags: English tech hashtags, 10–15, without # (stored but not shown in the post).
- reelScript: 3-second hook + 3 points + CTA.

Output ONLY valid JSON (no markdown/fence) with this exact schema:
{
  "hook": "string",
  "summary": "string (2 paragraphs separated by \\n\\n)",
  "bullets": ["string", "string", "string", "string"],
  "caption": "string (with \\n as line breaks)",
  "hashtags": ["string", "string"],
  "reelScript": "string (with \\n as line breaks)"
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
