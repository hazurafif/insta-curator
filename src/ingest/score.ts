import type { Story } from '../types.js';
import { config } from '../config.js';

const HOUR = 3_600_000;

/** Simple relevance score (M1). LLM-based scoring replaces this in M2. */
export function scoreStory(s: Story): number {
  let score = 50;

  // Source authority weight.
  const weight = config.sourceWeights[s.source] ?? 1;
  score += weight * 10;

  // Freshness: prefer the last 24h, linear decay.
  if (s.publishedAt) {
    const age = Date.now() - new Date(s.publishedAt).getTime();
    if (age >= 0 && age < 24 * HOUR) {
      score += 20 * (1 - age / (24 * HOUR));
    }
  }

  // Social signal (Hacker News points).
  const points = s.points ?? 0;
  if (points > 0) score += Math.min(20, Math.log10(points + 1) * 10);

  return Math.round(score * 100) / 100;
}
