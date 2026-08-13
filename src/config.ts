import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load .env (if present) so process.env.* is available below.
const envFile = fileURLToPath(new URL('../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

export const config = {
  /** SQLite database file (uses Node's built-in node:sqlite). */
  dbPath: 'data/stories.db',

  /** How far back (days) to consider for title-based dedup. */
  maxAgeDays: 3,

  /** Title Jaccard similarity threshold above which two items are "the same story". */
  dupTitleSimilarity: 0.85,

  /** RSS feeds to poll. name is the stable id used in the DB. */
  feeds: [
    { name: 'techcrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'theverge', url: 'https://www.theverge.com/rss/index.xml' },
    { name: 'arstechnica', url: 'https://arstechnica.com/feed/' },
    { name: 'wired', url: 'https://www.wired.com/feed/rss' },
    { name: 'engadget', url: 'https://www.engadget.com/rss.xml' },
    { name: 'cnbc-tech', url: 'https://www.cnbc.com/id/19854910/device/rss/rss.html' },
  ],

  hn: {
    api: 'https://hn.algolia.com/api/v1/search_by_date',
    hitsPerPage: 100,
    minPoints: 50,
  },

  /** Relative weight per source when scoring relevance. */
  sourceWeights: {
    rss: 1.0,
    hackernews: 1.2,
  } as Record<string, number>,

  /** Cron expression for `npm run watch` (every 30 minutes). */
  cron: '*/30 * * * *',

  /** OpenCode Go gateway (OpenAI-compatible). */
  llm: {
    baseUrl: process.env.OPENCODE_GO_BASE_URL ?? 'https://opencode.ai/zen/go/v1',
    model: process.env.OPENCODE_GO_MODEL ?? 'deepseek-v4-flash',
    apiKey: process.env.OPENCODE_GO_API_KEY ?? '',
    temperature: 0.8,
    maxTokens: Number(process.env.OPENCODE_GO_MAX_TOKENS ?? 128000),
  },

  /** How many stories to curate per run (= daily posts). */
  curateCount: 5,

  /** Branding used when rendering carousels. Change the handle later. */
  brand: {
    handle: '@techfeed.id',
    category: 'TEKNOLOGI',
    ctaFollow: 'Follow buat update tech tiap hari',
  },

  /** Max bullets listed on the points slide. */
  maxBullets: 4,
};
