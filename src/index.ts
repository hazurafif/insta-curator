import cron from 'node-cron';
import { config } from './config.js';
import { Store } from './ingest/store.js';
import { runIngestion } from './ingest/run.js';
import { curateTopStories } from './llm/curate.js';
import { renderCarousels } from './render/carousel.js';

interface Mode {
  curate: boolean;
  render: boolean;
  renderStored: boolean;
}

async function run(mode: Mode): Promise<void> {
  const store = new Store(config.dbPath);
  try {
    if (mode.renderStored) {
      const stored = store.listShortlistedWithCuration(config.curateCount);
      if (!stored.length) {
        console.log('No shortlisted stories with curation yet — run `npm run render` first.');
        return;
      }
      const outDir = await renderCarousels(stored, 'output/design-v5');
      console.log(`\n🖼️  Render ulang ${stored.length} post ke: ${outDir}`);
      console.log(`📋 Halaman review: ${outDir}/review.html`);
      return;
    }

    const res = await runIngestion(store);
    const total = store.count();
    console.log(
      `fetched=${res.fetched} added=${res.added} dupUrl=${res.dupUrl} dupTitle=${res.dupTitle} errors=${res.errors} total=${total}`,
    );

    if (mode.curate || mode.render) {
      const results = await curateTopStories(store, config.curateCount);

      if (mode.curate) {
        console.log(`\n=== KURASI (${results.length} post) ===\n`);
        for (const { story, curation } of results) {
          console.log('────────────────────────────────────────');
          console.log(`📰 ${story.title}`);
          console.log(`🔗 ${story.url}`);
          console.log(`\n🔥 HOOK: ${curation.hook}`);
          console.log(`\n📝 CAPTION:\n${curation.caption}`);
          console.log(`\n#️⃣ HASHTAGS: ${curation.hashtags.map((h) => '#' + h).join(' ')}`);
          console.log(`\n🎬 REEL SCRIPT:\n${curation.reelScript}`);
          console.log();
        }
      }

      if (mode.render) {
        const outDir = await renderCarousels(results);
        console.log(`\n🖼️  Carousel PNGs written to: ${outDir}`);
        console.log(`📋 Halaman review: ${outDir}/review.html`);
      }
    }
  } finally {
    store.close();
  }
}

const mode: Mode = {
  curate: process.argv.includes('--curate'),
  render: process.argv.includes('--render'),
  renderStored: process.argv.includes('--render-stored'),
};
const watch = process.argv.includes('--watch');

if (watch) {
  cron.schedule(config.cron, () => {
    run(mode).catch(console.error);
  });
  console.log(`Scheduler started (${config.cron})`);
  run(mode).catch(console.error);
} else {
  run(mode).catch(console.error);
}
