import type { RawItem } from '../types.js';
import { config } from '../config.js';

interface HNHit {
  objectID: string;
  title: string;
  url: string | null;
  author: string;
  created_at: string;
  points: number;
  num_comments: number;
}

export async function fetchHackerNews(): Promise<RawItem[]> {
  const params = new URLSearchParams({
    tags: 'story',
    hitsPerPage: String(config.hn.hitsPerPage),
    numericFilters: `points>${config.hn.minPoints}`,
  });
  const res = await fetch(`${config.hn.api}?${params}`);
  if (!res.ok) throw new Error(`HN API returned ${res.status}`);
  const data = (await res.json()) as { hits: HNHit[] };

  return data.hits
    .map((h) => ({
      title: h.title,
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      author: h.author,
      publishedAt: h.created_at,
      source: 'hackernews' as const,
      sourceName: 'hackernews',
      points: h.points,
      comments: h.num_comments,
      raw: h,
    }))
    .filter((i) => i.title);
}
