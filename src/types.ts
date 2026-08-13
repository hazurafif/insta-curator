export type Source = 'rss' | 'hackernews';

/** A raw item straight from a source, before normalization. */
export interface RawItem {
  title: string;
  url: string;
  author?: string | null;
  publishedAt?: string | null;
  source: Source;
  sourceName: string; // e.g. 'techcrunch', 'hackernews'
  summary?: string | null;
  points?: number | null;
  comments?: number | null;
  raw?: unknown;
}

export type StoryStatus =
  | 'new'
  | 'shortlisted'
  | 'approved'
  | 'posted'
  | 'rejected';

/** Normalized story that flows through the whole pipeline. */
export interface Story {
  id: string; // hash of canonical URL
  title: string;
  url: string;
  canonicalUrl: string;
  source: Source;
  sourceName: string;
  author: string | null;
  publishedAt: string | null; // ISO
  fetchedAt: string; // ISO
  score: number;
  status: StoryStatus;
  summary: string | null;
  points: number | null;
  comments: number | null;
  tags: string[];
  raw: string | null; // JSON string
}

/** LLM curation output (Bahasa Indonesia). */
export interface Curation {
  hook: string;
  summary: string;
  bullets: string[];
  caption: string;
  hashtags: string[];
  reelScript: string;
}

export interface CurationResult {
  story: Story;
  curation: Curation;
}
