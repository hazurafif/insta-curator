import { createServer } from 'node:http';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { getIgAccount, publishImage } from './instagram.js';
import { config } from '../config.js';
import { Store } from '../ingest/store.js';
import { runIngestion } from '../ingest/run.js';
import { curateTopStories } from '../llm/curate.js';
import { renderCarousels, renderCover } from '../render/carousel.js';
import { clearImageCache } from '../render/image.js';
import type { Curation, Story } from '../types.js';

const PORT = Number(process.env.PORT ?? 8787);
const OUTPUT_DIR = resolve(process.cwd(), 'output');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
};

async function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  let body = '';
  for await (const chunk of req) body += chunk;
  return body;
}

const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url ?? '/', 'http://127.0.0.1');

  try {
    if (url.pathname === '/api/status' && req.method === 'GET') {
      const status = await getIgAccount();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(status));
    }

    // Generate draft post baru (ingest + kurasi + render, auto-append).
    if (url.pathname === '/api/regenerate' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as {
        date?: string;
        count?: number;
      };
      const date = body.date ?? new Date().toISOString().slice(0, 10);
      const count = Math.min(Math.max(body.count ?? config.curateCount, 1), 10);
      if (!/^[\w.-]+$/.test(date)) throw new Error('param date tidak valid');

      const store = new Store(config.dbPath);
      try {
        const ing = await runIngestion(store);
        const results = await curateTopStories(store, count);
        const dir = join(OUTPUT_DIR, date);
        await renderCarousels(results, dir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(
          JSON.stringify({
            ok: true,
            fetched: ing.fetched,
            added: ing.added,
            posts: results.map((r) => r.story.title),
          }),
        );
      } finally {
        store.close();
      }
    }

    // Coba ambil gambar artikel lagi untuk satu post, lalu re-render cover.
    if (url.pathname === '/api/reimage' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as {
        date?: string;
        postId?: string;
      };
      const date = body.date ?? '';
      const postId = body.postId ?? '';
      if (!/^[\w.-]+$/.test(date) || !/^post-\d+$/.test(postId)) {
        throw new Error('param date/postId tidak valid');
      }

      const dir = join(OUTPUT_DIR, date, postId);
      const meta = JSON.parse(
        readFileSync(join(dir, 'meta.json'), 'utf8'),
      ) as { story: Story; curation: Curation };

      clearImageCache(meta.story.id);
      const hasImage = await renderCover(
        meta.story,
        meta.curation,
        join(dir, 'cover.png'),
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ ok: true, hasImage }));
    }

    if (url.pathname === '/api/publish' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req)) as {
        date?: string;
        postId?: string;
      };
      const date = body.date ?? '';
      const postId = body.postId ?? '';
      if (!/^[\w.-]+$/.test(date) || !/^post-\d+$/.test(postId)) {
        throw new Error('param date/postId tidak valid');
      }

      const dir = join(OUTPUT_DIR, date, postId);
      const imgPath = join(dir, 'cover.png');
      const captionPath = join(dir, 'caption.txt');
      if (!existsSync(imgPath)) throw new Error(`cover.png tidak ada di ${dir}`);
      if (!existsSync(captionPath)) throw new Error(`caption.txt tidak ada di ${dir}`);

      const caption = readFileSync(captionPath, 'utf8').trim();
      const result = await publishImage(imgPath, caption);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    // Static files di bawah output/.
    if (url.pathname === '/') {
      const dates = readdirSync(OUTPUT_DIR)
        .filter((d) => statSync(join(OUTPUT_DIR, d)).isDirectory())
        .sort()
        .reverse();
      const links = dates
        .map((d) => `<li><a href="/${d}/review.html">${d}</a></li>`)
        .join('');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(
        `<!doctype html><html><head><meta charset="utf-8"/><title>insta-curator</title></head>` +
          `<body style="background:#141414;color:#eee;font-family:system-ui;padding:24px">` +
          `<h1>insta-curator</h1><ul>${links || '<li>belum ada output</li>'}</ul></body></html>`,
      );
    }

    const rel = decodeURIComponent(url.pathname.slice(1));
    const file = normalize(join(OUTPUT_DIR, rel));
    if (!file.startsWith(OUTPUT_DIR + '/') && file !== OUTPUT_DIR) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    return res.end(readFileSync(file));
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: false, error: (e as Error).message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`insta-curator server jalan di http://127.0.0.1:${PORT}/`);
  console.log(`(dry-run: ${(process.env.PUBLISH_DRY_RUN ?? '1') !== '0' ? 'AKTIF — tidak posting beneran' : 'MATI — posting sungguhan'})`);
});
