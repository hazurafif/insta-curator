import Parser from 'rss-parser';
import type { RawItem } from '../types.js';

const parser = new Parser({ timeout: 15000 });

export async function fetchFeed(name: string, url: string): Promise<RawItem[]> {
  const feed = await parser.parseURL(url);
  return (feed.items ?? [])
    .map((it) => ({
      title: it.title?.trim() ?? '',
      url: it.link ?? '',
      author: it.creator ?? null,
      publishedAt: it.isoDate ?? it.pubDate ?? null,
      source: 'rss' as const,
      sourceName: name,
      summary: it.contentSnippet ?? null,
      raw: it,
    }))
    .filter((i) => i.title && i.url);
}
