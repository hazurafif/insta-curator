import type { RawItem } from '../types.js';
import { config } from '../config.js';
import { fetchFeed } from '../sources/rss.js';
import { fetchHackerNews } from '../sources/hackernews.js';
import { normalizeItem } from './normalize.js';
import { titleSimilarity } from './dedupe.js';
import { scoreStory } from './score.js';
import { Store } from './store.js';

export interface IngestionResult {
  fetched: number;
  added: number;
  dupUrl: number;
  dupTitle: number;
  errors: number;
}

export async function runIngestion(store: Store): Promise<IngestionResult> {
  const all: RawItem[] = [];

  // RSS feeds in parallel (each isolated so one failure doesn't kill the run).
  await Promise.all(
    config.feeds.map(async (f) => {
      try {
        all.push(...(await fetchFeed(f.name, f.url)));
      } catch (e) {
        console.warn(`[warn] rss:${f.name}:`, (e as Error).message);
      }
    }),
  );

  // Hacker News.
  try {
    all.push(...(await fetchHackerNews()));
  } catch (e) {
    console.warn('[warn] hackernews:', (e as Error).message);
  }

  const recent = store.listRecentTitles(config.maxAgeDays);
  const result: IngestionResult = {
    fetched: all.length,
    added: 0,
    dupUrl: 0,
    dupTitle: 0,
    errors: 0,
  };

  for (const raw of all) {
    try {
      const story = normalizeItem(raw);

      // Exact URL dedup.
      if (store.findByCanonicalUrl(story.canonicalUrl)) {
        result.dupUrl++;
        continue;
      }

      // Fuzzy title dedup ("same story, different outlet").
      const near = recent.find(
        (r) => titleSimilarity(r.title, story.title) >= config.dupTitleSimilarity,
      );
      if (near) {
        result.dupTitle++;
        continue;
      }

      story.score = scoreStory(story);
      store.insert(story);
      recent.push({ title: story.title }); // catch duplicates within the same batch
      result.added++;
    } catch (e) {
      result.errors++;
      console.warn('[warn] item error:', (e as Error).message);
    }
  }

  return result;
}
