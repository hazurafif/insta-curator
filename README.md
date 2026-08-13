# insta-curator

Kurator berita teknologi otomatis yang mengubah berita (RSS, Hacker News, dan
nanti Twitter/X + Threads) menjadi postingan Instagram siap unggah: carousel
berbahasa Indonesia lengkap dengan caption dan hashtag.

## Cara kerja

1. **Kumpulkan** — ambil berita terbaru dari 6 RSS feed + Hacker News tiap 30 menit, dedupe dan skor otomatis, simpan ke SQLite.
2. **Kurasi** — LLM (DeepSeek V4 via OpenCode Go) memilih 5 berita terbaik, lalu menulis hook, caption, hashtag, dan skrip reels dalam Bahasa Indonesia.
3. **Render** — generate carousel PNG (cover foto + isi) dengan font Archivo Black, Plus Jakarta Sans, dan Space Grotesk.
4. **Review** — buka halaman review HTML: setujui atau lewati tiap post, lalu salin caption yang disetujui.
5. **Unggah** — paste ke Instagram (untuk sekarang semi-manual; auto-post via Meta Graph API direncanakan).

## Menjalankan

```bash
npm install
cp .env.example .env        # isi OPENCODE_GO_API_KEY
npm start                   # hanya ingestion
npm run curate              # ingestion + kurasi top 5 (print ke terminal)
npm run render              # ingestion + kurasi + render carousel + halaman review
npm run render:stored       # render ulang post yang sudah dikurasi (iterasi desain, tanpa biaya LLM)
npm run watch               # ingestion terjadwal (setiap 30 menit)
```

Data tersimpan di `data/stories.db` (SQLite bawaan Node).

## Struktur output

```
output/YYYY-MM-DD/
├── review.html             # halaman review: setujui, lewati, salin caption
└── post-01/
    ├── cover.png           # cover foto artikel + hook (satu-satunya slide)
    └── caption.txt         # caption bahasa Inggris + source link
```

Satu post = satu slide cover; cerita lengkapnya ada di caption (English, tanpa hashtag).

## Konfigurasi

- `src/config.ts` — daftar feed RSS, ambang skor Hacker News, branding (handle, kategori), jumlah post per hari.
- `.env` — kunci API LLM (lihat `.env.example`). DeepSeek V4 adalah reasoning model, jadi `max_tokens` (default 128000) termasuk token reasoning-nya.
- `assets/fonts/` — font yang dipakai untuk render.

## Auto-upload ke Instagram (M8)

Syarat akun: Instagram **Business/Creator** yang terhubung ke Facebook Page, dan Meta app dengan izin `instagram_content_publish`. Isi `.env`:

```
IG_USER_ID=            # numeric id akun IG (Graph API explorer → GET /me?fields=id)
IG_ACCESS_TOKEN=       # long-lived token halaman FB dengan izin publish
IG_GRAPH_VERSION=v25.0
IMAGE_HOST=catbox      # atau imgbb (isi IMGBB_API_KEY)
PUBLISH_DRY_RUN=1      # 1 = simulasi dulu; 0 = posting beneran
```

Alur:

```bash
npm run render             # generate post + review.html
npm run serve              # server lokal di http://127.0.0.1:8787
# buka http://127.0.0.1:8787/<tanggal>/review.html
# setujui → klik 🚀 Unggah (atau Unggah semua disetujui)
```

Cover di-upload ke host publik (catbox/imgbb) karena Graph API butuh `image_url` publik. Coba dry-run dulu (`PUBLISH_DRY_RUN=1`), lalu ganti ke `0` kalau sudah yakin.

## Dokumentasi

- [`.docs/PLAN.md`](.docs/PLAN.md) — arsitektur dan roadmap lengkap.
- [`.docs/RESEARCH.md`](.docs/RESEARCH.md) — riset gaya akun media Indonesia (Cretivox, Folkative, USS Feed, Jakarta Keras).
- [`.docs/MILESTONES.md`](.docs/MILESTONES.md) — status milestone.
