# Tech News Curator: Pipeline Instagram

Goal: automatically gather tech news from Twitter/X, Threads, RSS/articles, and other sources, curate the best stories, and turn them into Instagram posts (carousels + reels scripts) with a human-in-the-loop review step before publishing.

---

## 1. Architecture Overview

Alur data dari kiri ke kanan:

1. **SOURCES** — Twitter/X, Threads, RSS/Artikel, HN, Reddit
2. **INGESTION** — scheduler, fetchers, normalizer, store
3. **CURATION** — dedupe, score, LLM summary, cluster
4. **RENDERING** — images, video, captions, hashtags
5. **REVIEW** — persetujuan manusia
6. **PUBLISH** — Instagram Graph API

## 2. Sources & How to Get Them

| Source | Access method | Notes |
|--------|--------------|-------|
| **Twitter/X** | X API v2 (paid tier), or Nitter/RSS bridges | Best for breaking news + viral dev threads |
| **Threads** | No official API — use RSS bridges or scraping | Treat as secondary |
| **Articles** | RSS feeds (TechCrunch, The Verge, Ars Technica, etc.) | Most reliable, parse with `rss-parser` |
| **Hacker News** | Official Algolia/Firebase API (free) | Great signal for "what tech people care about" |
| **Reddit** | JSON API (`r/programming`, `r/technology`) | No key needed for read-only |
| **YouTube** | RSS per channel | Source for video/reel b-roll |

Recommended RSS feeds to seed:
- https://techcrunch.com/feed/
- https://www.theverge.com/rss/index.xml
- https://arstechnica.com/feed/
- https://news.ycombinator.com/rss
- https://hnrss.org/frontpage

---

## 3. Tech Stack (recommended)

- **Language**: TypeScript (Node.js) or Python — pick one. TS is nice because rendering + scraping share one runtime.
- **Scheduler**: `node-cron` locally, or GitHub Actions cron for serverless.
- **Store**: SQLite (`better-sqlite3`) to start; Postgres later.
- **Dedup**: `@extractus/article-extractor` + URL canonicalization + title fuzzy match.
- **LLM**: OpenAI / Anthropic / local (Ollama) for summarization, scoring, caption writing.
- **Rendering**: 
  - Images: `sharp` or `satori` (JSX, lalu SVG, lalu PNG) for carousels
  - Video: `remotion` or FFmpeg for reels
- **IG posting**: Meta Graph API (requires FB Developer app + IG Business/Creator account)

---

## 4. Data Model (normalized "Story" item)

```ts
interface Story {
  id: string;              // hash of canonical URL
  title: string;
  summary: string;         // LLM-generated 1-2 sentence
  source: 'twitter' | 'threads' | 'rss' | 'hackernews' | 'reddit' | 'youtube';
  url: string;             // canonical link
  author?: string;
  publishedAt: Date;
  fetchedAt: Date;
  score: number;           // relevance 0-100
  tags: string[];          // e.g. ['ai', 'hardware', 'startups']
  clusterId?: string;      // group related stories
  raw: Record<string, any>;
  status: 'new' | 'shortlisted' | 'approved' | 'posted' | 'rejected';
}
```

---

## 5. Pipeline Phases

### Phase 1 — Ingestion (scraper/fetcher)
1. Cron job every 15–30 min.
2. Each source has a fetcher module that returns raw items.
3. Normalize everything into the `Story` schema.
4. Write to DB, skipping exact-duplicate URLs.

### Phase 2 — Dedup & Clustering
1. Canonicalize URLs (strip trackers, resolve redirects).
2. Fuzzy-match titles (e.g. `string-similarity` > 0.85 = duplicate).
3. Cluster related items (same event, different outlets) using embeddings or simple keyword overlap.

### Phase 3 — Scoring & Filtering
1. Score each story on:
   - Source authority
   - Tech relevance (LLM or keyword classifier)
   - Freshness
   - Social signal (HN points, RT/like counts if available)
2. Keep top N per day (e.g. top 10).

### Phase 4 — LLM Curation
For each shortlisted story, the LLM produces:
- 1-line hook (scroll-stopper)
- 3–5 bullet summary
- IG caption (with line breaks + emoji)
- 10–20 hashtags
- Optional: reel script (hook pembuka, 3 poin, CTA)

### Phase 5 — Rendering
- **Carousel**: hook slide + 4–6 content slides + CTA slide, branded template.
- **Reel**: script ditambah text overlay + stock b-roll atau slide animasi sederhana via Remotion.

### Phase 6 — Review & Publish
1. Output goes to a review queue (simple web UI, or just a Markdown/HTML report).
2. Human approves/edits.
3. Approved items pushed to Instagram Graph API (or exported for manual posting).

---

## 6. Instagram Posting — the tricky part

Instagram has **no open "post anything" API**. Options:

1. **Meta Graph API (official)** — best for automation, but requires:
   - Facebook Developer account + App
   - IG **Business or Creator** account linked to a Facebook Page
   - App review for `instagram_content_publish` permission
2. **Third-party schedulers** — Buffer, Later, Metricool, Publer. Fastest to start; some have APIs.
3. **Semi-manual** — pipeline generates images/captions into a folder + a "post this" checklist; you paste into IG manually.

> Recommendation: build the whole pipeline **up to rendering**, then start with **option 3 (semi-manual)** to validate content quality. Add Graph API posting later.

---

## 7. Project Structure

```
ig-reels/
├── PLAN.md
├── package.json
├── src/
│   ├── index.ts            # entry / cron
│   ├── sources/            # one fetcher per source
│   │   ├── rss.ts
│   │   ├── hackernews.ts
│   │   ├── twitter.ts
│   │   ├── threads.ts
│   │   └── reddit.ts
│   ├── ingest/             # normalize + dedupe + store
│   │   ├── normalize.ts
│   │   ├── dedupe.ts
│   │   └── store.ts
│   ├── curate/             # scoring + LLM
│   │   ├── score.ts
│   │   ├── summarize.ts
│   │   └── caption.ts
│   ├── render/             # image + video generation
│   │   ├── carousel.ts
│   │   └── reel.ts
│   ├── publish/            # IG export + Graph API
│   │   └── instagram.ts
│   └── review/             # review queue output
│       └── report.ts
├── data/
│   └── stories.db
└── output/                 # generated images/captions
```

---

## 8. Milestones (build order)

1. **M1 — RSS + HN ingestion** (no keys needed). Fetch, normalize, store, dedupe. Membuktikan alur data jalan end-to-end.
2. **M2 — LLM curation** on stored stories. Generate hooks, captions, hashtags.
3. **M3 — Carousel rendering** dengan template ber-brand; menghasilkan PNG + caption.
4. **M4 — Review queue** (HTML/Markdown report). Manual approve.
5. **M5 — Semi-manual publishing** workflow (export folder + checklist).
6. **M6 — Add Twitter/X + Threads** sources (needs keys/scraping).
7. **M7 — Reel rendering** (Remotion/FFmpeg).
8. **M8 — Graph API auto-posting** (when ready for full automation).

---

## 9. Decisions (locked in)

| Question | Decision |
|----------|----------|
| Niche | All tech |
| Format | Both carousels + reels |
| Volume | 5 posts/day |
| Language | Bahasa Indonesia (prompts, captions, hooks, hashtags all in ID) |
| IG account | To be created later; bangun sampai tahap rendering dulu, **semi-manual posting** untuk sekarang |

Implications:
- LLM curation prompts must be written in Bahasa Indonesia.
- Captions/hashtags target Indonesian tech audience (mix of ID + EN hashtags is fine).
- 5 posts/day = need ~15–20 shortlisted stories/day to pick the best 5.
- Skip Graph API work (M8) until the IG Business/Creator account exists.

---

## 10. Open Questions / Decisions (remaining)

- **Niche**: all tech, or focus (AI? dev tools? startups?) — narrower = better engagement.
- **Post format priority**: carousels vs reels vs both?
- **Volume**: how many posts/day?
- **Language/tone**: English, casual/authoritative?
- **Budget for APIs**: X API costs money; LLM tokens cost money.
- **IG account type**: do you have a Business/Creator account already?

---

## 11. First Step (what I'd build now)

A minimal working slice:
1. Node/TS project with a cron that pulls 5 RSS feeds + Hacker News.
2. Normalize + dedupe into SQLite.
3. One LLM call per shortlisted story, menghasilkan hook + caption + hashtags.
4. Render a 6-slide carousel to `output/`.
5. Print a review report.

This proves the whole loop end-to-end with zero paid APIs (LLM aside).
