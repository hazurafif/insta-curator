import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Curation, CurationResult, Story } from '../types.js';

interface StoryRow {
  id: string;
  title: string;
  url: string;
  canonical_url: string;
  source: string;
  source_name: string;
  author: string | null;
  published_at: string | null;
  fetched_at: string;
  score: number;
  status: string;
  summary: string | null;
  points: number | null;
  comments: number | null;
  tags: string | null;
  raw: string | null;
  curation: string | null;
}

function rowToStory(r: StoryRow): Story {
  return {
    id: r.id,
    title: r.title,
    url: r.url,
    canonicalUrl: r.canonical_url,
    source: r.source as Story['source'],
    sourceName: r.source_name,
    author: r.author,
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
    score: r.score,
    status: r.status as Story['status'],
    summary: r.summary,
    points: r.points,
    comments: r.comments,
    tags: r.tags ? (JSON.parse(r.tags) as string[]) : [],
    raw: r.raw,
  };
}

export class Store {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        canonical_url TEXT NOT NULL UNIQUE,
        source TEXT NOT NULL,
        source_name TEXT NOT NULL,
        author TEXT,
        published_at TEXT,
        fetched_at TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'new',
        summary TEXT,
        points INTEGER,
        comments INTEGER,
        tags TEXT,
        raw TEXT,
        curation TEXT
      );
    `);
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);`,
    );
    this.db.exec(
      `CREATE INDEX IF NOT EXISTS idx_stories_fetched ON stories(fetched_at);`,
    );
    // Migration for pre-existing DBs created before the curation column existed.
    this.ensureColumn('curation', 'TEXT');
  }

  private ensureColumn(name: string, ddl: string): void {
    const cols = this.db
      .prepare('PRAGMA table_info(stories)')
      .all() as unknown as { name: string }[];
    if (!cols.some((c) => c.name === name)) {
      this.db.exec(`ALTER TABLE stories ADD COLUMN ${name} ${ddl}`);
    }
  }

  /** Save curation output and mark the story as shortlisted. */
  setCuration(id: string, curationJson: string): void {
    this.db
      .prepare("UPDATE stories SET curation = ?, status = 'shortlisted' WHERE id = ?")
      .run(curationJson, id);
  }

  findByCanonicalUrl(canonicalUrl: string): Story | null {
    const row = this.db
      .prepare('SELECT * FROM stories WHERE canonical_url = ?')
      .get(canonicalUrl) as unknown as StoryRow | undefined;
    return row ? rowToStory(row) : null;
  }

  /** Recent titles, used for fuzzy title dedup. */
  listRecentTitles(maxAgeDays: number): { title: string }[] {
    const since = new Date(Date.now() - maxAgeDays * 24 * 3_600_000).toISOString();
    return this.db
      .prepare('SELECT title FROM stories WHERE fetched_at >= ? ORDER BY fetched_at DESC LIMIT 5000')
      .all(since) as unknown as { title: string }[];
  }

  insert(s: Story): void {
    this.db
      .prepare(
        `INSERT INTO stories
          (id, title, url, canonical_url, source, source_name, author,
           published_at, fetched_at, score, status, summary, points, comments, tags, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.id,
        s.title,
        s.url,
        s.canonicalUrl,
        s.source,
        s.sourceName,
        s.author,
        s.publishedAt,
        s.fetchedAt,
        s.score,
        s.status,
        s.summary,
        s.points,
        s.comments,
        JSON.stringify(s.tags),
        s.raw,
      );
  }

  listNew(limit = 10): Story[] {
    const rows = this.db
      .prepare('SELECT * FROM stories WHERE status = ? ORDER BY score DESC, published_at DESC LIMIT ?')
      .all('new', limit) as unknown as StoryRow[];
    return rows.map(rowToStory);
  }

  /** Stored curation results — used to re-render without re-running the LLM. */
  listShortlistedWithCuration(limit = 20): CurationResult[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM stories WHERE status = 'shortlisted' AND curation IS NOT NULL ORDER BY score DESC LIMIT ?",
      )
      .all(limit) as unknown as StoryRow[];
    return rows.map((r) => ({
      story: rowToStory(r),
      curation: JSON.parse(r.curation as string) as Curation,
    }));
  }

  count(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM stories')
      .get() as unknown as { c: number };
    return row.c;
  }

  close(): void {
    this.db.close();
  }
}
