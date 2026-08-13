import { createHash } from 'node:crypto';
import type { RawItem, Story } from '../types.js';
import { canonicalizeUrl } from './dedupe.js';

export function normalizeItem(item: RawItem, now = new Date()): Story {
  const canonical = canonicalizeUrl(item.url);
  const id = createHash('sha256').update(canonical).digest('hex').slice(0, 24);
  const published = item.publishedAt ? new Date(item.publishedAt) : null;

  return {
    id,
    title: item.title,
    url: item.url,
    canonicalUrl: canonical,
    source: item.source,
    sourceName: item.sourceName,
    author: item.author ?? null,
    publishedAt:
      published && !Number.isNaN(published.getTime())
        ? published.toISOString()
        : null,
    fetchedAt: now.toISOString(),
    score: 0,
    status: 'new',
    summary: item.summary ?? null,
    points: item.points ?? null,
    comments: item.comments ?? null,
    tags: [],
    raw: item.raw !== undefined ? JSON.stringify(item.raw) : null,
  };
}
