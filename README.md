# ig-reels — Tech News Curator → Instagram

Mengumpulkan berita teknologi dari RSS + Hacker News, lalu (nanti) mengubahnya
jadi postingan Instagram (carousel + reels) dalam Bahasa Indonesia.

See `PLAN.md` for the full architecture and roadmap, and `RESEARCH.md` for the competitor/style research (Cretivox, Folkative, USS Feed).

## Status

- [x] M1 — Ingestion (RSS + Hacker News → SQLite, dedupe, scoring)
- [x] M2 — LLM curation (hook, caption, hashtags in Bahasa Indonesia) via OpenCode Go / DeepSeek V4
- [x] M3 — Carousel rendering (image cover + max 5 slides, PNG output)
- [ ] M4 — Review queue
- [ ] M5 — Semi-manual posting workflow
- [ ] M6 — Twitter/X + Threads sources
- [ ] M7 — Reel rendering
- [ ] M8 — Instagram Graph API auto-post

## Run

```bash
npm install
npm start        # run ingestion once
npm run curate   # ingest + curate top 5 stories (LLM) and print
npm run render   # ingest + curate + render carousel PNGs to output/
npm run render:stored  # re-render already-curated posts (design iterations, no LLM cost)
npm run watch    # run on a cron schedule (every 30 min)
```

Data lands in `data/stories.db` (SQLite, via Node's built-in `node:sqlite`).

### Output structure (per post)

```
output/YYYY-MM-DD/post-01/
├── 01-cover.png   # locked: article photo + gradient + hook + badge (or typographic fallback)
├── 02-isi.png     # full content: INTI BERITA summary + POIN PENTING list (auto-splits to 2 slides if long)
├── 03-cta.png     # question + handle + follow CTA
└── caption.txt    # full caption + hashtags + source
```

Max 4 slides per post; the detail lives in the caption.

### LLM (M2)

Curation uses the OpenCode Go gateway (OpenAI-compatible). Set in `.env`:

```
OPENCODE_GO_API_KEY=sk-...
OPENCODE_GO_MODEL=deepseek-v4-flash   # or deepseek-v4-pro
```

DeepSeek V4 is a reasoning model, so `max_tokens` includes the reasoning tokens —
keep it generous (default 16000).

## Config

Edit `src/config.ts` to add/remove RSS feeds, tweak HN thresholds, and dedup
similarity. No API keys needed for M1.
