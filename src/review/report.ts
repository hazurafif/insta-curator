import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate an interactive review page (review.html) inside the output folder.
 * Approve/skip state in localStorage; approved posts bisa diunggah langsung
 * ke Instagram lewat server publish lokal (npm run serve).
 */
export function generateReviewReport(dir: string): string {
  const posts = readdirSync(dir)
    .filter((d) => d.startsWith('post-') && statSync(join(dir, d)).isDirectory())
    .sort();

  const dirName = dir.split('/').pop() ?? dir;

  const cards = posts
    .map((p) => {
      const postDir = join(dir, p);
      const pngs = readdirSync(postDir)
        .filter((f) => f.endsWith('.png'))
        .sort();
      const caption = readFileSync(join(postDir, 'caption.txt'), 'utf8');
      const imgs = pngs
        .map((f) => `<img src="${p}/${f}" loading="lazy" alt="${esc(f)}"/>`)
        .join('');
      return `<article class="post" data-id="${p}">
  <h2>${esc(p)}</h2>
  <div class="slides">${imgs}</div>
  <pre class="caption">${esc(caption)}</pre>
  <div class="actions">
    <button class="approve" data-id="${p}">✓ Setujui</button>
    <button class="skip" data-id="${p}">✕ Lewati</button>
    <button class="reimage" data-id="${p}">🖼️ Ambil gambar lagi</button>
    <button class="publish" data-id="${p}">🚀 Unggah</button>
    <span class="status" data-status="${p}"></span>
  </div>
</article>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Review — ${esc(dir)}</title>
<style>
  * { box-sizing: border-box; }
  body { background: #141414; color: #eee; font-family: system-ui, sans-serif; margin: 0; }
  header { position: sticky; top: 0; background: #1c1c1c; border-bottom: 1px solid #333; padding: 14px 24px; display: flex; gap: 16px; align-items: center; z-index: 10; flex-wrap: wrap; }
  header h1 { font-size: 16px; margin: 0; flex: 1; }
  #count { font-size: 14px; color: #9cf; }
  #ig-status { font-size: 12px; color: #888; }
  #ig-status.ok { color: #4ade80; }
  #ig-status.err { color: #f87171; }
  #copy { background: #2563eb; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 14px; cursor: pointer; }
  #copy:hover { background: #1d4ed8; }
  #regen { background: #6d28d9; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 14px; cursor: pointer; }
  #regen:hover { background: #5b21b6; }
  #regen:disabled { opacity: .5; cursor: wait; }
  #publish-all { background: #b45309; color: #fff; border: 0; border-radius: 8px; padding: 10px 18px; font-size: 14px; cursor: pointer; }
  #publish-all:hover { background: #92400e; }
  main { padding: 24px; max-width: 1100px; margin: 0 auto; display: flex; flex-direction: column; gap: 28px; }
  .post { background: #1a1a1a; border: 2px solid #333; border-radius: 12px; padding: 18px; transition: border-color .15s; }
  .post.approved { border-color: #22c55e; }
  .post.skipped { border-color: #444; opacity: .45; }
  .post h2 { margin: 0 0 12px; font-size: 14px; color: #9cf; }
  .slides { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 6px; }
  .slides img { height: 200px; border-radius: 8px; flex: 0 0 auto; }
  .caption { background: #101010; border: 1px solid #2a2a2a; border-radius: 8px; padding: 12px; font-size: 12.5px; line-height: 1.55; white-space: pre-wrap; max-height: 260px; overflow-y: auto; }
  .actions { display: flex; gap: 10px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
  .actions button { border: 0; border-radius: 8px; padding: 9px 16px; font-size: 13px; cursor: pointer; }
  .approve { background: #14532d; color: #bbf7d0; }
  .approve:hover { background: #166534; }
  .post.approved .approve { background: #22c55e; color: #052e16; font-weight: 700; }
  .skip { background: #3f3f46; color: #d4d4d8; }
  .skip:hover { background: #52525b; }
  .post.skipped .skip { background: #71717a; color: #18181b; font-weight: 700; }
  .publish { background: #7c2d12; color: #fed7aa; }
  .publish:hover { background: #9a3412; }
  .publish:disabled { opacity: .5; cursor: wait; }
  .publish.done { background: #16a34a; color: #fff; }
  .reimage { background: #1e3a5f; color: #bfdbfe; }
  .reimage:hover { background: #1e40af; }
  .reimage:disabled { opacity: .5; cursor: wait; }
  .reimage.done { background: #16a34a; color: #fff; }
  .status { font-size: 12px; color: #888; margin-left: auto; letter-spacing: 1px; }
  .post.approved .status { color: #4ade80; }
</style>
</head>
<body>
<header>
  <h1>Review ${esc(dir)}</h1>
  <span id="ig-status">menghubungi server…</span>
  <span id="count"></span>
  <button id="regen">🔄 Generate 5 post lagi</button>
  <button id="copy">Salin caption yang disetujui</button>
  <button id="publish-all">🚀 Unggah semua disetujui</button>
</header>
<main>
${cards}
</main>
<script>
  const KEY = 'ig-review:' + location.pathname;
  const API = 'http://127.0.0.1:8787';
  const DIR = ${JSON.stringify(dirName)};
  let state = {};
  try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const posts = document.querySelectorAll('.post');

  async function api(path, opts) {
    const r = await fetch(API + path, opts);
    return r.json();
  }

  const igStatus = document.getElementById('ig-status');
  api('/api/status').then((s) => {
    if (s.ok) {
      igStatus.textContent = s.dryRun ? 'IG: simulasi (dry-run)' : 'IG: @' + s.username;
      igStatus.classList.add('ok');
    } else {
      igStatus.textContent = s.error || 'server tidak aktif';
      igStatus.classList.add('err');
    }
  }).catch(() => {
    igStatus.textContent = 'server tidak aktif (npm run serve)';
    igStatus.classList.add('err');
  });

  function refresh() {
    let approved = 0, skipped = 0;
    posts.forEach(post => {
      const id = post.dataset.id;
      const st = state[id] || 'pending';
      post.classList.toggle('approved', st === 'approved');
      post.classList.toggle('skipped', st === 'skipped');
      post.querySelector('.status').textContent =
        st === 'approved' ? 'DISETUJUI' : st === 'skipped' ? 'DILEWATI' : 'BELUM';
      if (st === 'approved') approved++;
      if (st === 'skipped') skipped++;
    });
    document.getElementById('count').textContent =
      approved + ' disetujui · ' + skipped + ' dilewati · ' + posts.length + ' total';
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  async function publish(post, btn) {
    btn.disabled = true;
    btn.textContent = '…';
    const r = await api('/api/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: DIR, postId: post.dataset.id }),
    });
    btn.disabled = false;
    if (r.ok) {
      state[post.dataset.id + ':published'] = true;
      btn.textContent = r.dryRun ? '✓ Simulasi OK' : '✓ Terunggah';
      btn.classList.add('done');
    } else {
      btn.textContent = '✗ Gagal';
      alert('Gagal unggah: ' + (r.error || 'unknown'));
    }
    localStorage.setItem(KEY, JSON.stringify(state));
  }

  document.addEventListener('click', e => {
    const btn = e.target.closest('button.approve, button.skip');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.classList.contains('approve')) {
      state[id] = state[id] === 'approved' ? 'pending' : 'approved';
    } else {
      state[id] = state[id] === 'skipped' ? 'pending' : 'skipped';
    }
    refresh();
  });

  document.addEventListener('click', e => {
    const btn = e.target.closest('button.publish');
    if (!btn) return;
    publish(btn.closest('.post'), btn);
  });

  document.addEventListener('click', async e => {
    const btn = e.target.closest('button.reimage');
    if (!btn) return;
    const post = btn.closest('.post');
    btn.disabled = true;
    btn.textContent = '…';
    const r = await api('/api/reimage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: DIR, postId: post.dataset.id }),
    });
    btn.disabled = false;
    if (r.ok) {
      btn.textContent = r.hasImage ? '✓ Foto didapat' : 'Tetap tanpa foto';
      btn.classList.add('done');
      const img = post.querySelector('.slides img');
      if (img) img.src = img.src.split('?')[0] + '?t=' + Date.now();
    } else {
      btn.textContent = '✗ Gagal';
      alert('Gagal ambil gambar: ' + (r.error || 'unknown'));
    }
  });

  document.getElementById('regen').addEventListener('click', async () => {
    const btn = document.getElementById('regen');
    btn.disabled = true;
    btn.textContent = '⏳ Generate… (1-2 menit)';
    try {
      const r = await api('/api/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: DIR, count: 5 }),
      });
      if (r.ok) {
        location.reload();
      } else {
        btn.disabled = false;
        btn.textContent = '🔄 Generate 5 post lagi';
        alert('Gagal generate: ' + (r.error || 'unknown'));
      }
    } catch (err) {
      btn.disabled = false;
      btn.textContent = '🔄 Generate 5 post lagi';
      alert('Server tidak jalan? npm run serve');
    }
  });

  document.getElementById('publish-all').addEventListener('click', async () => {
    const approved = [...posts].filter(p => state[p.dataset.id] === 'approved');
    if (!approved.length) { alert('Setujui dulu post yang mau diunggah.'); return; }
    for (const post of approved) {
      const btn = post.querySelector('button.publish');
      await publish(post, btn);
    }
  });

  document.getElementById('copy').addEventListener('click', async () => {
    const parts = [];
    posts.forEach(post => {
      if (state[post.dataset.id] === 'approved') {
        parts.push(post.querySelector('.caption').textContent.trim());
      }
    });
    if (!parts.length) { alert('Belum ada post yang disetujui.'); return; }
    await navigator.clipboard.writeText(parts.join('\\n\\n──────────\\n\\n'));
    alert(parts.length + ' caption disalin ke clipboard!');
  });

  refresh();
</script>
</body>
</html>`;

  const file = join(dir, 'review.html');
  writeFileSync(file, html);
  return file;
}
